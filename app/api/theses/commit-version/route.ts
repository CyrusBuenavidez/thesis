import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getVerifiedUserId } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyR2PdfObject } from "@/lib/storage/r2";

const commitVersionSchema = z.object({
  thesisId: z.string().uuid("Invalid thesis ID"),
  versionNumber: z.number().int().positive("Version number must be positive"),
  r2Key: z.string().min(1, "R2 key is required"),
  changeNotes: z.string().trim().optional(),
});

export async function POST(request: NextRequest) {
  const userId = await getVerifiedUserId();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = commitVersionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Validation error" },
      { status: 400 },
    );
  }

  const { thesisId, versionNumber, r2Key, changeNotes } = parsed.data;

  // Expected canonical key per SPEC
  const expectedKey = `submissions/${thesisId}/v${versionNumber}/manuscript.pdf`;
  if (r2Key !== expectedKey) {
    return NextResponse.json(
      { error: `Invalid R2 storage key. Expected format: ${expectedKey}` },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Check thesis existence and user permissions
  const { data: thesis, error: thesisError } = await admin
    .from("theses")
    .select("id, owner_id, status, primary_supervisor_id")
    .eq("id", thesisId)
    .single();

  if (thesisError || !thesis) {
    return NextResponse.json({ error: "Thesis record not found." }, { status: 404 });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  const isStaff = ["librarian", "admin", "super_admin"].includes(profile?.role || "");
  const isOwner = thesis.owner_id === userId;

  const { data: coauthor } = await admin
    .from("thesis_authors")
    .select("id")
    .eq("thesis_id", thesisId)
    .eq("profile_id", userId)
    .maybeSingle();

  if (!isStaff && !isOwner && !coauthor) {
    return NextResponse.json(
      { error: "Forbidden: You are not authorized to commit versions for this thesis." },
      { status: 403 },
    );
  }

  // 1. Verify the object in R2 (exists, at most 50 MB, PDF header, compute sha256)
  let verified;
  try {
    verified = await verifyR2PdfObject(r2Key);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // 2. Insert record into thesis_versions
  const { data: versionRow, error: versionInsertError } = await admin
    .from("thesis_versions")
    .insert({
      thesis_id: thesisId,
      version_number: versionNumber,
      r2_key: r2Key,
      file_size: verified.fileSize,
      sha256: verified.sha256,
      change_notes: changeNotes || null,
      uploaded_by: userId,
    })
    .select()
    .single();

  if (versionInsertError) {
    return NextResponse.json(
      { error: `Failed to commit version: ${versionInsertError.message}` },
      { status: 500 },
    );
  }

  // 3. If thesis was in revision_requested, moving to submitted closes the loop per SPEC
  if (thesis.status === "revision_requested") {
    try {
      const supabase = await createClient();
      await supabase.rpc("transition_thesis_status", {
        p_thesis_id: thesisId,
        p_to_status: "submitted",
        p_reason: changeNotes ? `Revision v${versionNumber}: ${changeNotes}` : `Revision v${versionNumber} submitted`,
      });
    } catch (transitionErr) {
      console.warn("Could not auto-transition revision to submitted:", transitionErr);
    }
  }

  return NextResponse.json({
    success: true,
    versionId: versionRow.id,
    versionNumber,
    fileSize: verified.fileSize,
    sha256: verified.sha256,
    r2Key,
  });
}
