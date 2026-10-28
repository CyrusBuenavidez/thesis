"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { verifyR2PdfObject, createPresignedDownloadUrl } from "@/lib/storage/r2";
import { getRedisClient } from "@/lib/redis";
import { runJobInline } from "@/lib/jobs";
import { runDuplicateCheckJob } from "@/lib/similarity/duplicate-check";

export interface ThesisAuthorInfo {
  id: string;
  profileId: string;
  fullName: string;
  email: string;
  authorOrder: number;
}

export interface ThesisVersionInfo {
  id: string;
  versionNumber: number;
  r2Key: string;
  fileSize: number;
  sha256: string;
  changeNotes: string | null;
  createdAt: string;
}

export interface StudentThesisCard {
  id: string;
  title: string;
  abstract: string;
  status: string;
  department: string;
  program: string;
  keywords: string[];
  authorNames: string[];
  year: number | null;
  license: string | null;
  isConfidential: boolean;
  embargoUntil: string | null;
  consentAcceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isOwner: boolean;
  supervisorName: string | null;
  versions: ThesisVersionInfo[];
  coAuthors: ThesisAuthorInfo[];
  latestRemark?: string;
}

export type ThesisManagementItem = StudentThesisCard;
export const getThesisManagementList = getMyTheses;

export async function getMyTheses(): Promise<StudentThesisCard[]> {
  const user = await requireUser();
  const admin = createAdminClient();

  const isStaff =
    user.role === "admin" ||
    user.role === "super_admin" ||
    user.role === "librarian";

  let query = admin.from("theses").select(`
    id,
    title,
    abstract,
    status,
    department,
    program,
    keywords,
    author_names,
    year,
    license,
    is_confidential,
    embargo_until,
    consent_accepted_at,
    created_at,
    updated_at,
    owner_id,
    primary_supervisor_id,
    primary_supervisor:profiles!theses_primary_supervisor_id_fkey(full_name),
    versions:thesis_versions(id, version_number, r2_key, file_size, sha256, change_notes, created_at),
    coauthors:thesis_authors(id, profile_id, author_order, profile:profiles!thesis_authors_profile_id_fkey(full_name, email))
  `);

  if (!isStaff) {
    // Find all thesis IDs where user is owner or listed in thesis_authors
    const { data: authoredList } = await admin
      .from("thesis_authors")
      .select("thesis_id")
      .eq("profile_id", user.id);

    const authoredIds = (authoredList || []).map((a) => a.thesis_id);
    query = query.or(`owner_id.eq.${user.id},id.in.(${authoredIds.length ? authoredIds.join(",") : "00000000-0000-0000-0000-000000000000"})`);
  }

  const { data: rawTheses, error } = await query.order("created_at", { ascending: false });

  if (error || !rawTheses) {
    console.error("Error fetching student theses:", error);
    return [];
  }

  // Also fetch latest activity log remark for any revision_requested or rejected theses
  const thesisIds = rawTheses.map((t) => t.id);
  const { data: logs } = await admin
    .from("activity_logs")
    .select("thesis_id, reason, created_at")
    .in("thesis_id", thesisIds.length ? thesisIds : ["00000000-0000-0000-0000-000000000000"])
    .order("created_at", { ascending: false });

  const remarksMap = new Map<string, string>();
  if (logs) {
    for (const log of logs) {
      if (log.thesis_id && log.reason && !remarksMap.has(log.thesis_id)) {
        remarksMap.set(log.thesis_id, log.reason);
      }
    }
  }

  return rawTheses.map((t) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const supervisorData = t.primary_supervisor as any;
    const supervisorName = supervisorData?.full_name || null;

    const versionsList: ThesisVersionInfo[] = (t.versions as any[] || [])
      .map((v) => ({
        id: v.id,
        versionNumber: v.version_number,
        r2Key: v.r2_key,
        fileSize: Number(v.file_size),
        sha256: v.sha256,
        changeNotes: v.change_notes,
        createdAt: v.created_at,
      }))
      .sort((a, b) => b.versionNumber - a.versionNumber);

    const coAuthorsList: ThesisAuthorInfo[] = (t.coauthors as any[] || []).map((ca) => ({
      id: ca.id,
      profileId: ca.profile_id,
      fullName: ca.profile?.full_name || "Unknown",
      email: ca.profile?.email || "",
      authorOrder: ca.author_order,
    }));
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return {
      id: t.id,
      title: t.title,
      abstract: t.abstract,
      status: t.status,
      department: t.department,
      program: t.program,
      keywords: t.keywords || [],
      authorNames: t.author_names || [],
      year: t.year,
      license: t.license,
      isConfidential: t.is_confidential,
      embargoUntil: t.embargo_until,
      consentAcceptedAt: t.consent_accepted_at,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
      isOwner: t.owner_id === user.id,
      supervisorName,
      versions: versionsList,
      coAuthors: coAuthorsList,
      latestRemark: remarksMap.get(t.id),
    };
  });
}

