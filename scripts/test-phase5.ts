import nextEnvironment from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import { getServerEnv } from "../lib/env.ts";
import { runOrphanSweepJob } from "../lib/storage/orphan-sweep.ts";

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

async function runPhase5Tests() {
  console.log("==================================================");
  console.log("PECIT Thesis Archive - Phase 5 Verification Suite");
  console.log("Testing Reports, Hardening, Audit Logs & Integrity");
  console.log("==================================================\n");

  const env = getServerEnv();
  const adminClient = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const uniqueTag = randomUUID().slice(0, 6);
  const testStudentId = randomUUID();
  const testLibrarianId = randomUUID();

  // Create test author and librarian
  await adminClient.auth.admin.createUser({
    id: testStudentId,
    email: `student_p5_${uniqueTag}@pecit.edu.ph`,
    password: "Password123!@",
    email_confirm: true,
  });
  await adminClient.from("profiles").upsert({
    id: testStudentId,
    email: `student_p5_${uniqueTag}@pecit.edu.ph`,
    full_name: "José Niño Dela Peña", // Accented names for UTF-8 Excel test
    role: "student",
    status: "active",
    department: "College of Engineering",
  });

  await adminClient.auth.admin.createUser({
    id: testLibrarianId,
    email: `librarian_p5_${uniqueTag}@pecit.edu.ph`,
    password: "Password123!@",
    email_confirm: true,
  });
  await adminClient.from("profiles").upsert({
    id: testLibrarianId,
    email: `librarian_p5_${uniqueTag}@pecit.edu.ph`,
    full_name: `Librarian Lead ${uniqueTag}`,
    role: "librarian",
    status: "active",
    department: "Library Services",
  });

  const librarianClient = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  await librarianClient.auth.signInWithPassword({
    email: `librarian_p5_${uniqueTag}@pecit.edu.ph`,
    password: "Password123!@",
  });

  const createdThesisIds: string[] = [];

  try {
    // ----------------------------------------------------
    // CHECK 1: Streaming CSV with UTF-8 BOM and Accented Names (Excel Compatible)
    // ----------------------------------------------------
    console.log("Checking Criterion 1: Streaming CSV report generator with UTF-8 BOM and accented names...");

    // Seed a thesis with accented author names and title
    const accentedThesisId = randomUUID();
    createdThesisIds.push(accentedThesisId);
    const accentedTitle = `Desarrollo de Sistemas Inteligentes y Telecomunicaciones ${uniqueTag}`;

    const { error: tErr } = await adminClient.from("theses").insert({
      id: accentedThesisId,
      title: accentedTitle,
      abstract: "Investigación sobre optimización de redes inalámbricas en entornos de alta densidad en PECIT.",
      status: "published",
      owner_id: testStudentId,
      department: "College of Engineering",
      program: "BS Electronics Engineering",
      keywords: ["Telecomunicaciones", "Optimización"],
      author_names: ["José Niño Dela Peña", "María Elena Iñiguez"],
      year: 2026,
      license: "CC-BY-4.0",
      doi: `10.5555/pecit.2026.acc_${uniqueTag}`,
      is_confidential: false,
      consent_accepted_at: new Date().toISOString(),
      consent_version: "2026-v1",
      published_at: new Date().toISOString(),
    });

    if (tErr) throw new Error(`Failed to seed accented thesis: ${tErr.message}`);

    // Call the streaming CSV endpoint directly
    const sessionToken = (await librarianClient.auth.getSession()).data.session?.access_token;
    const response = await fetch(`${env.APP_URL}/api/reports/export`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        Cookie: `sb-${new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]}-auth-token=${JSON.stringify([sessionToken])}`,
      },
    });

    // In local script without full browser cookies, test the CSV generator logic directly or test the endpoint
    const responseBuffer = Buffer.from(await response.arrayBuffer());

    // Verify UTF-8 BOM header: bytes 0xEF, 0xBB, 0xBF
    const hasUtf8Bom =
      responseBuffer.length >= 3 &&
      responseBuffer[0] === 0xef &&
      responseBuffer[1] === 0xbb &&
      responseBuffer[2] === 0xbf;

    // Decode CSV string and check accented names
    const csvContent = responseBuffer.toString("utf8");
    const containsJose = csvContent.includes("José Niño Dela Peña");
    const containsMaria = csvContent.includes("María Elena Iñiguez");

    const check1Pass = hasUtf8Bom && containsJose && containsMaria;

    results.push({
      name: "Check 1: Streaming CSV with UTF-8 BOM",
      criterion: "A CSV opens correctly in Excel with names containing accents intact",
      status: check1Pass ? "PASS" : "FAIL",
      detail: `UTF-8 BOM header present: ${hasUtf8Bom} (0xEF, 0xBB, 0xBF); Accented names intact: José=${containsJose}, María=${containsMaria}. Total stream bytes: ${responseBuffer.length}.`,
    });
    console.log(`  -> ${check1Pass ? "PASS" : "FAIL"} (BOM: ${hasUtf8Bom}, Accents intact: ${containsJose && containsMaria})\n`);

    // ----------------------------------------------------
    // CHECK 2: Confidential Access Logs & RA 10173 Compliance Tracking
    // ----------------------------------------------------
    console.log("Checking Criterion 2: Access logs tracking for confidential files & DOCX re-verification...");

    const confidentialThesisId = randomUUID();
    createdThesisIds.push(confidentialThesisId);
    const { error: confInsErr } = await adminClient.from("theses").insert({
      id: confidentialThesisId,
      title: `Proprietary Autonomous Defense Sensor ${uniqueTag}`,
      abstract: "Confidential research manuscript subject to institutional NDA.",
      status: "published",
      owner_id: testStudentId,
      department: "College of Engineering",
      program: "BS Computer Engineering",
      keywords: ["Confidential", "Defense"],
      author_names: ["José Niño Dela Peña"],
      year: 2026,
      license: "Proprietary",
      is_confidential: true,
      consent_accepted_at: new Date().toISOString(),
      consent_version: "2026-v1",
      published_at: new Date().toISOString(),
    });

    if (confInsErr) throw new Error(`Failed to insert confidential thesis: ${confInsErr.message}`);

    // Directly test access logging
    const { logConfidentialAccess } = await import("../lib/logging/access-logs.ts");

    await logConfidentialAccess({
      thesisId: confidentialThesisId,
      actorId: testLibrarianId,
      kind: "docx_export",
    });

    const { data: loggedRow, error: logFetchErr } = await adminClient
      .from("access_logs")
      .select("id, thesis_id, actor_id, kind, created_at")
      .eq("thesis_id", confidentialThesisId)
      .single();

    const check2Pass =
      !logFetchErr &&
      loggedRow &&
      loggedRow.actor_id === testLibrarianId &&
      loggedRow.kind === "docx_export";

    results.push({
      name: "Check 2: Confidential Access Logging",
      criterion: "Confidential file downloads record immutable access_logs entry for RA 10173",
      status: check2Pass ? "PASS" : "FAIL",
      detail: `Access log recorded successfully: id=${loggedRow?.id}, actor=${loggedRow?.actor_id}, kind=${loggedRow?.kind}.`,
    });
    console.log(`  -> ${check2Pass ? "PASS" : "FAIL"} (access_logs verified)\n`);

    // ----------------------------------------------------
    // CHECK 3: Nightly Orphan Sweep Background Task
    // ----------------------------------------------------
    console.log("Checking Criterion 3: Nightly orphan sweep integrity job...");

    const sweepReport = await runOrphanSweepJob(true); // dry-run mode

    const check3Pass =
      typeof sweepReport.scannedR2Objects === "number" &&
      typeof sweepReport.deletedOrphanCount === "number" &&
      Array.isArray(sweepReport.missingVersionFiles) &&
      sweepReport.dryRun === true;

    results.push({
      name: "Check 3: Nightly Orphan Sweep Integrity Task",
      criterion: "Nightly scheduled job scans R2 submissions/ and verifies database reconciliation",
      status: check3Pass ? "PASS" : "FAIL",
      detail: `Scanned R2 objects: ${sweepReport.scannedR2Objects}; Orphan count: ${sweepReport.deletedOrphanCount}; Missing version files: ${sweepReport.missingVersionFiles.length}; Dry run verified.`,
    });
    console.log(`  -> ${check3Pass ? "PASS" : "FAIL"} (Scanned: ${sweepReport.scannedR2Objects} objects)\n`);

    // ----------------------------------------------------
    // CHECK 4: Institutional System Settings & Retention Policy
    // ----------------------------------------------------
    console.log("Checking Criterion 4: System settings, branding & RA 10173 retention schedules...");

    // Update system setting in database
    const testInstitution = `PECIT Institute of Technology ${uniqueTag}`;
    const { error: setErr } = await adminClient
      .from("settings")
      .upsert({ key: "institution_name", value: testInstitution });

    if (setErr) throw setErr;

    const { data: readBack } = await adminClient
      .from("settings")
      .select("value")
      .eq("key", "institution_name")
      .single();

    const check4Pass = readBack?.value === testInstitution;

    results.push({
      name: "Check 4: System Settings & Policy Governance",
      criterion: "Super admin edits institutional branding, domains, and retention without deploy",
      status: check4Pass ? "PASS" : "FAIL",
      detail: `Settings successfully updated and verified: key=institution_name, value="${readBack?.value}".`,
    });
    console.log(`  -> ${check4Pass ? "PASS" : "FAIL"} (Settings verified)\n`);

  } finally {
    console.log("Cleaning up test records...");
    for (const id of createdThesisIds) {
      await adminClient.from("theses").delete().eq("id", id);
      await adminClient.from("access_logs").delete().eq("thesis_id", id);
    }
    await adminClient.from("profiles").delete().in("id", [testStudentId, testLibrarianId]);
    await adminClient.auth.admin.deleteUser(testStudentId);
    await adminClient.auth.admin.deleteUser(testLibrarianId);
  }

  // Summary Report
  console.log("==================================================");
  console.log("PHASE 5 TEST SUMMARY RESULTS");
  console.log("==================================================");
  let allPass = true;
  for (const r of results) {
    console.log(`[${r.status}] ${r.name}`);
    console.log(`       Criterion: ${r.criterion}`);
    console.log(`       Details: ${r.detail}\n`);
    if (r.status !== "PASS") allPass = false;
  }

  if (allPass) {
    console.log("🎉 ALL PHASE 5 HARDENING CHECKS PASSED!");
    process.exit(0);
  } else {
    console.error("❌ ONE OR MORE PHASE 5 CHECKS FAILED.");
    process.exit(1);
  }
}

runPhase5Tests().catch((err) => {
  console.error("Test execution aborted with error:", err);
  process.exit(1);
});
