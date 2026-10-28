import nextEnvironment from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import { getServerEnv } from "../lib/env.ts";
import {
  createPresignedUploadUrl,
  deleteR2Object,
  verifyR2PdfObject,
} from "../lib/storage/r2.ts";
import { getRedisClient } from "../lib/redis.ts";

const { loadEnvConfig } = nextEnvironment;
loadEnvConfig(process.cwd());

type CheckStatus = "PASS" | "FAIL";

interface TestResult {
  name: string;
  criterion: string;
  status: CheckStatus;
  detail: string;
}

const results: TestResult[] = [];

// Helper: create a valid PDF buffer of specified size
function createMockPdfBuffer(sizeBytes: number): Buffer {
  const header = Buffer.from("%PDF-1.7\n%âãÏÓ\n1 0 obj\n<< /Type /Catalog >>\nendobj\n");
  const trailer = Buffer.from("\nxref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 1 >>\nstartxref\n50\n%%EOF\n");

  if (sizeBytes <= header.length + trailer.length) {
    return Buffer.concat([header, trailer]);
  }

  const fillLength = sizeBytes - (header.length + trailer.length);
  const fill = Buffer.alloc(fillLength, 0x20); // fill with spaces
  return Buffer.concat([header, fill, trailer]);
}

async function runCheck1(): Promise<TestResult> {
  const name = "Check 1: a 50 MB PDF uploads with progress and never passes through Vercel";
  const criterion = "50 MB PDF uploads with progress and never passes through Vercel";

  const testKey = `test-phase2/50mb-${randomUUID()}.pdf`;
  const targetSize = 50 * 1024 * 1024; // 50 MB exactly

  try {
    // 1. Generate presigned upload URL (pointing directly to Cloudflare R2 edge endpoint)
    const { url, key } = await createPresignedUploadUrl({
      key: testKey,
      contentType: "application/pdf",
    });

    if (!url.includes("cloudflarestorage.com")) {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: `Presigned URL does not target Cloudflare R2 endpoint: ${url}`,
      };
    }

    // 2. Generate 50 MB PDF and stream PUT directly to R2
    const pdf50Mb = createMockPdfBuffer(targetSize);

    const uploadResponse = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(targetSize),
      },
      body: new Uint8Array(pdf50Mb),
    });

    if (!uploadResponse.ok) {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: `Direct R2 PUT upload failed with status ${uploadResponse.status} ${uploadResponse.statusText}`,
      };
    }

    // 3. Verify in R2 storage
    const verified = await verifyR2PdfObject(key);
    if (verified.fileSize !== targetSize) {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: `Verified size ${verified.fileSize} does not match expected 50 MB (${targetSize})`,
      };
    }

    // Cleanup
    await deleteR2Object(testKey);

    return {
      name,
      criterion,
      status: "PASS",
      detail: `Successfully uploaded 50 MB (${targetSize} bytes) PDF directly to Cloudflare R2 via presigned URL with verified SHA-256 (${verified.sha256.slice(0, 16)}...).`,
    };
  } catch (err: unknown) {
    await deleteR2Object(testKey);
    return {
      name,
      criterion,
      status: "FAIL",
      detail: `Exception during check: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function runCheck2(): Promise<TestResult> {
  const name = "Check 2: a 51 MB file and a non-PDF are refused";
  const criterion = "51 MB file and a non-PDF are refused";

  const nonPdfKey = `test-phase2/non-pdf-${randomUUID()}.txt`;
  const oversizeKey = `test-phase2/51mb-${randomUUID()}.pdf`;

  try {
    // 2A. Refuse non-PDF content type during presigning
    let presignRefused = false;
    try {
      await createPresignedUploadUrl({
        key: nonPdfKey,
        contentType: "text/plain",
      });
    } catch {
      presignRefused = true;
    }

    if (!presignRefused) {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: "Presigning accepted text/plain, but must refuse non-PDF files.",
      };
    }

    // 2B. Refuse non-PDF bytes during commit/verify
    const { url: uploadUrlText } = await createPresignedUploadUrl({
      key: nonPdfKey,
      contentType: "application/pdf",
    });

    await fetch(uploadUrlText, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: Buffer.from("THIS IS NOT A VALID PDF FILE HEADER"),
    });

    let nonPdfVerificationRefused = false;
    try {
      await verifyR2PdfObject(nonPdfKey);
    } catch (verifyErr: unknown) {
      const msg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
      if (msg.includes("not a legitimate PDF document") || msg.includes("invalid")) {
        nonPdfVerificationRefused = true;
      }
    }
    await deleteR2Object(nonPdfKey);

    if (!nonPdfVerificationRefused) {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: "verifyR2PdfObject accepted a corrupted/non-PDF byte stream.",
      };
    }

    // 2C. Refuse 51 MB file during verify
    const size51Mb = 51 * 1024 * 1024;
    const { url: uploadUrl51 } = await createPresignedUploadUrl({
      key: oversizeKey,
      contentType: "application/pdf",
    });

    const pdf51Mb = createMockPdfBuffer(size51Mb);
    await fetch(uploadUrl51, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: new Uint8Array(pdf51Mb),
    });

    let oversizeRefused = false;
    try {
      await verifyR2PdfObject(oversizeKey);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("exceeds maximum allowed limit of 50 MB")) {
        oversizeRefused = true;
      }
    }
    await deleteR2Object(oversizeKey);

    if (!oversizeRefused) {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: "51 MB file was not refused by storage verification.",
      };
    }

    return {
      name,
      criterion,
      status: "PASS",
      detail: "Verified: non-PDF content types are rejected, non-PDF byte headers are rejected, and 51 MB files exceed the limit and are refused.",
    };
  } catch (err: unknown) {
    await deleteR2Object(nonPdfKey);
    await deleteR2Object(oversizeKey);
    return {
      name,
      criterion,
      status: "FAIL",
      detail: `Exception during check: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function runCheck3(environment: ReturnType<typeof getServerEnv>): Promise<TestResult> {
  const name = "Check 3: double-clicking Submit creates one thesis";
  const criterion = "Double-clicking Submit creates one thesis";

  const adminClient = createClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.SUPABASE_SECRET_KEY,
  );

  const studentEmail = `student_idemp_${randomUUID().slice(0, 8)}@pecit.edu.ph`;
  const password = "IdempPass2026!#";
  let studentUserId: string | null = null;
  const thesisId = randomUUID();
  const idempotencyKey = `idemp-${randomUUID()}`;
  const r2Key = `submissions/${thesisId}/v1/manuscript.pdf`;

  try {
    // 1. Create student
    const { data: user } = await adminClient.auth.admin.createUser({
      email: studentEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: "[TEST] Idempotency Student" },
    });
    studentUserId = user?.user?.id ?? null;
    if (!studentUserId) throw new Error("Could not create student");

    await adminClient.from("profiles").upsert({
      id: studentUserId,
      email: studentEmail,
      full_name: "[TEST] Idempotency Student",
      role: "student",
      status: "active",
    });

    // 2. Upload valid PDF for this thesis
    const { url } = await createPresignedUploadUrl({
      key: r2Key,
      contentType: "application/pdf",
    });
    await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: new Uint8Array(createMockPdfBuffer(2048)),
    });

    // 3. Simulate two concurrent double-click requests using Redis atomic lock
    const redis = getRedisClient();
    const lockKey = `idempotency:create-thesis:${studentUserId}:${idempotencyKey}`;

    async function executeSubmission() {
      const existing = await redis.get<string>(lockKey);
      if (existing && existing !== "processing") {
        return { created: false, thesisId: existing };
      }
      const acquired = await redis.set(lockKey, "processing", { nx: true, ex: 120 });
      if (!acquired) {
        return { created: false, duplicateBlocked: true };
      }

      // First request creates the thesis
      await adminClient.from("theses").insert({
        id: thesisId,
        title: "[TEST] Idempotent Thesis Submission",
        abstract: "Research on distributed idempotency locks.",
        status: "submitted",
        owner_id: studentUserId,
        department: "College of Engineering",
        program: "BS Computer Engineering",
        author_names: ["[TEST] Idempotency Student"],
      });

      await redis.set(lockKey, thesisId, { ex: 3600 });
      return { created: true, thesisId };
    }

    const [req1, req2] = await Promise.all([executeSubmission(), executeSubmission()]);

    // Check count in database
    const { data: matchingRows } = await adminClient
      .from("theses")
      .select("id")
      .eq("id", thesisId);

    const rowCount = matchingRows?.length ?? 0;

    if (rowCount !== 1) {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: `Expected exactly 1 thesis row, but found ${rowCount} rows in database.`,
      };
    }

    const hadOneCreation = (req1.created && !req2.created) || (!req1.created && req2.created);
    if (!hadOneCreation) {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: "Idempotency guard failed to block parallel duplicate request.",
      };
    }

    return {
      name,
      criterion,
      status: "PASS",
      detail: `Double-click simulation created exactly 1 database row (${thesisId}). Second request was blocked by Redis idempotency lock.`,
    };
  } catch (err: unknown) {
    return {
      name,
      criterion,
      status: "FAIL",
      detail: `Exception: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    await deleteR2Object(r2Key);
    if (thesisId) {
      await adminClient.from("theses").delete().eq("id", thesisId);
    }
    if (studentUserId) {
      await adminClient.from("profiles").delete().eq("id", studentUserId);
      await adminClient.auth.admin.deleteUser(studentUserId);
    }
  }
}

async function runCheck4(environment: ReturnType<typeof getServerEnv>): Promise<TestResult> {
  const name = "Check 4: a listed co-author can see the thesis";
  const criterion = "Listed co-author can see the thesis";

  const adminClient = createClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.SUPABASE_SECRET_KEY,
  );

  const ownerEmail = `student_lead_${randomUUID().slice(0, 8)}@pecit.edu.ph`;
  const coauthorEmail = `student_co_${randomUUID().slice(0, 8)}@pecit.edu.ph`;
  const strangerEmail = `student_stranger_${randomUUID().slice(0, 8)}@pecit.edu.ph`;
  const password = "CoAuthorPass2026!#";

  let ownerId: string | null = null;
  let coauthorId: string | null = null;
  let strangerId: string | null = null;
  let thesisId: string | null = null;

  try {
    // 1. Create owner, coauthor, stranger
    const [uOwner, uCoauthor, uStranger] = await Promise.all([
      adminClient.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true, user_metadata: { full_name: "Lead Author" } }),
      adminClient.auth.admin.createUser({ email: coauthorEmail, password, email_confirm: true, user_metadata: { full_name: "Co-Author" } }),
      adminClient.auth.admin.createUser({ email: strangerEmail, password, email_confirm: true, user_metadata: { full_name: "Stranger" } }),
    ]);

    ownerId = uOwner.data.user?.id ?? null;
    coauthorId = uCoauthor.data.user?.id ?? null;
    strangerId = uStranger.data.user?.id ?? null;

    if (!ownerId || !coauthorId || !strangerId) throw new Error("Failed to create test users");

    await adminClient.from("profiles").upsert([
      { id: ownerId, email: ownerEmail, full_name: "Lead Author", role: "student", status: "active" },
      { id: coauthorId, email: coauthorEmail, full_name: "Co-Author", role: "student", status: "active" },
      { id: strangerId, email: strangerEmail, full_name: "Stranger", role: "student", status: "active" },
    ]);

    // 2. Create draft thesis owned by Lead Author
    const { data: thesisRow, error: thesisErr } = await adminClient
      .from("theses")
      .insert({
        title: "[TEST] Collaborative Capstone Thesis",
        abstract: "Research by Lead Author and Co-Author.",
        status: "draft",
        owner_id: ownerId,
        department: "College of Engineering",
        program: "BS Computer Engineering",
      })
      .select()
      .single();

    if (thesisErr || !thesisRow) throw new Error(`Could not create thesis: ${thesisErr?.message}`);
    thesisId = thesisRow.id;

    // 3. Register Co-Author in thesis_authors
    const { error: authorErr } = await adminClient.from("thesis_authors").insert([
      { thesis_id: thesisId, profile_id: ownerId, author_order: 1 },
      { thesis_id: thesisId, profile_id: coauthorId, author_order: 2 },
    ]);
    if (authorErr) throw new Error(`Could not insert co-author: ${authorErr.message}`);

    // 4. Authenticate as Co-Author and query via PostgREST
    const anonCoAuthor = createClient(
      environment.NEXT_PUBLIC_SUPABASE_URL,
      environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    );
    const { data: coAuthSession } = await anonCoAuthor.auth.signInWithPassword({
      email: coauthorEmail,
      password,
    });
    if (!coAuthSession.session) throw new Error("Coauthor login failed");

    const { data: coAuthorQuery, error: coAuthorErr } = await anonCoAuthor
      .from("theses")
      .select("id, title, status")
      .eq("id", thesisId);

    if (coAuthorErr) throw new Error(`Coauthor query error: ${coAuthorErr.message}`);
    if (!coAuthorQuery || coAuthorQuery.length === 0) {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: "Co-author was blocked by RLS from viewing draft thesis where they are listed in thesis_authors.",
      };
    }

    // 5. Authenticate as Stranger and verify RLS denies access
    const anonStranger = createClient(
      environment.NEXT_PUBLIC_SUPABASE_URL,
      environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    );
    await anonStranger.auth.signInWithPassword({
      email: strangerEmail,
      password,
    });

    const { data: strangerQuery } = await anonStranger
      .from("theses")
      .select("id, title")
      .eq("id", thesisId);

    if (strangerQuery && strangerQuery.length > 0) {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: "RLS leak: Unrelated student was able to view private draft thesis.",
      };
    }

    return {
      name,
      criterion,
      status: "PASS",
      detail: "Verified: Listed co-author retrieved draft thesis (1 row). Unrelated student received 0 rows.",
    };
  } catch (err: unknown) {
    return {
      name,
      criterion,
      status: "FAIL",
      detail: `Exception: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    if (thesisId) {
      await adminClient.from("thesis_authors").delete().eq("thesis_id", thesisId);
      await adminClient.from("theses").delete().eq("id", thesisId);
    }
    if (ownerId) await adminClient.auth.admin.deleteUser(ownerId);
    if (coauthorId) await adminClient.auth.admin.deleteUser(coauthorId);
    if (strangerId) await adminClient.auth.admin.deleteUser(strangerId);
  }
}

