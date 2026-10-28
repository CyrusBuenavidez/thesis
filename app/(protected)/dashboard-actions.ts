"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface DashboardKPIs {
  totalTheses: number;
  publishedCount: number;
  underReviewCount: number;
  acceptedCount: number;
  revisionRequestedCount: number;
  rejectedCount: number;
  confidentialCount: number;
  activeStudents: number;
  activeFaculty: number;
  departmentCounts: { department: string; count: number }[];
  recentTheses: {
    id: string;
    title: string;
    department: string;
    status: string;
    authorNames: string[];
    createdAt: string;
  }[];
  recentActivities: {
    id: string;
    action: string;
    fromStatus: string | null;
    toStatus: string | null;
    reason: string | null;
    createdAt: string;
    thesisTitle: string;
    actorName: string;
  }[];
}

import { requireRole } from "@/lib/auth/roles";

let cachedDashboardKPIs: { data: DashboardKPIs; timestamp: number } | null = null;
const DASHBOARD_CACHE_TTL_MS = 15000; // 15 seconds

function invalidateDashboardCache() {
  cachedDashboardKPIs = null;
}

export async function getDashboardData(): Promise<DashboardKPIs> {
  const now = Date.now();
  if (cachedDashboardKPIs && now - cachedDashboardKPIs.timestamp < DASHBOARD_CACHE_TTL_MS) {
    return cachedDashboardKPIs.data;
  }

  await requireRole(["admin", "super_admin"]);
  const admin = createAdminClient();

  // Execute metrics queries concurrently
  const [thesesRes, studentRes, facultyRes, activitiesRes] = await Promise.all([
    admin
      .from("theses")
      .select("id, title, status, department, is_confidential, author_names, created_at")
      .order("created_at", { ascending: false }),
    admin
      .from("profiles")
      .select("id", { count: "estimated", head: true })
      .eq("role", "student")
      .eq("status", "active"),
    admin
      .from("profiles")
      .select("id", { count: "estimated", head: true })
      .in("role", ["advisor", "admin", "super_admin"])
      .eq("status", "active"),
    admin
      .from("activity_logs")
      .select(`
        id,
        action,
        from_status,
        to_status,
        reason,
        created_at,
        actor:profiles!activity_logs_actor_id_fkey(full_name),
        thesis:theses!activity_logs_thesis_id_fkey(title)
      `)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  if (thesesRes.error) {
    console.error("Dashboard query error:", thesesRes.error);
    throw new Error("Failed to load dashboard metrics");
  }

  const allTheses = thesesRes.data || [];
  const studentCount = studentRes.count || 0;
  const facultyCount = facultyRes.count || 0;
  const rawActivities = activitiesRes.data || [];

  let publishedCount = 0;
  let underReviewCount = 0;
  let acceptedCount = 0;
  let revisionRequestedCount = 0;
  let rejectedCount = 0;
  let confidentialCount = 0;

  const deptMap = new Map<string, number>();

  for (const t of allTheses) {
    if (t.status === "published") publishedCount++;
    if (t.status === "under_review" || t.status === "submitted") underReviewCount++;
    if (t.status === "accepted") acceptedCount++;
    if (t.status === "revision_requested") revisionRequestedCount++;
    if (t.status === "rejected") rejectedCount++;
    if (t.is_confidential) confidentialCount++;

    if (t.department) {
      deptMap.set(t.department, (deptMap.get(t.department) || 0) + 1);
    }
  }

  const recentActivities = (rawActivities || []).map((a) => {
    const rawActor = a.actor as unknown;
    const actorName =
      rawActor && typeof rawActor === "object" && "full_name" in rawActor
        ? String((rawActor as { full_name: string }).full_name)
        : "System";

    const rawThesis = a.thesis as unknown;
    const thesisTitle =
      rawThesis && typeof rawThesis === "object" && "title" in rawThesis
        ? String((rawThesis as { title: string }).title)
        : "Institutional Manuscript";

    return {
      id: a.id,
      action: a.action,
      fromStatus: a.from_status,
      toStatus: a.to_status,
      reason: a.reason,
      createdAt: a.created_at,
      thesisTitle,
      actorName,
    };
  });

  const result: DashboardKPIs = {
    totalTheses: allTheses.length,
    publishedCount,
    underReviewCount,
    acceptedCount,
    revisionRequestedCount,
    rejectedCount,
    confidentialCount,
    activeStudents: studentCount || 0,
    activeFaculty: facultyCount || 0,
    departmentCounts: Array.from(deptMap.entries())
      .map(([department, count]) => ({ department, count }))
      .sort((a, b) => b.count - a.count),
    recentTheses: allTheses.slice(0, 6).map((t) => ({
      id: t.id,
      title: t.title,
      department: t.department,
      status: t.status,
      authorNames: t.author_names || [],
      createdAt: t.created_at,
    })),
    recentActivities,
  };

  cachedDashboardKPIs = { data: result, timestamp: now };
  return result;
}
