import { type NextRequest, NextResponse } from "next/server";

import { getVerifiedUserId } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPresignedDownloadUrl } from "@/lib/storage/r2";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: thesisId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const versionParam = searchParams.get("version");
  const inline = searchParams.get("inline") === "true";

  const userId = await getVerifiedUserId();
  const admin = createAdminClient();

  // Run thesis fetch and user authorization checks concurrently
  const [thesisRes, profileRes, coauthorRes] = await Promise.all([
    admin
      .from("theses")
      .select("id, title, owner_id, primary_supervisor_id, status, is_confidential, embargo_until")
      .eq("id", thesisId)
      .maybeSingle(),
    userId
      ? admin.from("profiles").select("role").eq("id", userId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    userId
      ? admin
          .from("thesis_authors")
          .select("id")
          .eq("thesis_id", thesisId)
          .eq("profile_id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const thesis = thesisRes.data;
  if (!thesis) {
    return NextResponse.json({ error: "Thesis record not found." }, { status: 404 });
  }

  // 2. Check authorization
  let isAuthorized = false;

  if (userId) {
    const role = profileRes.data?.role || "";
    const isStaff = ["librarian", "admin", "super_admin"].includes(role);
    const isOwner = thesis.owner_id === userId;
    const isSupervisor = thesis.primary_supervisor_id === userId;
    const isCoauthor = Boolean(coauthorRes.data);

    if (isStaff || isOwner || isSupervisor || isCoauthor) {
      isAuthorized = true;
    }
  }

  // If not staff/author/supervisor, check if publicly accessible
  if (!isAuthorized) {
    const isPublished = thesis.status === "published";
    const notConfidential = !thesis.is_confidential;
    const embargoExpired =
      !thesis.embargo_until || new Date(thesis.embargo_until) <= new Date();

    if (isPublished && notConfidential && embargoExpired) {
      isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    return NextResponse.json(
      { error: "Forbidden: You are not authorized to access this document." },
      { status: 403 },
    );
  }

  // 3. Find requested version or latest version
  let versionQuery = admin
    .from("thesis_versions")
    .select("id, version_number, r2_key")
    .eq("thesis_id", thesisId);

  if (versionParam) {
    const vNum = parseInt(versionParam, 10);
    if (!isNaN(vNum)) {
      versionQuery = versionQuery.eq("version_number", vNum);
    }
  }

  const { data: versions, error: versionError } = await versionQuery
    .order("version_number", { ascending: false })
    .limit(1);

  const version = versions?.[0];

  if (versionError || !version) {
    return NextResponse.json(
      { error: "No manuscript file version found for this thesis." },
      { status: 404 },
    );
  }

  // 4. Generate signed download/view URL
  const safeFilename = `${thesis.title.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50)}_v${version.version_number}.pdf`;
  const signedUrl = await createPresignedDownloadUrl({
    key: version.r2_key,
    expiresInSeconds: 900,
    filename: safeFilename,
    inline,
  });

  // 5. Log access to access_logs if user is authenticated
  if (userId) {
    try {
      await admin.from("access_logs").insert({
        thesis_id: thesisId,
        version_id: version.id,
        actor_id: userId,
        kind: inline ? "view" : "download",
      });
    } catch (logErr) {
      console.warn("Failed to write to access_logs:", logErr);
    }
  }

  // If JSON requested explicitly
  if (request.headers.get("accept")?.includes("application/json")) {
    return NextResponse.json({
      url: signedUrl,
      expiresInSeconds: 900,
      versionNumber: version.version_number,
    });
  }

  // Otherwise redirect directly to signed URL
  return NextResponse.redirect(signedUrl, { status: 307 });
}
