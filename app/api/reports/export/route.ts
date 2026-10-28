import { type NextRequest, NextResponse } from "next/server";
import { getVerifiedUserId, getCurrentUserProfile } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  // 1. Role verification: only Librarian, Admin, or Super Admin can export reports
  const admin = createAdminClient();
  const authHeader = request.headers.get("Authorization");
  let userId: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const { data: userData } = await admin.auth.getUser(token);
    if (userData.user) {
      userId = userData.user.id;
    }
  }

  if (!userId) {
    userId = await getVerifiedUserId();
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getCurrentUserProfile();
  const role = profile?.id === userId ? profile.role : (
    (await admin.from("profiles").select("role").eq("id", userId).maybeSingle()).data?.role
  );

  const isStaff = ["librarian", "admin", "super_admin"].includes(role || "");
  if (!isStaff) {
    return NextResponse.json(
      { error: "Forbidden: Only institutional staff can export thesis repository reports." },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get("status");
  const deptFilter = searchParams.get("department");

  const encoder = new TextEncoder();
  const CHUNK_SIZE = 500; // 500-row chunks per SPEC

  // 2. Build streaming response with UTF-8 BOM
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Write UTF-8 Byte Order Mark (BOM: \uFEFF) as the first bytes per SPEC
        // Ensures Microsoft Excel on Windows renders accented characters (ñ, é, ó) correctly
        controller.enqueue(encoder.encode("\uFEFF"));

        // Write CSV Header
        const headers = [
          "Thesis ID",
          "Title",
          "Author Names",
          "Department",
          "Program",
          "Status",
          "Graduation Year",
          "Published Date",
          "DOI Identifier",
          "License",
          "Is Confidential",
          "Embargo Until",
          "Publication Consent Accepted At",
          "Created Date",
        ];
        controller.enqueue(encoder.encode(headers.map(escapeCsvField).join(",") + "\r\n"));

        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          let query = admin
            .from("theses")
            .select(`
              id,
              title,
              author_names,
              department,
              program,
              status,
              year,
              published_at,
              doi,
              license,
              is_confidential,
              embargo_until,
              consent_accepted_at,
              created_at
            `)
            .order("created_at", { ascending: false })
            .range(offset, offset + CHUNK_SIZE - 1);

          const VALID_STATUSES = [
            "draft",
            "submitted",
            "under_review",
            "revision_requested",
            "accepted",
            "rejected",
            "published",
            "archived",
          ];
          if (statusFilter && statusFilter !== "all" && VALID_STATUSES.includes(statusFilter)) {
            query = query.eq("status", statusFilter);
          }
          if (deptFilter && deptFilter !== "all") {
            query = query.eq("department", deptFilter);
          }

          const { data: chunk, error } = await query;

          if (error) {
            console.error("CSV report export query error:", error);
            controller.error(error);
            return;
          }

          if (!chunk || chunk.length === 0) {
            hasMore = false;
            break;
          }

          // Format rows in 500-row batch
          let csvBuffer = "";
          for (const item of chunk) {
            const authors = (item.author_names || []).join("; ");
            const row = [
              item.id,
              item.title,
              authors,
              item.department,
              item.program,
              item.status,
              item.year || "",
              item.published_at || "",
              item.doi || "",
              item.license || "",
              item.is_confidential ? "Yes" : "No",
              item.embargo_until || "",
              item.consent_accepted_at || "",
              item.created_at || "",
            ];
            csvBuffer += row.map(escapeCsvField).join(",") + "\r\n";
          }

          controller.enqueue(encoder.encode(csvBuffer));

          if (chunk.length < CHUNK_SIZE) {
            hasMore = false;
          } else {
            offset += CHUNK_SIZE;
          }
        }

        controller.close();
      } catch (err) {
        console.error("Stream generation error:", err);
        controller.error(err);
      }
    },
  });

  const timestamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pecit-theses-report-${timestamp}.csv"`,
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  // If field contains quotes, commas, or newlines, quote and escape internal quotes
  if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}
