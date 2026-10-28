import { connection } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { getAuditLogs } from "./actions";
import { AuditTable } from "./audit-table";

export const instant = false;

export default async function AuditLogsPage() {
  await connection();
  await requireRole(["librarian", "admin", "super_admin"]);
  const initialResult = await getAuditLogs({ page: 1, pageSize: 25 });

  return <AuditTable initialResult={initialResult} />;
}
