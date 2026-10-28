import { connection } from "next/server";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/roles";
import { getSystemSettings, getDepartments, getPrograms } from "../actions";
import { SystemManagerClient } from "../system-manager-client";

export const instant = false;

const VALID_TABS = [
  "departments",
  "programs",
  "senior-high-programs",
  "senior-high",
  "branding",
  "branding-cms",
];

export default async function SettingsTabPage({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  await connection();
  await requireRole(["admin", "super_admin"]);

  const { tab } = await params;
  if (!VALID_TABS.includes(tab)) {
    notFound();
  }

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
      activeTabSlug={tab}
    />
  );
}
