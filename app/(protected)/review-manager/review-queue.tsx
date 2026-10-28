"use client";

import { useState } from "react";
import { type ReviewQueueItem, type ReviewDetails, getThesisReviewDetails } from "./actions";
import { ReviewWorkspace } from "./review-workspace";

interface ReviewQueueProps {
  initialQueue: ReviewQueueItem[];
}

export function ReviewQueue({ initialQueue }: ReviewQueueProps) {
  const [queue, setQueue] = useState<ReviewQueueItem[]>(initialQueue);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const [activeThesisId, setActiveThesisId] = useState<string | null>(null);
  const [activeDetails, setActiveDetails] = useState<ReviewDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter items
  const filteredItems = queue.filter((item) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      q === "" ||
      item.title.toLowerCase().includes(q) ||
      item.authors.some((a) => a.toLowerCase().includes(q)) ||
      item.department.toLowerCase().includes(q) ||
      item.program.toLowerCase().includes(q);

    const matchesStatus =
      statusFilter === "all" || item.status === statusFilter;

    const matchesDept =
      departmentFilter === "all" || item.department === departmentFilter;

    return matchesSearch && matchesStatus && matchesDept;
  });

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const validPage = Math.min(currentPage, totalPages);
  const paginatedItems = filteredItems.slice(
    (validPage - 1) * pageSize,
    validPage * pageSize,
  );

  const isFiltered =
    search.trim() !== "" ||
    statusFilter !== "all" ||
    departmentFilter !== "all";

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
    setDepartmentFilter("all");
    setCurrentPage(1);
  }

  async function handleOpenWorkspace(thesisId: string) {
    setIsLoadingDetails(true);
    setError(null);
    try {
      const details = await getThesisReviewDetails(thesisId);
      setActiveDetails(details);
      setActiveThesisId(thesisId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingDetails(false);
    }
  }

  function handleBackToQueue() {
    setActiveThesisId(null);
    setActiveDetails(null);
  }

  async function handleDecisionCompleted() {
    if (activeThesisId) {
      try {
        const refreshed = await getThesisReviewDetails(activeThesisId);
        setActiveDetails(refreshed);
        // Also update status in local queue
        setQueue((prev) =>
          prev.map((item) =>
            item.id === activeThesisId ? { ...item, status: refreshed.status } : item,
          ),
        );
      } catch (err) {
        console.error("Refresh error:", err);
      }
    }
  }

  if (activeThesisId && activeDetails) {
    return (
      <ReviewWorkspace
        initialDetails={activeDetails}
        onBackToQueue={handleBackToQueue}
        onDecisionCompleted={handleDecisionCompleted}
      />
    );
  }

  const pendingCount = queue.filter((q) => q.status === "submitted").length;
  const underReviewCount = queue.filter((q) => q.status === "under_review").length;
  const revisionsCount = queue.filter((q) => q.status === "revision_requested").length;
  const acceptedCount = queue.filter((q) => q.status === "accepted").length;

  return (
    <div className="review-queue-view">
      <div className="page-header mb-6">
        <div>
          <h1 className="page-title text-2xl font-bold">Advisor Review Queue</h1>
          <p className="text-sm text-muted">
            Evaluate assigned thesis manuscripts, record rubric scores, add page-level feedback, and issue review decisions.
          </p>
        </div>
      </div>

      {error && <div className="login-alert-error mb-4">{error}</div>}

      {/* KPI Stat Cards */}
      <div className="queue-stats-grid mb-6">
        <div className="stat-card">
          <span className="stat-label">Submitted</span>
          <span className="stat-number text-amber-600">{pendingCount}</span>
          <span className="stat-desc">Awaiting first review</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Under Review</span>
          <span className="stat-number text-blue-600">{underReviewCount}</span>
          <span className="stat-desc">Active evaluations</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Revisions Requested</span>
          <span className="stat-number text-purple-600">{revisionsCount}</span>
          <span className="stat-desc">With students</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Accepted</span>
          <span className="stat-number text-emerald-600">{acceptedCount}</span>
          <span className="stat-desc">Endorsed to Library</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="module-toolbar">
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
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search by title, author, or program..."
            className="search-input-field"
          />
          {search && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => {
                setSearch("");
                setCurrentPage(1);
              }}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Department Filter */}
          <select
            value={departmentFilter}
            onChange={(e) => {
              setDepartmentFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="form-input text-xs h-9 w-auto min-w-[150px]"
            aria-label="Filter by department"
          >
            <option value="all">All Departments</option>
            <option value="College of Computer Studies">College of Computer Studies</option>
            <option value="College of Business and Management">College of Business and Management</option>
            <option value="College of Engineering">College of Engineering</option>
            <option value="College of Education">College of Education</option>
          </select>

          {/* Status Filter Pills */}
          <div className="filter-pill-group">
            {["all", "submitted", "under_review", "revision_requested", "accepted", "rejected"].map(
              (st) => (
                <button
                  key={st}
                  type="button"
                  className={`filter-pill ${statusFilter === st ? "active" : ""}`}
                  onClick={() => {
                    setStatusFilter(st);
                    setCurrentPage(1);
                  }}
                >
                  {st === "all" ? "All" : st.replace("_", " ")}
                </button>
              ),
            )}
          </div>

          <span className="filter-badge-counter">
            Showing {filteredItems.length} of {queue.length}
          </span>

          {isFiltered && (
            <button
              type="button"
              onClick={clearFilters}
              className="filter-clear-btn"
            >
              ✕ Reset
            </button>
          )}
        </div>
      </div>

      {/* Queue Table */}
      {filteredItems.length === 0 ? (
        <div className="empty-state-box">
          <div className="empty-state-icon">📋</div>
          <h3>No submissions found</h3>
          <p className="text-muted text-sm">
            {search || statusFilter !== "all" || departmentFilter !== "all"
              ? "Try adjusting your search query or status filter."
              : "No thesis manuscripts are currently awaiting your review."}
          </p>
          {isFiltered && (
            <button
              type="button"
              className="btn-secondary btn-sm mt-3"
              onClick={clearFilters}
            >
              Clear All Filters
            </button>
          )}
        </div>
      ) : (
        <div className="queue-table-container">
          <table className="queue-table">
            <thead>
              <tr>
                <th>Manuscript Title & Authors</th>
                <th>Department / Program</th>
                <th>Status</th>
                <th>Versions</th>
                <th>Notes / Comments</th>
                <th>Submitted</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((item) => (
                <tr key={item.id} className="queue-table-row">
                  <td className="max-w-md">
                    <strong className="text-ink line-clamp-2">{item.title}</strong>
                    <span className="text-xs text-muted block mt-0.5">
                      {item.authors.join(", ") || "Unknown Author"}
                    </span>
                  </td>
                  <td className="text-xs">
                    <div>{item.department}</div>
                    <div className="text-muted">{item.program}</div>
                  </td>
                  <td>
                    <span className={`status-badge status-${item.status}`}>
                      {item.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="text-center text-xs">
                    <span className="version-pill">v{item.latestVersionNumber}</span>
                  </td>
                  <td className="text-xs text-muted text-center">
                    {item.annotationCount > 0 ? (
                      <span className="comment-badge">{item.annotationCount} comments</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="text-xs text-muted whitespace-nowrap">
                    {new Date(item.updatedAt).toLocaleDateString()}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      onClick={() => handleOpenWorkspace(item.id)}
                      disabled={isLoadingDetails}
                    >
                      {isLoadingDetails ? "Loading..." : "Review"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="table-pagination-bar">
              <span className="text-xs text-slate-500">
                Page <strong>{validPage}</strong> of <strong>{totalPages}</strong> ({filteredItems.length} submissions)
              </span>
              <div className="pagination-btn-group">
                <button
                  type="button"
                  className="pagination-btn"
                  disabled={validPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  ← Prev
                </button>
                {Array.from({ length: totalPages }).map((_, idx) => (
                  <button
                    key={idx + 1}
                    type="button"
                    className={`pagination-btn ${validPage === idx + 1 ? "active" : ""}`}
                    onClick={() => setCurrentPage(idx + 1)}
                  >
                    {idx + 1}
                  </button>
                ))}
                <button
                  type="button"
                  className="pagination-btn"
                  disabled={validPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  aria-label="Next page"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
