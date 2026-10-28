"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/roles";

export interface SystemAuditRow {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  actorName: string;
  actorEmail: string;
  thesisTitle: string;
}

export interface AuditLogsResult {
  items: SystemAuditRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface CachedAudit {
  result: AuditLogsResult;
  timestamp: number;
}
const auditLogsCache = new Map<string, CachedAudit>();
const AUDIT_CACHE_TTL_MS = 15000;

export async function getAuditLogs(params: {
  page?: number;
  pageSize?: number;
  action?: string;
  search?: string;
} = {}): Promise<AuditLogsResult> {
  await requireRole(["librarian", "admin", "super_admin"]);

  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(10, params.pageSize || 25));
  const cacheKey = `${page}:${pageSize}:${params.action || ""}:${params.search || ""}`;
  const now = Date.now();

  const cached = auditLogsCache.get(cacheKey);
  if (cached && now - cached.timestamp < AUDIT_CACHE_TTL_MS) {
    return cached.result;
  }

  const admin = createAdminClient();

  let query = admin
    .from("activity_logs")
    .select(
      `
      id,
      action,
      from_status,
      to_status,
      reason,
      metadata,
      created_at,
      actor:profiles!activity_logs_actor_id_fkey(full_name, email),
      thesis:theses!activity_logs_thesis_id_fkey(title)
    `,
      { count: params.search || (params.action && params.action !== "all") ? "exact" : "estimated" },
    )
    .order("created_at", { ascending: false });

  if (params.action && params.action !== "all") {
    query = query.eq("action", params.action);
  }

  if (params.search && params.search.trim()) {
    const term = `%${params.search.trim()}%`;
    query = query.or(`reason.ilike.${term},action.ilike.${term}`);
  }

  const fromIndex = (page - 1) * pageSize;
  const toIndex = fromIndex + pageSize - 1;
  query = query.range(fromIndex, toIndex);

  const { data: rawRows, count, error } = await query;

  if (error) {
    console.error("Audit log query error:", error);
    throw new Error("Failed to load audit logs");
  }

  const total = count || 0;
  const items: SystemAuditRow[] = (rawRows || []).map((row) => {
    const rawActor = row.actor as unknown;
    const actorName =
      rawActor && typeof rawActor === "object" && "full_name" in rawActor
        ? String((rawActor as { full_name: string }).full_name)
        : "System";
    const actorEmail =
      rawActor && typeof rawActor === "object" && "email" in rawActor
        ? String((rawActor as { email: string }).email)
        : "";

    const rawThesis = row.thesis as unknown;
    const thesisTitle =
      rawThesis && typeof rawThesis === "object" && "title" in rawThesis
        ? String((rawThesis as { title: string }).title)
        : "Institutional Record";

    return {
      id: row.id,
      action: row.action,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      reason: row.reason,
      metadata: (row.metadata as Record<string, unknown>) || {},
      createdAt: row.created_at,
      actorName,
      actorEmail,
      thesisTitle,
    };
  });

  const result: AuditLogsResult = {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };

  auditLogsCache.set(cacheKey, { result, timestamp: Date.now() });
  return result;
}