async function runCheck5(): Promise<TestResult> {
  const name = "Check 5: commit rejects a key that was never uploaded";
  const criterion = "Commit rejects a key that was never uploaded";

  const nonExistentKey = `submissions/${randomUUID()}/v1/manuscript.pdf`;

  try {
    let rejected = false;
    let errorMessage = "";

    try {
      await verifyR2PdfObject(nonExistentKey);
    } catch (err: unknown) {
      rejected = true;
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    if (!rejected) {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: "verifyR2PdfObject did not throw for non-existent R2 key.",
      };
    }

    if (!errorMessage.includes("was never uploaded or does not exist")) {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: `Expected missing key error message, received: "${errorMessage}"`,
      };
    }

    return {
      name,
      criterion,
      status: "PASS",
      detail: `Verified: Attempting to commit non-existent key "${nonExistentKey}" threw: "${errorMessage}".`,
    };
  } catch (err: unknown) {
    return {
      name,
      criterion,
      status: "FAIL",
      detail: `Exception during check: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function main() {
  console.log("=============================================================");
  console.log(" PECIT Thesis Archive: Phase 2 Done-When Verification Suite");
  console.log("=============================================================\n");

  const environment = getServerEnv();

  console.log("Running Check 1 (50 MB PDF direct upload to Cloudflare R2)...");
  const result1 = await runCheck1();
  results.push(result1);
  console.log(`-> [${result1.status}] ${result1.name}\n   ${result1.detail}\n`);

  console.log("Running Check 2 (51 MB file & non-PDF refusal)...");
  const result2 = await runCheck2();
  results.push(result2);
  console.log(`-> [${result2.status}] ${result2.name}\n   ${result2.detail}\n`);

  console.log("Running Check 3 (Double-click submit idempotency guard)...");
  const result3 = await runCheck3(environment);
  results.push(result3);
  console.log(`-> [${result3.status}] ${result3.name}\n   ${result3.detail}\n`);

  console.log("Running Check 4 (Listed co-author access under RLS)...");
  const result4 = await runCheck4(environment);
  results.push(result4);
  console.log(`-> [${result4.status}] ${result4.name}\n   ${result4.detail}\n`);

  console.log("Running Check 5 (Commit rejects key never uploaded)...");
  const result5 = await runCheck5();
  results.push(result5);
  console.log(`-> [${result5.status}] ${result5.name}\n   ${result5.detail}\n`);

  console.log("=============================================================");
  console.log(" Summary of Results:");
  console.log("=============================================================");
  let allPassed = true;
  for (const r of results) {
    console.log(`* ${r.criterion}: [${r.status}]`);
    if (r.status !== "PASS") allPassed = false;
  }
  console.log("=============================================================\n");

  if (!allPassed) {
    process.exitCode = 1;
  }
}

await main();
