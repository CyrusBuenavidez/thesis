"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { runJobInline } from "@/lib/jobs";
import { bumpSearchCacheVersion } from "@/lib/search/cache";

import { requireRole } from "@/lib/auth/roles";

// Helper: Require Librarian or Administrator role
async function requireLibrarianOrAdmin() {
  const profile = await requireRole(["librarian", "admin", "super_admin"]);
  const admin = createAdminClient();
  const supabase = await createClient();
  return { supabase, admin, user: profile };
}

export interface ManagementThesisItem {
  id: string;
  title: string;
  abstract: string;
  status: string;
  department: string;
  program: string;
  keywords: string[];
  authors: string[];
  ownerId: string;
  primarySupervisorId: string | null;
  supervisorName: string | null;
  doi: string | null;
  license: string | null;
  isConfidential: boolean;
  embargoUntil: string | null;
  consentAcceptedAt: string | null;
  publishedAt: string | null;
  year: number | null;
  createdAt: string;
  updatedAt: string;
  versionCount: number;
}

let cachedThesisList: { data: ManagementThesisItem[]; timestamp: number } | null = null;
const THESIS_LIST_CACHE_TTL_MS = 20000;

function invalidateRepositoryCache() {
  cachedThesisList = null;
  cachedAdvisors = null;
}
const invalidateThesisManagementCache = invalidateRepositoryCache;

export type RepositoryThesisItem = ManagementThesisItem;

export async function getThesisManagementList(): Promise<ManagementThesisItem[]> {
  const now = Date.now();
  if (cachedThesisList && now - cachedThesisList.timestamp < THESIS_LIST_CACHE_TTL_MS) {
    return cachedThesisList.data;
  }

  const { admin } = await requireLibrarianOrAdmin();

  const { data, error } = await admin
    .from("theses")
    .select(`
      id,
      title,
      abstract,
      status,
      department,
      program,
      keywords,
      author_names,
      owner_id,
      primary_supervisor_id,
      doi,
      license,
      is_confidential,
      embargo_until,
      consent_accepted_at,
      published_at,
      year,
      created_at,
      updated_at,
      primary_supervisor:profiles!theses_primary_supervisor_id_fkey(full_name),
      thesis_versions(id)
    `)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Management list query error:", error);
    throw new Error("Failed to load thesis catalog");
  }

  const items = (data || []).map((t) => {
    const versions = (t.thesis_versions as { id: string }[]) || [];
    const rawSup = t.primary_supervisor as unknown as { full_name: string } | { full_name: string }[] | null;
    const supervisorName = Array.isArray(rawSup) ? rawSup[0]?.full_name : rawSup?.full_name ?? null;

    return {
      id: t.id,
      title: t.title,
      abstract: t.abstract,
      status: t.status,
      department: t.department,
      program: t.program,
      keywords: t.keywords || [],
      authors: t.author_names || [],
      ownerId: t.owner_id,
      primarySupervisorId: t.primary_supervisor_id,
      supervisorName,
      doi: t.doi,
      license: t.license,
      isConfidential: t.is_confidential,
      embargoUntil: t.embargo_until,
      consentAcceptedAt: t.consent_accepted_at,
      publishedAt: t.published_at,
      year: t.year,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
      versionCount: versions.length,
    };
  });

  cachedThesisList = { data: items, timestamp: Date.now() };
  return items;
}

let cachedAdvisors: {
  data: { id: string; fullName: string; email: string; department: string | null }[];
  timestamp: number;
} | null = null;
const ADVISORS_CACHE_TTL_MS = 30000;

// Fetch eligible faculty advisors for assignment
export async function getEligibleAdvisorsList(): Promise<
  { id: string; fullName: string; email: string; department: string | null }[]
> {
  const now = Date.now();
  if (cachedAdvisors && now - cachedAdvisors.timestamp < ADVISORS_CACHE_TTL_MS) {
    return cachedAdvisors.data;
  }

  const { admin } = await requireLibrarianOrAdmin();

  const { data, error } = await admin
    .from("profiles")
    .select("id, full_name, email, department")
    .in("role", ["advisor", "admin", "super_admin"])
    .eq("status", "active")
    .order("full_name", { ascending: true });

  if (error) throw error;
  const result = (data || []).map((p) => ({
    id: p.id,
    fullName: p.full_name,
    email: p.email,
    department: p.department,
  }));

  cachedAdvisors = { data: result, timestamp: now };
  return result;
}

