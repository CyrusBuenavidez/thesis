"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPresignedDownloadUrl } from "@/lib/storage/r2";
import { sendEmail } from "@/lib/email";
import { runJobInline } from "@/lib/jobs";

import { requireUser } from "@/lib/auth/roles";

// Helper: Require authenticated user and return user profile
async function requireAuthUser() {
  const profile = await requireUser();
  const admin = createAdminClient();
  const supabase = await createClient();
  return { supabase, admin, user: profile };
}

export interface ReviewQueueItem {
  id: string;
  title: string;
  abstract: string;
  status: string;
  department: string;
  program: string;
  primarySupervisorId: string | null;
  supervisorName: string | null;
  authors: string[];
  versionCount: number;
  latestVersionNumber: number;
  annotationCount: number;
  createdAt: string;
  updatedAt: string;
}

interface CachedQueue {
  data: ReviewQueueItem[];
  timestamp: number;
}
const queueCache = new Map<string, CachedQueue>();
const QUEUE_CACHE_TTL_MS = 20000;

function invalidateReviewQueueCache() {
  queueCache.clear();
}

export async function getReviewQueue(): Promise<ReviewQueueItem[]> {
  const { user, admin } = await requireAuthUser();

  const isStaff = ["librarian", "admin", "super_admin"].includes(user.role);
  const isAdvisor = user.role === "advisor";

  if (!isStaff && !isAdvisor) {
    throw new Error("Forbidden: Only advisors and staff can access Review Manager");
  }

  const cacheKey = isStaff ? "staff" : user.id;
  const now = Date.now();
  const cached = queueCache.get(cacheKey);
  if (cached && now - cached.timestamp < QUEUE_CACHE_TTL_MS) {
    return cached.data;
  }

  // Base query: fetch non-draft theses
  let query = admin
    .from("theses")
    .select(`
      id,
      title,
      abstract,
      status,
      department,
      program,
      primary_supervisor_id,
      author_names,
      created_at,
      updated_at,
      primary_supervisor:profiles!theses_primary_supervisor_id_fkey(full_name),
      thesis_versions(id, version_number),
      pdf_annotations(id)
    `)
    .neq("status", "draft")
    .order("updated_at", { ascending: false });

  // If user is advisor/faculty (not staff), restrict strictly to assigned submissions
  if (!isStaff) {
    query = query.eq("primary_supervisor_id", user.id);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching review queue:", error);
    throw new Error("Failed to load review queue");
  }

  const items = (data || []).map((t) => {
    const versions = (t.thesis_versions as { id: string; version_number: number }[]) || [];
    const annotations = (t.pdf_annotations as { id: string }[]) || [];
    const rawSup = t.primary_supervisor as unknown as { full_name: string } | { full_name: string }[] | null;
    const supervisorName = Array.isArray(rawSup) ? rawSup[0]?.full_name : rawSup?.full_name ?? null;

    const latestVersion = versions.length > 0
      ? Math.max(...versions.map((v) => v.version_number))
      : 1;

    return {
      id: t.id,
      title: t.title,
      abstract: t.abstract,
      status: t.status,
      department: t.department,
      program: t.program,
      primarySupervisorId: t.primary_supervisor_id,
      supervisorName,
      authors: t.author_names || [],
      versionCount: versions.length,
      latestVersionNumber: latestVersion,
      annotationCount: annotations.length,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    };
  });

  queueCache.set(cacheKey, { data: items, timestamp: Date.now() });
  return items;
}

export interface ReviewDetails {
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
  license: string | null;
  isConfidential: boolean;
  embargoUntil: string | null;
  consentAcceptedAt: string | null;
  reviewChecklist: Record<string, boolean>;
  versions: {
    id: string;
    versionNumber: number;
    fileSize: number;
    changeNotes: string | null;
    createdAt: string;
    downloadUrl: string;
  }[];
  annotations: {
    id: string;
    versionId: string;
    pageNumber: number;
    authorId: string;
    authorName: string;
    content: string;
    createdAt: string;
  }[];
  latestRemark: string | null;
}

