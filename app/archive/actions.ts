"use server";

import { createAdminClient } from "../../lib/supabase/admin.ts";
import {
  buildSearchQueryHash,
  getCachedSearchResults,
  setCachedSearchResults,
  onSearchCacheInvalidated,
} from "../../lib/search/cache.ts";

export interface PublicThesisItem {
  id: string;
  title: string;
  abstract: string; // Truncated to 200 chars per SPEC
  department: string;
  program: string;
  keywords: string[];
  authorNames: string[];
  year: number | null;
  doi: string | null;
  license: string | null;
  publishedAt: string | null;
}

export interface FacetCount<T = string> {
  value: T;
  count: number;
}

export interface ArchiveSearchFacets {
  departments: FacetCount<string>[];
  programs: FacetCount<string>[];
  years: FacetCount<number>[];
  licenses: FacetCount<string>[];
}

export interface ArchiveSearchParams {
  query?: string;
  department?: string;
  program?: string;
  year?: number;
  license?: string;
  page?: number;
  pageSize?: number;
  sortBy?: "newest" | "oldest" | "title";
}

export interface ArchiveSearchResult {
  items: PublicThesisItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  facets: ArchiveSearchFacets;
  cached: boolean;
  durationMs: number;
}

export interface PublicThesisDetail {
  id: string;
  title: string;
  abstract: string; // Full abstract
  department: string;
  program: string;
  keywords: string[];
  authorNames: string[];
  year: number | null;
  doi: string | null;
  license: string | null;
  publishedAt: string | null;
  hasPdf: boolean;
}

let cachedFacets: { facets: ArchiveSearchFacets; fetchedAt: number } | null = null;
const FACETS_TTL_MS = 60000; // 60s memory TTL for static catalog facets

// Hook into version bump invalidation
onSearchCacheInvalidated(() => {
  cachedFacets = null;
});

export async function invalidateFacetsCache() {
  cachedFacets = null;
}

async function getFacets(
  admin: ReturnType<typeof createAdminClient>,
  nowIso: string,
): Promise<ArchiveSearchFacets> {
  const now = Date.now();
  if (cachedFacets && now - cachedFacets.fetchedAt < FACETS_TTL_MS) {
    return cachedFacets.facets;
  }

  const { data: facetRows, error } = await admin
    .from("theses")
    .select("department, program, year, license")
    .eq("status", "published")
    .eq("is_confidential", false)
    .or(`embargo_until.is.null,embargo_until.lte.${nowIso}`);

  if (error) {
    console.warn("Facet calculation warning:", error);
    if (cachedFacets) return cachedFacets.facets;
  }

  const deptCounts = new Map<string, number>();
  const progCounts = new Map<string, number>();
  const yearCounts = new Map<number, number>();
  const licenseCounts = new Map<string, number>();

  for (const row of facetRows || []) {
    if (row.department) {
      deptCounts.set(row.department, (deptCounts.get(row.department) || 0) + 1);
    }
    if (row.program) {
      progCounts.set(row.program, (progCounts.get(row.program) || 0) + 1);
    }
    if (row.year) {
      yearCounts.set(row.year, (yearCounts.get(row.year) || 0) + 1);
    }
    if (row.license) {
      licenseCounts.set(row.license, (licenseCounts.get(row.license) || 0) + 1);
    }
  }

  const facets: ArchiveSearchFacets = {
    departments: Array.from(deptCounts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count),
    programs: Array.from(progCounts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count),
    years: Array.from(yearCounts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.value - a.value),
    licenses: Array.from(licenseCounts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count),
  };

  cachedFacets = { facets, fetchedAt: now };
  return facets;
}

/**
 * Searches public archive using versioned Redis cache-aside.
 * Per SPEC: Reads only denormalized columns of theses and truncates abstracts.
 */