// 1. Assign Primary Faculty Advisor
export async function assignThesisAdvisor(
  thesisId: string,
  advisorId: string,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, admin } = await requireLibrarianOrAdmin();

    const { data: thesis } = await admin
      .from("theses")
      .select("id, title, primary_supervisor_id")
      .eq("id", thesisId)
      .single();

    if (!thesis) return { success: false, error: "Thesis record not found" };

    const { data: advisor } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", advisorId)
      .single();

    if (!advisor) return { success: false, error: "Selected advisor profile not found" };

    // Update primary supervisor
    const { error: updateErr } = await admin
      .from("theses")
      .update({ primary_supervisor_id: advisorId })
      .eq("id", thesisId);

    if (updateErr) throw updateErr;

    // Log assignment to activity_logs
    await admin.from("activity_logs").insert({
      thesis_id: thesisId,
      actor_id: user.id,
      action: "assign_advisor",
      reason: reason || `Assigned to ${advisor.full_name}`,
      metadata: {
        previous_supervisor_id: thesis.primary_supervisor_id,
        new_supervisor_id: advisorId,
        new_supervisor_name: advisor.full_name,
      },
    });

    // Send in-app notification to advisor
    await admin.from("notifications").insert({
      user_id: advisorId,
      thesis_id: thesisId,
      title: "Assigned as Thesis Advisor",
      message: `You have been assigned to supervise/review the manuscript: "${thesis.title}".`,
    });

    // Dispatch background email
    await runJobInline(async () => {
      try {
        await sendEmail({
          to: [advisor.email],
          subject: "PECIT Archive: Assigned as Thesis Advisor",
          text: `You have been assigned as the faculty supervisor for "${thesis.title}". Please log into the Review Manager to evaluate this submission.`,
        });
      } catch (e) {
        console.warn("Notification notice:", e);
      }
    });

    invalidateRepositoryCache();
    revalidatePath("/repository");
    revalidatePath("/thesis-management");
    revalidatePath("/review-manager");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// 2. Update Thesis Metadata
const metadataUpdateSchema = z.object({
  thesisId: z.string().uuid(),
  title: z.string().trim().min(5),
  abstract: z.string().trim().min(20),
  department: z.string().min(2),
  program: z.string().min(2),
  keywords: z.array(z.string()).min(1),
});

export async function updateThesisMetadata(
  input: z.infer<typeof metadataUpdateSchema>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, admin } = await requireLibrarianOrAdmin();
    const parsed = metadataUpdateSchema.parse(input);

    const { error: updateErr } = await admin
      .from("theses")
      .update({
        title: parsed.title,
        abstract: parsed.abstract,
        department: parsed.department,
        program: parsed.program,
        keywords: parsed.keywords,
      })
      .eq("id", parsed.thesisId);

    if (updateErr) throw updateErr;

    await admin.from("activity_logs").insert({
      thesis_id: parsed.thesisId,
      actor_id: user.id,
      action: "update_metadata",
      reason: "Metadata updated by Library staff",
      metadata: { updated_by: user.full_name },
    });

    invalidateRepositoryCache();
    revalidatePath("/repository");
    revalidatePath("/thesis-management");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// 3. Update Confidentiality & Embargo
export async function updateConfidentialityAndEmbargo(
  thesisId: string,
  data: { isConfidential: boolean; embargoUntil: string | null; reason?: string },
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, admin } = await requireLibrarianOrAdmin();

    const { error: updateErr } = await admin
      .from("theses")
      .update({
        is_confidential: data.isConfidential,
        embargo_until: data.embargoUntil || null,
      })
      .eq("id", thesisId);

    if (updateErr) throw updateErr;

    await admin.from("activity_logs").insert({
      thesis_id: thesisId,
      actor_id: user.id,
      action: "update_confidentiality_embargo",
      reason: data.reason || "Confidentiality/Embargo updated by Library staff",
      metadata: {
        is_confidential: data.isConfidential,
        embargo_until: data.embargoUntil,
      },
    });

    await bumpSearchCacheVersion();
    invalidateRepositoryCache();
    revalidatePath("/repository");
    revalidatePath("/thesis-management");
    revalidatePath("/archive");
    revalidatePath("/");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// 4. Assign DOI
export async function assignThesisDoi(
  thesisId: string,
  doi: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, admin } = await requireLibrarianOrAdmin();
    const cleanDoi = doi.trim();

    if (!cleanDoi || cleanDoi.length < 5) {
      return { success: false, error: "Please enter a valid DOI identifier string" };
    }

    const { error: updateErr } = await admin
      .from("theses")
      .update({ doi: cleanDoi })
      .eq("id", thesisId);

    if (updateErr) throw updateErr;

    await admin.from("activity_logs").insert({
      thesis_id: thesisId,
      actor_id: user.id,
      action: "assign_doi",
      reason: `Assigned DOI: ${cleanDoi}`,
      metadata: { doi: cleanDoi },
    });

    invalidateRepositoryCache();
    revalidatePath("/repository");
    revalidatePath("/thesis-management");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// 5. Execute Publish
