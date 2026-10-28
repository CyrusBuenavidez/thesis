import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getVerifiedUserId, getCurrentUserProfile } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPresignedDownloadUrl } from "@/lib/storage/r2";
import { logConfidentialAccess } from "@/lib/logging/access-logs";

const docxRequestSchema = z.object({
  password: z.string().min(1, "Password is required for re-verification"),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: thesisId } = await context.params;

  // 1. Session verification
  const admin = createAdminClient();
  const authHeader = request.headers.get("Authorization");
  let user: { id: string } | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const { data: userData } = await admin.auth.getUser(token);
    if (userData.user) {
      user = { id: userData.user.id };
    }
  }

  if (!user) {
    const userId = await getVerifiedUserId();
    if (userId) {
      user = { id: userId };
    }
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Role verification: only librarian, admin, or super_admin
  const currentProfile = await getCurrentUserProfile();
  const profile = currentProfile?.id === user.id
    ? currentProfile
    : (await admin.from("profiles").select("role, email").eq("id", user.id).maybeSingle()).data;

  const isStaff = ["librarian", "admin", "super_admin"].includes(profile?.role || "");
  if (!isStaff) {
    return NextResponse.json(
      { error: "Forbidden: DOCX manuscript export is restricted to Library and Admin staff." },
      { status: 403 },
    );
  }

  // 3. Parse and validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = docxRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Validation error" },
      { status: 400 },
    );
  }

  // 4. Password Re-verification per SPEC 5.2
  const email = profile?.email;
  if (!email) {
    return NextResponse.json({ error: "User email not found" }, { status: 400 });
  }

  const authClient = await createClient();
  const { error: reAuthError } = await authClient.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });

  if (reAuthError) {
    return NextResponse.json(
      { error: "Password re-verification failed. Please re-enter your valid credentials." },
      { status: 401 },
    );
  }

  // 5. Fetch thesis and check docx_r2_key on latest version
  const { data: thesis, error: thesisError } = await admin
    .from("theses")
    .select("id, title, is_confidential")
    .eq("id", thesisId)
    .single();

  if (thesisError || !thesis) {
    return NextResponse.json({ error: "Thesis record not found" }, { status: 404 });
  }

  const { data: latestVersion } = await admin
    .from("thesis_versions")
    .select("docx_r2_key, version_number")
    .eq("thesis_id", thesisId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestVersion?.docx_r2_key) {
    return NextResponse.json(
      { error: "No editable DOCX manuscript attached to this thesis record." },
      { status: 404 },
    );
  }

  // 6. Log confidential access if applicable
  if (thesis.is_confidential) {
    await logConfidentialAccess({
      thesisId,
      actorId: user.id,
      kind: "docx_export",
    });
  }

  // 7. Generate ephemeral presigned download URL (5 minutes)
  const cleanTitle = thesis.title.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50);
  const downloadUrl = await createPresignedDownloadUrl({
    key: latestVersion.docx_r2_key,
    expiresInSeconds: 300,
    filename: `${cleanTitle}.docx`,
  });

  return NextResponse.json({
    success: true,
    downloadUrl,
  });
}