export async function getEligibleStudents(): Promise<{ id: string; fullName: string; email: string }[]> {
  const user = await requireUser();
  const admin = createAdminClient();

  const { data } = await admin
    .from("profiles")
    .select("id, full_name, email")
    .eq("role", "student")
    .eq("status", "active")
    .neq("id", user.id)
    .order("full_name");

  return (data || []).map((p) => ({
    id: p.id,
    fullName: p.full_name,
    email: p.email,
  }));
}

export async function getEligibleAdvisors(): Promise<{ id: string; fullName: string; department: string | null }[]> {
  await requireUser();
  const admin = createAdminClient();

  const { data } = await admin
    .from("profiles")
    .select("id, full_name, department")
    .eq("role", "advisor")
    .eq("status", "active")
    .order("full_name");

  return (data || []).map((p) => ({
    id: p.id,
    fullName: p.full_name,
    department: p.department,
  }));
}

const submissionSchema = z.object({
  thesisId: z.string().uuid("Invalid thesis ID"),
  idempotencyKey: z.string().min(1, "Idempotency key required"),
  title: z.string().trim().min(5, "Title must be at least 5 characters"),
  abstract: z.string().trim().min(20, "Abstract must be at least 20 characters"),
  department: z.string().trim().min(2, "Department is required"),
  program: z.string().trim().min(2, "Program is required"),
  keywords: z.array(z.string().trim()).min(1, "At least one keyword is required"),
  coAuthorIds: z.array(z.string().uuid()),
  primarySupervisorId: z.string().uuid().nullable().optional(),
  license: z.string().min(1, "License selection is required"),
  isConfidential: z.boolean(),
  embargoUntil: z.string().nullable().optional(),
  consentAccepted: z.literal(true, {
    message: "You must accept the institutional publication agreement.",
  }),
  r2Key: z.string().min(1, "R2 key is required"),
});

