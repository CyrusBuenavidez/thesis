"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserProfile, requireUser, invalidateUserProfileCache } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";

export async function checkPrivacyConsentStatus(): Promise<{
  needsConsent: boolean;
  fullName?: string;
}> {
  const profile = await getCurrentUserProfile();

  if (!profile) {
    return { needsConsent: false };
  }

  return {
    needsConsent: !profile.privacy_consent_at,
    fullName: profile.full_name || "PECIT Member",
  };
}

export async function recordPrivacyConsent(): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { error } = await admin
    .from("profiles")
    .update({ privacy_consent_at: now })
    .eq("id", user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  invalidateUserProfileCache(user.id);
  revalidatePath("/");
  return { success: true };
}