export async function getThesisReviewDetails(thesisId: string): Promise<ReviewDetails> {
  const { user, admin } = await requireAuthUser();

  const isStaff = ["librarian", "admin", "super_admin"].includes(user.role);

  const { data: thesis, error: thesisErr } = await admin
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
      license,
      is_confidential,
      embargo_until,
      consent_accepted_at,
      review_checklist,
      primary_supervisor:profiles!theses_primary_supervisor_id_fkey(full_name),
      thesis_versions(id, version_number, r2_key, file_size, change_notes, created_at),
      pdf_annotations(
        id,
        version_id,
        page_number,
        author_id,
        content,
        created_at,
        author:profiles!pdf_annotations_author_id_fkey(full_name)
      )
    `)
    .eq("id", thesisId)
    .single();

  if (thesisErr || !thesis) {
    throw new Error("Thesis not found");
  }

  // Access check: only assigned supervisor or staff can review
  if (!isStaff && thesis.primary_supervisor_id !== user.id) {
    throw new Error("Forbidden: You are not the assigned advisor for this thesis");
  }

  // Fetch latest remarks from activity_logs if in revision_requested or rejected
  const { data: latestLog } = await admin
    .from("activity_logs")
    .select("reason")
    .eq("thesis_id", thesisId)
    .not("reason", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const rawVersions = (thesis.thesis_versions as {
    id: string;
    version_number: number;
    r2_key: string;
    file_size: number;
    change_notes: string | null;
    created_at: string;
  }[]) || [];

  // Sort versions descending
  rawVersions.sort((a, b) => b.version_number - a.version_number);

  // Generate ephemeral signed URLs (15 min) for each version
  const versionsWithUrls = await Promise.all(
    rawVersions.map(async (v) => {
      let downloadUrl = "";
      try {
        downloadUrl = await createPresignedDownloadUrl({
          key: v.r2_key,
          expiresInSeconds: 900,
        });
      } catch (e) {
        console.warn(`Could not presign version ${v.version_number}:`, e);
      }
      return {
        id: v.id,
        versionNumber: v.version_number,
        fileSize: v.file_size,
        changeNotes: v.change_notes,
        createdAt: v.created_at,
        downloadUrl,
      };
    }),
  );

  const rawAnnotations = (thesis.pdf_annotations as unknown as Array<{
    id: string;
    version_id: string;
    page_number: number;
    author_id: string;
    content: string;
    created_at: string;
    author?: { full_name: string } | { full_name: string }[];
  }>) || [];

  const annotations = rawAnnotations.map((a) => {
    const authorName = Array.isArray(a.author)
      ? a.author[0]?.full_name
      : a.author?.full_name ?? "Advisor";

    return {
      id: a.id,
      versionId: a.version_id,
      pageNumber: a.page_number,
      authorId: a.author_id,
      authorName,
      content: a.content,
      createdAt: a.created_at,
    };
  });

  const rawSup = thesis.primary_supervisor as unknown as { full_name: string } | { full_name: string }[] | null;
  const supervisorName = Array.isArray(rawSup) ? rawSup[0]?.full_name : rawSup?.full_name ?? null;

  return {
    id: thesis.id,
    title: thesis.title,
    abstract: thesis.abstract,
    status: thesis.status,
    department: thesis.department,
    program: thesis.program,
    keywords: thesis.keywords || [],
    authors: thesis.author_names || [],
    ownerId: thesis.owner_id,
    primarySupervisorId: thesis.primary_supervisor_id,
    supervisorName,
    license: thesis.license,
    isConfidential: thesis.is_confidential,
    embargoUntil: thesis.embargo_until,
    consentAcceptedAt: thesis.consent_accepted_at,
    reviewChecklist: (thesis.review_checklist as Record<string, boolean>) || {},
    versions: versionsWithUrls,
    annotations,
    latestRemark: latestLog?.reason ?? null,
  };
}

// 1. Save Rubric Checklist
export async function saveReviewChecklist(
  thesisId: string,
  checklist: Record<string, boolean>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user, admin } = await requireAuthUser();
    const isStaff = ["librarian", "admin", "super_admin"].includes(user.role);

    const { data: thesis } = await admin
      .from("theses")
      .select("primary_supervisor_id")
      .eq("id", thesisId)
      .single();

    if (!thesis) return { success: false, error: "Thesis not found" };
    if (!isStaff && thesis.primary_supervisor_id !== user.id) {
      return { success: false, error: "Forbidden: Not assigned advisor" };
    }

    const { error: updateErr } = await admin
      .from("theses")
      .update({ review_checklist: checklist })
      .eq("id", thesisId);

    if (updateErr) throw updateErr;

    invalidateReviewQueueCache();
    revalidatePath("/review-manager");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// 2. Add PDF Page Annotation
const annotationSchema = z.object({
  thesisId: z.string().uuid(),
  versionId: z.string().uuid(),
  pageNumber: z.number().int().positive(),
  content: z.string().trim().min(2, "Comment must be at least 2 characters long"),
});

export async function addPdfAnnotation(input: z.infer<typeof annotationSchema>): Promise<{
  success: boolean;
  annotation?: {
    id: string;
    versionId: string;
    pageNumber: number;
    authorId: string;
    authorName: string;
    content: string;
    createdAt: string;
  };
  error?: string;
}> {
  try {
    const { user, admin } = await requireAuthUser();
    const parsed = annotationSchema.parse(input);

    const { data: row, error: insertErr } = await admin
      .from("pdf_annotations")
      .insert({
        thesis_id: parsed.thesisId,
        version_id: parsed.versionId,
        page_number: parsed.pageNumber,
        author_id: user.id,
        content: parsed.content,
      })
      .select("id, version_id, page_number, author_id, content, created_at")
      .single();

    if (insertErr || !row) throw insertErr || new Error("Insert failed");

    invalidateReviewQueueCache();
    revalidatePath("/review-manager");
    return {
      success: true,
      annotation: {
        id: row.id,
        versionId: row.version_id,
        pageNumber: row.page_number,
        authorId: row.author_id,
        authorName: user.full_name,
        content: row.content,
        createdAt: row.created_at,
      },
    };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// 3. Delete PDF Page Annotation
export async function deletePdfAnnotation(annotationId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const { user, admin } = await requireAuthUser();
    const isStaff = ["librarian", "admin", "super_admin"].includes(user.role);

    const { data: annotation } = await admin
      .from("pdf_annotations")
      .select("author_id")
      .eq("id", annotationId)
      .single();

    if (!annotation) return { success: false, error: "Annotation not found" };
    if (!isStaff && annotation.author_id !== user.id) {
      return { success: false, error: "Forbidden: You cannot delete another user's annotation" };
    }

    const { error: delErr } = await admin
      .from("pdf_annotations")
      .delete()
      .eq("id", annotationId);

    if (delErr) throw delErr;

    invalidateReviewQueueCache();
    revalidatePath("/review-manager");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// 4. Execute Review Decision via transition_thesis_status
const decisionSchema = z.object({
  thesisId: z.string().uuid(),
  decision: z.enum(["start_review", "request_revisions", "accept", "reject"]),
  reason: z.string().trim().optional(),
});

export async function executeReviewDecision(input: z.infer<typeof decisionSchema>): Promise<{
  success: boolean;
  toStatus?: string;
  error?: string;
}> {
  try {
    const { user, supabase, admin } = await requireAuthUser();
    const parsed = decisionSchema.parse(input);

    const isStaff = ["librarian", "admin", "super_admin"].includes(user.role);

    // Verify thesis exists and caller has authority
    const { data: thesis } = await admin
      .from("theses")
      .select("id, title, status, owner_id, primary_supervisor_id")
      .eq("id", parsed.thesisId)
      .single();

    if (!thesis) return { success: false, error: "Thesis record not found" };

    if (!isStaff && thesis.primary_supervisor_id !== user.id) {
      return {
        success: false,
        error: "Forbidden: You are not assigned as the primary supervisor for this thesis",
      };
    }

    let toStatus: "under_review" | "revision_requested" | "accepted" | "rejected";
    let requiredReason: string | null = null;

    switch (parsed.decision) {
      case "start_review":
        toStatus = "under_review";
        requiredReason = "Advisor initiated formal manuscript review";
        break;
      case "request_revisions":
        toStatus = "revision_requested";
        if (!parsed.reason || parsed.reason.length < 5) {
          return { success: false, error: "A written reason is required when requesting revisions." };
        }
        requiredReason = parsed.reason;
        break;
      case "accept":
        toStatus = "accepted";
        requiredReason = parsed.reason || "Manuscript accepted by advisor";
        break;
      case "reject":
        toStatus = "rejected";
        if (!parsed.reason || parsed.reason.length < 5) {
          return { success: false, error: "A written reason is required when rejecting a thesis." };
        }
        requiredReason = parsed.reason;
        break;
      default:
        return { success: false, error: "Invalid review decision" };
    }

    // Call transition_thesis_status RPC with user session
    const { error: transitionErr } = await supabase.rpc("transition_thesis_status", {
      p_thesis_id: parsed.thesisId,
      p_to_status: toStatus,
      p_reason: requiredReason,
    });

    if (transitionErr) {
      return { success: false, error: transitionErr.message };
    }

    // Send notifications and trigger background inline notification
    await runJobInline(async () => {
      try {
        const { data: ownerProfile } = await admin
          .from("profiles")
          .select("email")
          .eq("id", thesis.owner_id)
          .single();

        if (ownerProfile?.email) {
          await sendEmail({
            to: [ownerProfile.email],
            subject: `PECIT Thesis Status Update: ${toStatus}`,
            text: `Your manuscript "${thesis.title}" status has transitioned to ${toStatus}. ${requiredReason ? `Details: ${requiredReason}` : ""}`,
          });
        }
      } catch (notifyErr) {
        console.warn("Background notification note:", notifyErr);
      }
    });

    invalidateReviewQueueCache();
    revalidatePath("/review-manager");
    revalidatePath("/thesis-management");
    revalidatePath("/repository");

    return { success: true, toStatus };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