export async function createThesisSubmission(input: z.infer<typeof submissionSchema>): Promise<{
  success: boolean;
  thesisId?: string;
  error?: string;
}> {
  const user = await requireUser();

  const parsed = submissionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Validation failed",
    };
  }

  const data = parsed.data;

  // 1. Idempotency Guard via Redis
  const redis = getRedisClient();
  const lockKey = `idempotency:create-thesis:${user.id}:${data.idempotencyKey}`;

  try {
    const existing = await redis.get<string>(lockKey);
    if (existing && existing !== "processing") {
      // Duplicate submission detected: return existing thesis immediately!
      return { success: true, thesisId: existing };
    }
    if (existing === "processing") {
      return { success: false, error: "Submission is already processing. Please wait." };
    }

    const acquired = await redis.set(lockKey, "processing", { nx: true, ex: 120 });
    if (!acquired) {
      return { success: false, error: "Submission in progress. Please do not double-click." };
    }
  } catch (redisErr) {
    console.warn("Redis idempotency check warning:", redisErr);
  }

  // 2. Expected R2 key verification
  const expectedKey = `submissions/${data.thesisId}/v1/manuscript.pdf`;
  if (data.r2Key !== expectedKey) {
    return {
      success: false,
      error: `Invalid R2 storage key. Must be ${expectedKey}`,
    };
  }

  // 3. Verify R2 object integrity (exists, <= 50MB, PDF header, sha256)
  let verified;
  try {
    verified = await verifyR2PdfObject(data.r2Key);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }

  const admin = createAdminClient();
  const supabase = await createClient();

  try {
    // 4. Insert thesis as draft
    const { error: thesisInsertError } = await admin
      .from("theses")
      .insert({
        id: data.thesisId,
        title: data.title,
        abstract: data.abstract,
        status: "draft",
        owner_id: user.id,
        primary_supervisor_id: data.primarySupervisorId || null,
        department: data.department,
        program: data.program,
        keywords: data.keywords,
        author_names: [user.full_name],
        license: data.license,
        is_confidential: data.isConfidential,
        embargo_until: data.embargoUntil || null,
        consent_accepted_at: new Date().toISOString(),
        consent_version: "2026-v1",
      });

    if (thesisInsertError) {
      throw new Error(`Failed to create thesis record: ${thesisInsertError.message}`);
    }

    // 5. Insert co-authors into thesis_authors
    const authorRows = [
      { thesis_id: data.thesisId, profile_id: user.id, author_order: 1 },
      ...data.coAuthorIds.map((coId, idx) => ({
        thesis_id: data.thesisId,
        profile_id: coId,
        author_order: idx + 2,
      })),
    ];

    const { error: authorsError } = await admin
      .from("thesis_authors")
      .insert(authorRows);

    if (authorsError) {
      throw new Error(`Failed to register co-authors: ${authorsError.message}`);
    }

    // 6. Insert version 1 into thesis_versions
    const { error: versionError } = await admin
      .from("thesis_versions")
      .insert({
        thesis_id: data.thesisId,
        version_number: 1,
        r2_key: data.r2Key,
        file_size: verified.fileSize,
        sha256: verified.sha256,
        change_notes: "Initial manuscript submission",
        uploaded_by: user.id,
      });

    if (versionError) {
      throw new Error(`Failed to record manuscript version: ${versionError.message}`);
    }

    // 7. Transition thesis status from draft to submitted via transition_thesis_status
    const { error: transitionError } = await supabase.rpc("transition_thesis_status", {
      p_thesis_id: data.thesisId,
      p_to_status: "submitted",
      p_reason: "Initial manuscript submission",
    });

    if (transitionError) {
      throw new Error(`Failed to transition thesis status to submitted: ${transitionError.message}`);
    }

    // 8. Commit thesisId to Redis idempotency key for 1 hour
    try {
      await redis.set(lockKey, data.thesisId, { ex: 3600 });
    } catch {
      // non-fatal
    }

    // 9. Dispatch duplicate check background job per SPEC
    await runJobInline(async () => {
      try {
        await runDuplicateCheckJob({
          thesisId: data.thesisId,
          title: data.title,
          abstract: data.abstract,
        });
      } catch (e) {
        console.warn("Duplicate check job notice:", e);
      }
    });

    revalidatePath("/thesis-management");
    return { success: true, thesisId: data.thesisId };
  } catch (err: unknown) {
    // If failure occurred, remove processing lock so user can retry
    try {
      await redis.del(lockKey);
    } catch {
      // non-fatal
    }
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

const revisionSchema = z.object({
  thesisId: z.string().uuid("Invalid thesis ID"),
  versionNumber: z.number().int().positive(),
  r2Key: z.string().min(1, "R2 key required"),
  changeNotes: z.string().trim().min(5, "Change notes must be at least 5 characters"),
});

export async function submitThesisRevision(input: z.infer<typeof revisionSchema>): Promise<{
  success: boolean;
  error?: string;
}> {
  const user = await requireUser();

  const parsed = revisionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || "Validation failed" };
  }

  const { thesisId, versionNumber, r2Key, changeNotes } = parsed.data;

  // Expected canonical key
  const expectedKey = `submissions/${thesisId}/v${versionNumber}/manuscript.pdf`;
  if (r2Key !== expectedKey) {
    return { success: false, error: `Invalid R2 storage key. Must be ${expectedKey}` };
  }

  // Verify R2 object
  let verified;
  try {
    verified = await verifyR2PdfObject(r2Key);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }

  const admin = createAdminClient();
  const supabase = await createClient();

  // Check thesis
  const { data: thesis } = await admin
    .from("theses")
    .select("status, owner_id")
    .eq("id", thesisId)
    .single();

  if (!thesis) {
    return { success: false, error: "Thesis record not found." };
  }

  // Insert version
  const { error: versionError } = await admin.from("thesis_versions").insert({
    thesis_id: thesisId,
    version_number: versionNumber,
    r2_key: r2Key,
    file_size: verified.fileSize,
    sha256: verified.sha256,
    change_notes: changeNotes,
    uploaded_by: user.id,
  });

  if (versionError) {
    return { success: false, error: `Failed to insert version: ${versionError.message}` };
  }

  // Transition to submitted
  const { error: transitionError } = await supabase.rpc("transition_thesis_status", {
    p_thesis_id: thesisId,
    p_to_status: "submitted",
    p_reason: `Revised manuscript v${versionNumber}: ${changeNotes}`,
  });

  if (transitionError) {
    return { success: false, error: `Status transition error: ${transitionError.message}` };
  }

  revalidatePath("/thesis-management");
  return { success: true };
}

