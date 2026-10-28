import type { Metadata } from "next";
import { connection } from "next/server";
import { searchArchiveTheses } from "@/app/archive/actions";
import { ArchiveClient } from "@/app/archive/archive-client";

export const instant = false;

export const metadata: Metadata = {
  title: "PECIT Thesis Archive | Institutional Research Repository",
  description:
    "Explore peer-reviewed undergraduate capstones, technical manuscripts, and scholarly research from the Philippine Electronics and Communication Institute of Technology.",
};

interface RootPageProps {
  searchParams: Promise<{
    q?: string;
    dept?: string;
    prog?: string;
    yr?: string;
    lic?: string;
    view?: "grid" | "list";
    sort?: "newest" | "oldest" | "title";
    p?: string;
  }>;
}

export default async function RootArchivePage({ searchParams }: RootPageProps) {
  await connection();
  const params = await searchParams;

  const query = typeof params.q === "string" ? params.q : undefined;
  const department = typeof params.dept === "string" ? params.dept : undefined;
  const program = typeof params.prog === "string" ? params.prog : undefined;
  const year =
    params.yr && !Number.isNaN(Number(params.yr))
      ? parseInt(params.yr, 10)
      : undefined;
  const license = typeof params.lic === "string" ? params.lic : undefined;
  const view = params.view === "list" ? "list" : "grid";
  const sortBy =
    params.sort === "oldest" || params.sort === "title"
      ? params.sort
      : "newest";
  const page = params.p ? parseInt(params.p, 10) : 1;

  // Initial SSR search query & dynamic departments
  const supabase = await (await import("@/lib/supabase/server")).createClient();
  const [{ data: deptRows }, initialResult] = await Promise.all([
    supabase.from("departments").select("name").order("name", { ascending: true }),
    searchArchiveTheses({
      query,
      department,
      program,
      year,
      license,
      sortBy,
      page,
      pageSize: 12,
    }),
  ]);

  const availableDepartments = (deptRows || []).map((d: { name: string }) => d.name);

  return (
    <ArchiveClient
      initialResult={initialResult}
      initialParams={{
        query,
        department,
        program,
        year,
        license,
        view,
        sortBy,
        page,
      }}
      availableDepartments={availableDepartments}
    />
  );
}
