import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createPresignedDownloadUrl } from "@/lib/storage/r2";

const uuidSchema = z.string().uuid();

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid thesis identifier" }, { status: 400 });
  }

  const thesisId = parsed.data;
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  // 1. Check public visibility criteria: published, non-confidential, embargo expired
  const { data: thesis, error: thesisError } = await admin
    .from("theses")
    .select("id, title, status, is_confidential, embargo_until")
    .eq("id", thesisId)
    .single();

  if (thesisError || !thesis) {
    return NextResponse.json({ error: "Thesis manuscript not found" }, { status: 404 });
  }

  if (thesis.status !== "published") {
    return NextResponse.json(
      { error: "Forbidden: Manuscript is not yet published in the public archive." },
      { status: 403 },
    );
  }

  if (thesis.is_confidential) {
    return NextResponse.json(
      { error: "Forbidden: Manuscript is designated as confidential." },
      { status: 403 },
    );
  }

  if (thesis.embargo_until && new Date(thesis.embargo_until) > new Date(nowIso)) {
    return NextResponse.json(
      { error: `Forbidden: Manuscript is under embargo until ${new Date(thesis.embargo_until).toLocaleDateString()}.` },
      { status: 403 },
    );
  }

  // 2. Fetch the latest verified manuscript version
  const { data: latestVersion, error: versionError } = await admin
    .from("thesis_versions")
    .select("id, version_number, r2_key")
    .eq("thesis_id", thesisId)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();

  if (versionError || !latestVersion) {
    return NextResponse.json(
      { error: "No manuscript document found for this published thesis." },
      { status: 404 },
    );
  }

  // 3. Generate ephemeral signed URL (inline display for PDF reader)
  // Per SPEC: The signed URL is generated per request and NEVER stored in Redis or database.
  // PDF bytes never pass through Next.js server.
  const cleanTitle = thesis.title.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
  const downloadUrl = await createPresignedDownloadUrl({
    key: latestVersion.r2_key,
    expiresInSeconds: 900, // 15 minutes ephemeral expiry
    inline: true,
    filename: `${cleanTitle}.pdf`,
  });

  // 4. Temporary Redirect (307) directly to Cloudflare R2
  return NextResponse.redirect(downloadUrl, {
    status: 307,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
