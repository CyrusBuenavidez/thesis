import { Suspense } from "react";
import { connection } from "next/server";

import { requireRole } from "@/lib/auth/roles";
import { getThesisManagementList, getEligibleAdvisorsList } from "./actions";
import { RepositoryTable } from "./repository-table";

export const instant = false;

export default async function RepositoryPage() {
  await connection();
  await requireRole(["librarian", "admin", "super_admin", "advisor"]);

  const [theses, advisors] = await Promise.all([
    getThesisManagementList(),
    getEligibleAdvisorsList(),
  ]);

  return (
    <Suspense fallback={<div className="p-8 text-center text-muted">Loading Repository Catalog...</div>}>
      <RepositoryTable initialTheses={theses} initialAdvisors={advisors} />
    </Suspense>
  );
}
