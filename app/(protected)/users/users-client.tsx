"use client";

import { useEffect, useState } from "react";

import { CsvImportModal } from "@/app/(protected)/users/csv-import-modal";
import { RegisterModal } from "@/app/(protected)/users/register-modal";
import { UsersTable } from "@/app/(protected)/users/users-table";
import { getUsersList } from "@/app/(protected)/users/actions";
import type { UserProfile } from "@/lib/auth/roles";

interface UsersClientProps {
  initialUsers: (UserProfile & { last_sign_in_at?: string | null })[];
  initialTotalCount: number;
  initialTotalPages: number;
  currentUserRole: string;
}

export function UsersClient({
  initialUsers,
  initialTotalCount,
  initialTotalPages,
  currentUserRole,
}: UsersClientProps) {
  const [users, setUsers] = useState(initialUsers);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isCsvOpen, setIsCsvOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let ignore = false;
    async function refresh() {
      setIsLoading(true);
      try {
        const res = await getUsersList({
          search,
          roleFilter,
          statusFilter,
          page: currentPage,
          pageSize: 10,
        });
        if (!ignore) {
          setUsers(res.users);
          setTotalCount(res.totalCount);
          setTotalPages(res.totalPages);
        }
      } catch (err) {
        console.error("Failed to load users:", err);
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }

    refresh();
    return () => {
      ignore = true;
    };
  }, [search, roleFilter, statusFilter, currentPage]);

  return (
    <div className="users-page-container">
      <header className="page-header-row">
        <div>
          <h1 className="page-title">Users Management</h1>
          <p className="page-subtitle">
            Provision, inspect, and manage institutional user accounts and roles.
          </p>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setIsCsvOpen(true)}
          >
            Import CSV
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setIsRegisterOpen(true)}
          >
            + Register User
          </button>
        </div>
      </header>

      {isLoading && <div className="loading-bar">Updating list...</div>}

      <UsersTable
        users={users}
        totalCount={totalCount}
        currentPage={currentPage}
        totalPages={totalPages}
        currentUserRole={currentUserRole}
        onPageChange={setCurrentPage}
        onSearchChange={setSearch}
        onRoleFilterChange={setRoleFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
      />

      <RegisterModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        currentUserRole={currentUserRole}
      />

      <CsvImportModal
        isOpen={isCsvOpen}
        onClose={() => setIsCsvOpen(false)}
      />
    </div>
  );
}
