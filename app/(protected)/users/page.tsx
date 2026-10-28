import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";

import { getUsersList } from "@/app/(protected)/users/actions";
import { UsersClient } from "@/app/(protected)/users/users-client";
import { requireRole } from "@/lib/auth/roles";

export const metadata: Metadata = {
  title: "Users Management",
};

export const instant = false;

async function UsersContent() {
  await connection();
  const profile = await requireRole(["admin", "super_admin"]);
  const initialData = await getUsersList({ page: 1, pageSize: 10 });

  return (
    <UsersClient
      initialUsers={initialData.users}
      initialTotalCount={initialData.totalCount}
      initialTotalPages={initialData.totalPages}
      currentUserRole={profile.role}
    />
  );
}

export default function UsersPage() {
  return (
    <Suspense fallback={<div className="loading-panel">Loading users...</div>}>
      <UsersContent />
    </Suspense>
  );
}
