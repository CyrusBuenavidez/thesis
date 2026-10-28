"use client";

import { useState } from "react";

import {
  resetUserPassword,
  toggleUserStatus,
} from "@/app/(protected)/users/actions";
import type { UserProfile, UserRole } from "@/lib/auth/roles";

const ROLE_LABELS: Record<UserRole, string> = {
  student: "Student",
  advisor: "Advisor",
  librarian: "Librarian",
  admin: "Admin",
  super_admin: "Super Admin",
};

interface UsersTableProps {
  users: (UserProfile & { last_sign_in_at?: string | null })[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  currentUserRole: string;
  onPageChange: (newPage: number) => void;
  onSearchChange: (search: string) => void;
  onRoleFilterChange: (role: string) => void;
  statusFilter?: string;
  onStatusFilterChange?: (status: string) => void;
}

export function UsersTable({
  users,
  totalCount,
  currentPage,
  totalPages,
  currentUserRole,
  onPageChange,
  onSearchChange,
  onRoleFilterChange,
  statusFilter = "all",
  onStatusFilterChange,
}: UsersTableProps) {
  const [searchInput, setSearchInput] = useState("");
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [errorFeedback, setErrorFeedback] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function handleToggleStatus(userId: string, currentStatus: string) {
    setPendingId(userId);
    setActionFeedback(null);
    setErrorFeedback(null);

    const res = await toggleUserStatus(userId, currentStatus);
    setPendingId(null);

    if (!res.success) {
      setErrorFeedback(res.error || "Failed to update status");
    } else {
      setActionFeedback("User status successfully updated.");
    }
  }


  async function handleResetPassword(userId: string) {
    if (!confirm("Reset this user's password to a temporary password?")) {
      return;
    }

    setPendingId(userId);
    setActionFeedback(null);
    setErrorFeedback(null);

    const res = await resetUserPassword(userId);
    setPendingId(null);

    if (!res.success) {
      setErrorFeedback(res.error || "Failed to reset password");
    } else {
      setActionFeedback(res.message || "Password successfully reset.");
    }
  }

  const isFiltered = searchInput.trim() !== "" || statusFilter !== "all";

  const handleClear = () => {
    setSearchInput("");
    onSearchChange("");
    onRoleFilterChange("all");
    onStatusFilterChange?.("all");
  };

  return (
    <div className="users-table-module">
      {actionFeedback && (
        <div className="login-alert-success mb-4">{actionFeedback}</div>
      )}
      {errorFeedback && (
        <div className="login-alert-error mb-4">{errorFeedback}</div>
      )}

      {/* Modern Filter & Search Controls */}
      <div className="table-controls">
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
            placeholder="Search by name or email..."
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              onSearchChange(e.target.value);
            }}
            className="search-input-field"
          />
          {searchInput && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => {
                setSearchInput("");
                onSearchChange("");
              }}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <div className="filter-group">
          {/* Role Filter */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="role-select" className="filter-label">
              Role:
            </label>
            <select
              id="role-select"
              onChange={(e) => onRoleFilterChange(e.target.value)}
              defaultValue="all"
              className="filter-select"
            >
              <option value="all">All Roles</option>
              <option value="student">Student</option>
              <option value="advisor">Advisor</option>
              <option value="librarian">Librarian</option>
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>

          {/* Status Filter */}
          {onStatusFilterChange && (
            <div className="flex items-center gap-1.5">
              <label htmlFor="status-select" className="filter-label">
                Status:
              </label>
              <select
                id="status-select"
                value={statusFilter}
                onChange={(e) => onStatusFilterChange(e.target.value)}
                className="filter-select"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          )}

          {/* User count badge */}
          <span className="filter-badge-counter">
            Showing {users.length} of {totalCount}
          </span>

          {/* Reset Filters button */}
          {isFiltered && (
            <button
              type="button"
              onClick={handleClear}
              className="filter-clear-btn"
            >
              ✕ Reset
            </button>
          )}
        </div>
      </div>

      {users.length === 0 ? (
        <div className="empty-state">
          <p>No user accounts found matching your query or filter.</p>
          {isFiltered && (
            <button
              type="button"
              className="btn-secondary btn-sm mt-3"
              onClick={handleClear}
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="table-responsive">
          <table className="users-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Department / Program</th>
                <th>Status</th>
                <th>Last Sign-in</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="user-info-cell">
                      <div className="user-avatar" aria-hidden="true">
                        {user.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <strong>{user.full_name}</strong>
                        <span className="user-email">{user.email}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`role-badge role-${user.role}`}>
                      {ROLE_LABELS[user.role] || user.role}
                    </span>
                  </td>
                  <td>
                    <div className="dept-prog-cell">
                      <span>{user.department || "—"}</span>
                      <small className="text-muted">{user.program || ""}</small>
                    </div>
                  </td>
                  <td>
                    <span
                      className={`status-badge ${
                        user.status === "active" ? "active" : "disabled"
                      }`}
                    >
                      {user.status}
                    </span>
                  </td>
                  <td>
                    <span className="last-login-text">
                      {user.last_sign_in_at
                        ? new Date(user.last_sign_in_at).toLocaleDateString()
                        : "Never"}
                    </span>
                  </td>
                  <td>
                    <div className="actions-cell">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(user.id, user.status)}
                        disabled={pendingId === user.id}
                        className={`action-btn ${
                          user.status === "active" ? "deactivate" : "activate"
                        }`}
                      >
                        {user.status === "active" ? "Deactivate" : "Activate"}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleResetPassword(user.id)}
                        disabled={pendingId === user.id}
                        className="action-btn reset"
                      >
                        Reset PW
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="pagination-bar">
          <span className="pagination-info">
            Showing page {currentPage} of {totalPages} ({totalCount} total)
          </span>
          <div className="pagination-buttons">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
              className="btn-pagination"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => onPageChange(currentPage + 1)}
              className="btn-pagination"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
