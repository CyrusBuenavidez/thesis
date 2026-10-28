import { connection } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { getSystemSettings, getDepartments, getPrograms } from "./actions";
import { SystemManagerClient } from "./system-manager-client";

export const instant = false;

export default async function SettingsPage() {
  await connection();
  await requireRole(["admin", "super_admin"]);
  const [initialSettings, initialDepartments, initialPrograms] = await Promise.all([
    getSystemSettings(),
    getDepartments(),
    getPrograms(),
  ]);

  return (
    <SystemManagerClient
      initialSettings={initialSettings}
      initialDepartments={initialDepartments}
      initialPrograms={initialPrograms}
      activeTabSlug="departments"
    />
  );
}
