import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { requireUser, getUserLandingRoute } from "@/lib/auth/roles";
import { getDashboardData } from "../dashboard-actions";

export const instant = false;

export default async function DashboardPage() {
  await connection();
  const profile = await requireUser();
  if (profile.role !== "admin" && profile.role !== "super_admin") {
    redirect(getUserLandingRoute(profile.role));
  }

  const data = await getDashboardData();

  return (
    <div className="space-y-8">
      {/* 1. Header Banner & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">
            Institutional Research Repository
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Repository Executive Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Real-time telemetry on institutional thesis submissions, review queues, and published works.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <a
            href="/api/reports/export"
            download
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all"
            title="Download CSV Report (500-chunk UTF-8 BOM formatted for Excel)"
          >
            <span>📊</span> Export CSV Report
          </a>
          <Link
            href="/thesis-management"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all"
          >
            <span>📝</span> Submit Thesis
          </Link>
          <Link
            href="/review-manager"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white shadow-sm transition-all"
          >
            <span>⚖️</span> Review Queue
          </Link>
        </div>
      </div>

      {/* 2. Top-Level KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Total Theses */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm space-y-2 min-w-0">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Total Manuscripts</span>
            <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              📚
            </span>
          </div>
          <div className="text-3xl font-black text-slate-900 tracking-tight">
            {data.totalTheses}
          </div>
          <div className="text-xs text-slate-500 flex items-center gap-1">
            <span>Across all departments</span>
          </div>
        </div>

        {/* Published Manuscripts */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm space-y-2 min-w-0">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Published in Archive</span>
            <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              🌐
            </span>
          </div>
          <div className="text-3xl font-black text-emerald-600 tracking-tight">
            {data.publishedCount}
          </div>
          <div className="text-xs text-slate-500 truncate">
            Open Access in{" "}
            <Link href="/" className="text-blue-600 hover:underline font-semibold">
              Public Archive →
            </Link>
          </div>
        </div>

        {/* In Review & Revisions */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm space-y-2 min-w-0">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Active Review Pipeline</span>
            <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              ⏳
            </span>
          </div>
          <div className="text-3xl font-black text-amber-600 tracking-tight">
            {data.underReviewCount + data.revisionRequestedCount}
          </div>
          <div className="text-xs text-slate-500 truncate">
            {data.underReviewCount} Under Review • {data.revisionRequestedCount} Revisions
          </div>
        </div>

        {/* Researchers & Faculty */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm space-y-2 min-w-0">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Verified Researchers</span>
            <span className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              👥
            </span>
          </div>
          <div className="text-3xl font-black text-slate-900 tracking-tight">
            {data.activeStudents + data.activeFaculty}
          </div>
          <div className="text-xs text-slate-500">
            {data.activeStudents} Authors • {data.activeFaculty} Faculty &amp; Staff
          </div>
        </div>
      </div>

      {/* 3. Analytics & Distribution Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 min-w-0">
        {/* Status Lifecycle Breakdown */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-sm space-y-4 min-w-0">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span>📈</span> Lifecycle State Distribution
            </h2>
            <span className="text-xs text-slate-400">Total: {data.totalTheses}</span>
          </div>

          <div className="space-y-3 pt-2">
            {[
              { label: "Published", count: data.publishedCount, color: "bg-emerald-500", text: "text-emerald-700" },
              { label: "Under Review / Submitted", count: data.underReviewCount, color: "bg-blue-500", text: "text-blue-700" },
              { label: "Revision Requested", count: data.revisionRequestedCount, color: "bg-amber-500", text: "text-amber-700" },
              { label: "Accepted (Pre-Publication)", count: data.acceptedCount, color: "bg-purple-500", text: "text-purple-700" },
              { label: "Rejected (Terminal)", count: data.rejectedCount, color: "bg-red-500", text: "text-red-700" },
            ].map((item) => {
              const pct = data.totalTheses > 0 ? Math.round((item.count / data.totalTheses) * 100) : 0;
              return (
                <div key={item.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">{item.label}</span>
                    <span className="font-mono text-slate-500">
                      {item.count} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${item.color} rounded-full transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Departmental Research Output */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-sm space-y-4 min-w-0">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span>🏛️</span> Departmental Research Output
            </h2>
            <span className="text-xs text-slate-400">
              {data.departmentCounts.length} Departments
            </span>
          </div>

          {data.departmentCounts.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-400">
              No departmental submissions recorded yet.
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              {data.departmentCounts.map((dept) => {
                const maxCount = Math.max(...data.departmentCounts.map((d) => d.count), 1);
                const widthPct = Math.round((dept.count / maxCount) * 100);
                return (
                  <div key={dept.department} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800 truncate pr-2">
                        {dept.department}
                      </span>
                      <span className="font-mono text-slate-500 shrink-0">
                        {dept.count} works
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 rounded-full transition-all duration-500"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 4. Bottom Grid: Recent Submissions & Immutable Activity Logs */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 min-w-0">
        {/* Recent Submissions */}
        <div className="xl:col-span-7 bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-sm space-y-4 min-w-0">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span>📄</span> Recent Manuscript Submissions
            </h2>
            <Link
              href="/thesis-management"
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              Manage all →
            </Link>
          </div>

          {data.recentTheses.length === 0 ? (
            <div className="text-center py-12 text-xs text-slate-400">
              No submissions recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.recentTheses.map((thesis) => (
                <div key={thesis.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
                  <div className="min-w-0 pr-2">
                    <h3 className="text-sm font-bold text-slate-900 truncate">
                      {thesis.title}
                    </h3>
                    <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                      <span>{thesis.department}</span>
                      <span>•</span>
                      <span>{(thesis.authorNames || []).join(", ") || "PECIT Student"}</span>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide self-start sm:self-auto shrink-0 ${
                      thesis.status === "published"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : thesis.status === "under_review"
                        ? "bg-blue-50 text-blue-700 border border-blue-200"
                        : thesis.status === "revision_requested"
                        ? "bg-amber-50 text-amber-700 border border-amber-200"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {thesis.status.replace("_", " ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Audit Trail Timeline */}
        <div className="xl:col-span-5 bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-sm space-y-4 min-w-0">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span>🛡️</span> Immutable Audit Trail
            </h2>
            <span className="text-xs text-slate-400">Append-Only</span>
          </div>

          {data.recentActivities.length === 0 ? (
            <div className="text-center py-12 text-xs text-slate-400">
              No audit logs recorded yet.
            </div>
          ) : (
            <div className="space-y-3">
              {data.recentActivities.map((act) => (
                <div
                  key={act.id}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 capitalize">
                      {act.action.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs text-slate-400">
                      {new Date(act.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 truncate font-medium">
                    {act.thesisTitle}
                  </p>
                  {act.reason && (
                    <p className="text-xs text-slate-500 italic bg-white p-1.5 rounded border border-slate-200">
                      &quot;{act.reason}&quot;
                    </p>
                  )}
                  <div className="text-xs text-slate-400 pt-0.5">
                    Actor: <strong>{act.actorName}</strong>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