export async function searchArchiveTheses(
  params: ArchiveSearchParams = {},
): Promise<ArchiveSearchResult> {
  const startTime = performance.now();

  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(50, Math.max(1, params.pageSize || 12));
  const sortBy = params.sortBy || "newest";

  // Build deterministic query hash for Redis cache-aside lookup
  const queryHash = buildSearchQueryHash({
    q: params.query,
    dept: params.department,
    prog: params.program,
    yr: params.year,
    lic: params.license,
    p: page,
    ps: pageSize,
    sort: sortBy,
  });

  // 1. Attempt Redis Cache Lookup
  const cached = await getCachedSearchResults<ArchiveSearchResult>(queryHash);
  if (cached) {
    const elapsed = Math.round(performance.now() - startTime);
    return {
      ...cached,
      cached: true,
      durationMs: elapsed,
    };
  }

  // 2. Cache Miss: Execute optimized Postgres query against published theses
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  // Base query: strictly published, non-confidential, embargo-expired
  let query = admin
    .from("theses")
    .select(
      "id, title, abstract, department, program, keywords, author_names, year, doi, license, published_at",
      { count: "estimated" },
    )
    .eq("status", "published")
    .eq("is_confidential", false)
    .or(`embargo_until.is.null,embargo_until.lte.${nowIso}`);

  if (params.department && params.department !== "all") {
    query = query.eq("department", params.department);
  }

  if (params.program && params.program !== "all") {
    query = query.eq("program", params.program);
  }

  if (
    params.year !== undefined &&
    params.year !== null &&
    !Number.isNaN(Number(params.year)) &&
    Number.isInteger(Number(params.year)) &&
    Number(params.year) > 1900
  ) {
    query = query.eq("year", Number(params.year));
  }

  if (params.license && params.license !== "all") {
    query = query.eq("license", params.license);
  }

  if (params.query && params.query.trim()) {
    const cleanQ = params.query.trim();
    const words = cleanQ.split(/\s+/).filter(Boolean);
    for (const w of words) {
      query = query.or(
        `title.ilike.%${w}%,abstract.ilike.%${w}%,department.ilike.%${w}%,program.ilike.%${w}%`,
      );
    }
  }

  // Sorting
  if (sortBy === "oldest") {
    query = query.order("published_at", { ascending: true, nullsFirst: false });
  } else if (sortBy === "title") {
    query = query.order("title", { ascending: true });
  } else {
    // Newest first default
    query = query.order("published_at", { ascending: false, nullsFirst: false });
  }

  // Pagination
  const fromIndex = (page - 1) * pageSize;
  const toIndex = fromIndex + pageSize - 1;
  query = query.range(fromIndex, toIndex);

  // Execute data query and facet calculation concurrently
  const [queryResult, facets] = await Promise.all([
    query,
    getFacets(admin, nowIso),
  ]);

  const { data: rawTheses, count, error } = queryResult;

  if (error) {
    console.error("Archive search query error:", error);
    throw new Error(`Search failed: ${error.message}`);
  }

  const rawCount = rawTheses ? rawTheses.length : 0;
  // If first page and returned rows < pageSize, total is exactly rawCount
  const total = rawCount < pageSize && page === 1 ? rawCount : (count ?? (fromIndex + rawCount));
  const totalPages = Math.ceil(total / pageSize);

  // Truncate abstracts to 200 chars per SPEC
  const items: PublicThesisItem[] = (rawTheses || []).map((t) => {
    const rawAbstract = t.abstract || "";
    const truncatedAbstract =
      rawAbstract.length > 200
        ? `${rawAbstract.slice(0, 200).trim()}...`
        : rawAbstract;

    return {
      id: t.id,
      title: t.title,
      abstract: truncatedAbstract,
      department: t.department,
      program: t.program,
      keywords: t.keywords || [],
      authorNames: t.author_names || [],
      year: t.year,
      doi: t.doi,
      license: t.license,
      publishedAt: t.published_at,
    };
  });

  const elapsed = Math.round(performance.now() - startTime);
  const result: ArchiveSearchResult = {
    items,
    total,
    page,
    pageSize,
    totalPages,
    facets,
    cached: false,
    durationMs: elapsed,
  };

  // 4. Store in Redis cache-aside (1 hour TTL per SPEC)
  // Ensure no signed URLs or secrets are inside
  await setCachedSearchResults(queryHash, result, 3600);

  return result;
}

/**
 * Fetches full details for a single published thesis for preview drawer and citations.
 */
export async function getPublicThesisDetail(
  id: string,
): Promise<PublicThesisDetail | null> {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!id || !UUID_REGEX.test(id)) {
    return null;
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: thesis, error } = await admin
    .from("theses")
    .select(`
      id,
      title,
      abstract,
      department,
      program,
      keywords,
      author_names,
      year,
      doi,
      license,
      published_at,
      status,
      is_confidential,
      embargo_until,
      versions:thesis_versions(id)
    `)
    .eq("id", id)
    .single();

  if (error || !thesis) {
    return null;
  }

  // Strict public criteria check
  if (
    thesis.status !== "published" ||
    thesis.is_confidential ||
    (thesis.embargo_until && new Date(thesis.embargo_until) > new Date(nowIso))
  ) {
    return null;
  }

  return {
    id: thesis.id,
    title: thesis.title,
    abstract: thesis.abstract || "",
    department: thesis.department,
    program: thesis.program,
    keywords: thesis.keywords || [],
    authorNames: thesis.author_names || [],
    year: thesis.year,
    doi: thesis.doi,
    license: thesis.license,
    publishedAt: thesis.published_at,
    hasPdf: (thesis.versions?.length || 0) > 0,
  };
}