export async function publishThesis(
  thesisId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, admin } = await requireLibrarianOrAdmin();

    // Check thesis existence
    const { data: thesis } = await admin
      .from("theses")
      .select("id, title, status, owner_id, consent_accepted_at")
      .eq("id", thesisId)
      .single();

    if (!thesis) return { success: false, error: "Thesis not found" };

    if (!thesis.consent_accepted_at) {
      return {
        success: false,
        error: "Publish refused: author publication agreement consent is missing",
      };
    }

    // Call transition_thesis_status RPC
    const { error: transitionErr } = await supabase.rpc("transition_thesis_status", {
      p_thesis_id: thesisId,
      p_to_status: "published",
      p_reason: "Published to institutional archive by Library",
    });

    if (transitionErr) {
      return { success: false, error: transitionErr.message };
    }

    // Dispatch publication email to author
    await runJobInline(async () => {
      try {
        const { data: owner } = await admin
          .from("profiles")
          .select("email")
          .eq("id", thesis.owner_id)
          .single();

        if (owner?.email) {
          await sendEmail({
            to: [owner.email],
            subject: "PECIT Archive: Your Thesis Has Been Published!",
            text: `Congratulations! Your manuscript "${thesis.title}" has been published to the PECIT Institutional Repository Archive.`,
          });
        }
      } catch (e) {
        console.warn("Notification notice:", e);
      }
    });

    // Bump Redis search cache version so newly published thesis immediately appears in search
    await bumpSearchCacheVersion();

    invalidateRepositoryCache();
    revalidatePath("/repository");
    revalidatePath("/thesis-management");
    revalidatePath("/archive");
    revalidatePath("/");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// 6. Execute Archive
export async function archiveThesis(
  thesisId: string,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await requireLibrarianOrAdmin();

    const { error: transitionErr } = await supabase.rpc("transition_thesis_status", {
      p_thesis_id: thesisId,
      p_to_status: "archived",
      p_reason: reason || "Archived by Library staff",
    });

    if (transitionErr) {
      return { success: false, error: transitionErr.message };
    }

    // Bump Redis search cache version so archived thesis is removed from public search
    await bumpSearchCacheVersion();

    invalidateRepositoryCache();
    revalidatePath("/repository");
    revalidatePath("/thesis-management");
    revalidatePath("/archive");
    revalidatePath("/");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// 7. Get Immutable Activity Logs for a Thesis
export interface ActivityLogEntry {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
  actorName: string;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export async function getThesisActivityLogs(
  thesisId: string,
): Promise<ActivityLogEntry[]> {
  const { admin } = await requireLibrarianOrAdmin();

  const { data, error } = await admin
    .from("activity_logs")
    .select(`
      id,
      action,
      from_status,
      to_status,
      reason,
      created_at,
      metadata,
      actor:profiles!activity_logs_actor_id_fkey(full_name)
    `)
    .eq("thesis_id", thesisId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Activity logs query error:", error);
    throw new Error("Failed to load audit logs");
  }

  return (data || []).map((log) => {
    const rawActor = log.actor as unknown as { full_name: string } | { full_name: string }[] | null;
    const actorName = Array.isArray(rawActor) ? rawActor[0]?.full_name : rawActor?.full_name ?? "System";
    return {
      id: log.id,
      action: log.action,
      fromStatus: log.from_status,
      toStatus: log.to_status,
      reason: log.reason,
      actorName,
      createdAt: log.created_at,
      metadata: (log.metadata as Record<string, unknown>) || {},
    };
  });
}

// 8. Version History Inspector
export interface ThesisVersionDetail {
  id: string;
  versionNumber: number;
  r2Key: string;
  docxR2Key: string | null;
  fileSize: number;
  sha256: string;
  changeNotes: string | null;
  uploadedByName: string;
  createdAt: string;
  downloadUrl?: string;
}

export async function getThesisVersionHistory(
  thesisId: string,
): Promise<ThesisVersionDetail[]> {
  const { admin } = await requireLibrarianOrAdmin();

  const { data, error } = await admin
    .from("thesis_versions")
    .select(`
      id,
      version_number,
      r2_key,
      docx_r2_key,
      file_size,
      sha256,
      change_notes,
      created_at,
      uploader:profiles!thesis_versions_uploaded_by_fkey(full_name)
    `)
    .eq("thesis_id", thesisId)
    .order("version_number", { ascending: false });

  if (error) {
    console.error("Version history query error:", error);
    throw new Error("Failed to load version history");
  }

  const { createPresignedDownloadUrl } = await import("@/lib/storage/r2");

  const versions: ThesisVersionDetail[] = [];
  for (const v of data || []) {
    const rawUploader = v.uploader as unknown as { full_name: string } | { full_name: string }[] | null;
    const uploadedByName = Array.isArray(rawUploader) ? rawUploader[0]?.full_name : rawUploader?.full_name ?? "Author";

    let downloadUrl: string | undefined = undefined;
    try {
      downloadUrl = await createPresignedDownloadUrl({
        key: v.r2_key,
        expiresInSeconds: 900,
      });
    } catch (e) {
      console.warn("Could not sign version url:", e);
    }

    versions.push({
      id: v.id,
      versionNumber: v.version_number,
      r2Key: v.r2_key,
      docxR2Key: v.docx_r2_key,
      fileSize: v.file_size,
      sha256: v.sha256,
      changeNotes: v.change_notes,
      uploadedByName,
      createdAt: v.created_at,
      downloadUrl,
    });
  }

  return versions;
}
