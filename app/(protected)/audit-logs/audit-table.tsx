"use client";

import { useState, useTransition } from "react";
import { getAuditLogs, type AuditLogsResult } from "./actions";

interface Props {
  initialResult: AuditLogsResult;
}

export function AuditTable({ initialResult }: Props) {
  const [result, setResult] = useState<AuditLogsResult>(initialResult);
  const [actionFilter, setActionFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();

  const handleFilterChange = (newAction: string) => {
    setActionFilter(newAction);
    setPage(1);
    startTransition(async () => {
      try {
        const res = await getAuditLogs({ action: newAction, search, page: 1, pageSize: 25 });
        setResult(res);
      } catch (err) {
        console.error("Filter error:", err);
      }
    });
  };

  const handleSearchSubmit = (searchTerm: string) => {
    setSearch(searchTerm);
    setPage(1);
    startTransition(async () => {
      try {
        const res = await getAuditLogs({ action: actionFilter, search: searchTerm, page: 1, pageSize: 25 });
        setResult(res);
      } catch (err) {
        console.error("Search error:", err);
      }
    });
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    startTransition(async () => {
      try {
        const res = await getAuditLogs({ action: actionFilter, search, page: newPage, pageSize: 25 });
        setResult(res);
      } catch (err) {
        console.error("Pagination error:", err);
      }
    });
  };

  const handleResetFilters = () => {
    setActionFilter("all");
    setSearch("");
    setPage(1);
    startTransition(async () => {
      try {
        const res = await getAuditLogs({ action: "all", page: 1, pageSize: 25 });
        setResult(res);
      } catch (err) {
        console.error("Reset error:", err);
      }
    });
  };

  // Instant responsive filter across returned items
  const filteredItems = result.items.filter((item) => {
    if (!search.trim()) return true;
    const term = search.trim().toLowerCase();
    return (
      item.thesisTitle.toLowerCase().includes(term) ||
      item.actorName.toLowerCase().includes(term) ||
      item.actorEmail.toLowerCase().includes(term) ||
      item.action.toLowerCase().includes(term) ||
      (item.reason && item.reason.toLowerCase().includes(term)) ||
      (item.fromStatus && item.fromStatus.toLowerCase().includes(term)) ||
      (item.toStatus && item.toStatus.toLowerCase().includes(term))
    );
  });

  const isFiltered = actionFilter !== "all" || search.trim() !== "";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="text-xs font-semibold text-blue-600 uppercase tracking-wider">
            Compliance &amp; Governance
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Immutable Audit Trail Viewer
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Permanent, tamper-proof historical record of all thesis status transitions, advisor reassignments, and administrative actions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            Total Events: <strong>{result.total}</strong>
          </span>
          <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            🔒 Append-Only Trigger Active
          </span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="module-toolbar">
        {/* Search input with icon and clear button */}
        <div className="search-input-wrapper">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="search-icon w-4 h-4 text-slate-400 shrink-0 pointer-events-none"
            style={{ width: "16px", height: "16px", minWidth: "16px", minHeight: "16px" }}
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearchSubmit(search);
            }}
            placeholder="Search by manuscript, actor, action, or reason..."
            className="search-input-field"
          />
          {search && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => handleSearchSubmit("")}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Action Select & Quick Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-700">Action:</span>
            <select
              value={actionFilter}
              onChange={(e) => handleFilterChange(e.target.value)}
              className="form-input text-xs h-9 w-auto min-w-[150px]"
              aria-label="Filter by audit action"
            >
              <option value="all">All Audit Actions</option>
              <option value="transition_status">transition_status</option>
              <option value="assign_advisor">assign_advisor</option>
              <option value="assign_doi">assign_doi</option>
              <option value="update_confidentiality_embargo">update_confidentiality_embargo</option>
            </select>
          </div>

          <span className="filter-badge-counter">
            Showing {filteredItems.length} of {result.total}
          </span>

          {isFiltered && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="filter-clear-btn"
            >
              ✕ Reset
            </button>
          )}

          {isPending && (
            <span className="text-xs text-blue-600 font-semibold animate-pulse">
              Updating...
            </span>
          )}
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[720px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-xs">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Target Manuscript</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">State Transition</th>
                <th className="py-3 px-4">Reason / Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    No activity logs match the selected search or filter.
                  </td>
                </tr>
              ) : (
                filteredItems.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs text-slate-500 whitespace-nowrap">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-100 text-slate-800 border border-slate-200">
                        {row.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900 max-w-xs truncate">
                      {row.thesisTitle}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{row.actorName}</div>
                      {row.actorEmail && (
                        <div className="text-xs text-slate-400 font-mono">{row.actorEmail}</div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {row.fromStatus || row.toStatus ? (
                        <div className="flex items-center gap-1.5 font-mono text-xs">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            {row.fromStatus || "none"}
                          </span>
                          <span>→</span>
                          <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold">
                            {row.toStatus}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 italic text-slate-600 max-w-sm truncate">
                      {row.reason ? `"${row.reason}"` : <span className="text-slate-400">—</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {result.totalPages > 1 && (
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
            <button
              type="button"
              disabled={page <= 1 || isPending}
              onClick={() => handlePageChange(page - 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition-colors"
            >
              ← Previous
            </button>
            <span className="text-xs text-slate-500">
              Page <strong>{page}</strong> of <strong>{result.totalPages}</strong>
            </span>
            <button
              type="button"
              disabled={page >= result.totalPages || isPending}
              onClick={() => handlePageChange(page + 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition-colors"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