export async function updateThesisMetadata(input: {
  thesisId: string;
  title: string;
  abstract: string;
  department: string;
  program: string;
  keywords: string[];
}): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();
  const admin = createAdminClient();

  const { data: thesis } = await admin
    .from("theses")
    .select("id, owner_id")
    .eq("id", input.thesisId)
    .single();

  if (!thesis) return { success: false, error: "Thesis record not found" };

  const isStaff = user.role === "admin" || user.role === "super_admin" || user.role === "librarian";
  if (!isStaff && thesis.owner_id !== user.id) {
    return { success: false, error: "Unauthorized to modify this record" };
  }

  const { error } = await admin
    .from("theses")
    .update({
      title: input.title.trim(),
      abstract: input.abstract.trim(),
      department: input.department.trim(),
      program: input.program.trim(),
      keywords: input.keywords,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.thesisId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/thesis-management");
  return { success: true };
}

export async function removeThesisRecord(
  thesisId: string,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();
  const admin = createAdminClient();
  const supabase = await createClient();

  const { data: thesis } = await admin
    .from("theses")
    .select("id, status, owner_id")
    .eq("id", thesisId)
    .single();

  if (!thesis) {
    return { success: false, error: "Record not found" };
  }

  const isStaff = user.role === "admin" || user.role === "super_admin" || user.role === "librarian";
  if (!isStaff && thesis.owner_id !== user.id) {
    return { success: false, error: "Unauthorized to remove this record." };
  }

  if (thesis.status === "draft") {
    const { error: delErr } = await admin.from("theses").delete().eq("id", thesisId);
    if (delErr) return { success: false, error: delErr.message };
  } else {
    const { error: trErr } = await supabase.rpc("transition_thesis_status", {
      p_thesis_id: thesisId,
      p_to_status: "archived",
      p_reason: reason || "Archived via Thesis Management",
    });
    if (trErr) {
      if (isStaff) {
        await admin.from("theses").update({ status: "archived" }).eq("id", thesisId);
      } else {
        return { success: false, error: trErr.message };
      }
    }
  }

  revalidatePath("/thesis-management");
  return { success: true };
}

export async function getThesisPreviewUrl(thesisId: string): Promise<string | null> {
  await requireUser();
  const admin = createAdminClient();

  const { data: latestVersion } = await admin
    .from("thesis_versions")
    .select("r2_key")
    .eq("thesis_id", thesisId)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();

  if (!latestVersion?.r2_key) return null;

  try {
    return await createPresignedDownloadUrl({
      key: latestVersion.r2_key,
      inline: true,
      expiresInSeconds: 3600,
    });
  } catch {
    return null;
  }
}
