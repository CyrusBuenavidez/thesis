if (typeof window !== "undefined") {
  throw new Error("This module can only be executed on the server.");
}

import { createAdminClient } from "../supabase/admin.ts";

export type AccessKind = "view" | "download" | "docx_export";

export interface LogAccessParams {
  thesisId: string;
  versionId?: string | null;
  actorId: string;
  kind: AccessKind;
}

/**
 * Records access events to confidential research files in public.access_logs
 * per Data Privacy Act (RA 10173) compliance guidelines.
 */
export async function logConfidentialAccess(params: LogAccessParams): Promise<void> {
  const { thesisId, versionId, actorId, kind } = params;
  const admin = createAdminClient();

  try {
    // 1. Check if the thesis is confidential
    const { data: thesis } = await admin
      .from("theses")
      .select("is_confidential")
      .eq("id", thesisId)
      .single();

    if (!thesis || !thesis.is_confidential) {
      // Non-confidential files do not require compliance access logging
      return;
    }

    // 2. Insert audit entry into access_logs
    const { error } = await admin.from("access_logs").insert({
      thesis_id: thesisId,
      version_id: versionId || null,
      actor_id: actorId,
      kind: kind,
    });

    if (error) {
      console.warn("Failed to record access_log event:", error.message);
    }
  } catch (err) {
    console.warn("Error in logConfidentialAccess:", err);
  }
}
