import type { ReactNode } from "react";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/roles";

export const instant = false;

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  await connection();
  const profile = await requireUser();

  return (
    <AppShell
      userRole={profile?.role}
      userFullName={profile?.full_name}
      userEmail={profile?.email}
      needsPrivacyConsent={!profile?.privacy_consent_at}
    >
      {children}
    </AppShell>
  );
}
