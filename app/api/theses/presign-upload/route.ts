import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getVerifiedUserId } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPresignedUploadUrl } from "@/lib/storage/r2";

const presignSchema = z.object({
  thesisId: z.string().uuid("Invalid thesis ID"),
  versionNumber: z.number().int().positive("Version number must be positive"),
  contentType: z.literal("application/pdf", {
    message: "Only PDF documents (application/pdf) are permitted.",
  }),
});

export async function POST(request: NextRequest) {
  let userId: string | null = null;

  // 1. Try checking auth header first (e.g. Bearer token)
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    const admin = createAdminClient();
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (!userError && userData.user) {
      userId = userData.user.id;
    }
  }

  // 2. Fall back to Supabase SSR cookie session
  if (!userId) {
    userId = await getVerifiedUserId();
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = presignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Validation error" },
      { status: 400 },
    );
  }

  const { thesisId, versionNumber, contentType } = parsed.data;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, status")
    .eq("id", userId)
    .single();

  if (!profile || profile.status !== "active") {
    return NextResponse.json(
      { error: "Forbidden: Account is inactive or not found." },
      { status: 403 },
    );
  }

  // Check if thesis record already exists in database
  const { data: thesis } = await admin
    .from("theses")
    .select("id, owner_id, status")
    .eq("id", thesisId)
    .maybeSingle();

  if (thesis) {
    const isStaff = ["librarian", "admin", "super_admin"].includes(profile.role);
    const isOwner = thesis.owner_id === userId;

    const { data: coauthor } = await admin
      .from("thesis_authors")
      .select("id")
      .eq("thesis_id", thesisId)
      .eq("profile_id", userId)
      .maybeSingle();

    const isAuthor = isOwner || !!coauthor;

    if (!isStaff && !isAuthor) {
      return NextResponse.json(
        { error: "Forbidden: You are not authorized to upload manuscripts for this thesis." },
        { status: 403 },
      );
    }
  } else {
    // New thesis submission workflow: thesis record is committed after direct R2 upload
    // Only version 1 can be presigned before thesis record creation
    if (versionNumber !== 1) {
      return NextResponse.json({ error: "Thesis record not found." }, { status: 404 });
    }
  }

  // Key structure required by SPEC: submissions/{thesisId}/v{n}/manuscript.pdf
  const r2Key = `submissions/${thesisId}/v${versionNumber}/manuscript.pdf`;

  try {
    const { url } = await createPresignedUploadUrl({
      key: r2Key,
      contentType,
      expiresInSeconds: 900, // 15 minutes per SPEC
    });

    return NextResponse.json({
      url,
      key: r2Key,
      expiresInSeconds: 900,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
