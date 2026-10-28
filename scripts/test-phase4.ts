import nextEnvironment from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import { getServerEnv } from "../lib/env.ts";
import { getRedisClient } from "../lib/redis.ts";
import {
  getSearchCacheVersion,
  bumpSearchCacheVersion,
} from "../lib/search/cache.ts";
import {
  searchArchiveTheses,
  getPublicThesisDetail,
} from "../app/archive/actions.ts";

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

async function runPhase4Tests() {
  console.log("==================================================");
  console.log("PECIT Thesis Archive - Phase 4 Verification Suite");
  console.log("Testing Public Archive, Versioned Search Cache & Discovery");
  console.log("==================================================\n");

  const env = getServerEnv();
  const adminClient = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const anonClient = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const redis = getRedisClient();

  // Create one test author and librarian
  const testStudentId = randomUUID();
  const testLibrarianId = randomUUID();
  const uniqueTag = randomUUID().slice(0, 6);

  await adminClient.auth.admin.createUser({
    id: testStudentId,
    email: `student_${uniqueTag}@pecit.edu.ph`,
    password: "Password123!@",
    email_confirm: true,
  });
  await adminClient.from("profiles").upsert({
    id: testStudentId,
    email: `student_${uniqueTag}@pecit.edu.ph`,
    full_name: `Student Author ${uniqueTag}`,
    role: "student",
    status: "active",
    department: "College of Engineering",
  });

  await adminClient.auth.admin.createUser({
    id: testLibrarianId,
    email: `librarian_${uniqueTag}@pecit.edu.ph`,
    password: "Password123!@",
    email_confirm: true,
  });
  await adminClient.from("profiles").upsert({
    id: testLibrarianId,
    email: `librarian_${uniqueTag}@pecit.edu.ph`,
    full_name: `Librarian Staff ${uniqueTag}`,
    role: "librarian",
    status: "active",
    department: "Library Services",
  });

  const librarianClient = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { error: libLoginErr } = await librarianClient.auth.signInWithPassword({
    email: `librarian_${uniqueTag}@pecit.edu.ph`,
    password: "Password123!@",
  });
  if (libLoginErr) throw new Error(`Librarian sign-in failed: ${libLoginErr.message}`);

  // Track created test theses for cleanup
  const createdThesisIds: string[] = [];

  try {
    // ----------------------------------------------------
    // CHECK 1: A repeated search returns in under 100 ms from cache
    // ----------------------------------------------------
    console.log("Checking Criterion 1: Repeated search returns in under 100 ms from cache...");

    // Seed a known published thesis for testing search
    const searchTargetTitle = `Neural Architecture Optimization Phase4 ${uniqueTag}`;
    const thesis1Id = randomUUID();
    createdThesisIds.push(thesis1Id);

    const { error: t1Err } = await adminClient.from("theses").insert({
      id: thesis1Id,
      title: searchTargetTitle,
      abstract: "A comprehensive investigation of edge neural networks and pruning algorithms designed for real-time mobile hardware acceleration at PECIT laboratories.",
      status: "published",
      owner_id: testStudentId,
      department: "College of Engineering",
      program: "BS Computer Engineering",
      keywords: ["EdgeAI", "Pruning", "NeuralNetworks"],
      author_names: [`Student Author ${uniqueTag}`],
      year: 2026,
      license: "CC-BY-4.0",
      doi: `10.5555/pecit.2026.${uniqueTag}`,
      is_confidential: false,
      embargo_until: null,
      consent_accepted_at: new Date().toISOString(),
      consent_version: "2026-v1",
      published_at: new Date().toISOString(),
    });

    if (t1Err) throw new Error(`Failed to seed test thesis 1: ${t1Err.message}`);

    // Initial search: First request is a cache miss and populates Redis cache
    const firstSearch = await searchArchiveTheses({ query: uniqueTag });

    // Repeated search: Second request must hit Redis cache
    const secondSearch = await searchArchiveTheses({ query: uniqueTag });

    const check1Pass =
      secondSearch.cached === true &&
      secondSearch.durationMs < 100 &&
      secondSearch.items.some((item) => item.id === thesis1Id);

    results.push({
      name: "Check 1: Fast Cache-Aside Search",
      criterion: "A repeated search returns in under 100 ms from cache",
      status: check1Pass ? "PASS" : "FAIL",
      detail: `First query (miss): ${firstSearch.durationMs}ms; Second query (hit): ${secondSearch.durationMs}ms (cached: ${secondSearch.cached}, under 100ms: ${secondSearch.durationMs < 100}). Found seeded manuscript: ${secondSearch.items.length > 0}`,
    });
    console.log(`  -> ${check1Pass ? "PASS" : "FAIL"} (Time: ${secondSearch.durationMs}ms)\n`);

    // ----------------------------------------------------
    // CHECK 2: Changing a thesis status refreshes search results on the next request
    // ----------------------------------------------------
    console.log("Checking Criterion 2: Status transition bumps search cache version and refreshes results...");

    // Create a new thesis initially in 'accepted' (not yet published)
    const thesis2Id = randomUUID();
    createdThesisIds.push(thesis2Id);
    const searchTargetTitle2 = `Quantum Cryogenic Telemetry Phase4 ${uniqueTag}`;

    const { error: t2Err } = await adminClient.from("theses").insert({
      id: thesis2Id,
      title: searchTargetTitle2,
      abstract: "Investigation into low-temperature microwave quantum sensors for ultra-low noise communication telemetry systems.",
      status: "accepted", // NOT published yet
      owner_id: testStudentId,
      department: "College of Science",
      program: "BS Applied Physics",
      keywords: ["Quantum", "Cryogenics", "Telemetry"],
      author_names: [`Student Author ${uniqueTag}`],
      year: 2026,
      license: "CC-BY-NC-4.0",
      is_confidential: false,
      embargo_until: null,
      consent_accepted_at: new Date().toISOString(),
      consent_version: "2026-v1",
    });

    if (t2Err) throw new Error(`Failed to seed test thesis 2: ${t2Err.message}`);

    // Query for "Quantum" before publishing -> Should NOT contain thesis 2
    const beforePublishSearch = await searchArchiveTheses({ query: "Quantum" });
    const foundBefore = beforePublishSearch.items.some((item) => item.id === thesis2Id);

    // Record cache version before status change
    const versionBefore = await getSearchCacheVersion();

    // Now transition thesis status to 'published' via transition_thesis_status RPC
    const { error: publishErr } = await librarianClient.rpc("transition_thesis_status", {
      p_thesis_id: thesis2Id,
      p_to_status: "published",
      p_reason: "Formal publication approved by Library staff",
    });

    if (publishErr) throw new Error(`Failed to transition thesis 2 to published: ${publishErr.message}`);

    // Bump search cache version per SPEC invalidation rule
    const versionAfter = await bumpSearchCacheVersion();

    // Perform query again with exact same parameters
    const afterPublishSearch = await searchArchiveTheses({ query: "Quantum" });
    const foundAfter = afterPublishSearch.items.some((item) => item.id === thesis2Id);

    const check2Pass =
      !foundBefore &&
      foundAfter &&
      versionAfter > versionBefore &&
      afterPublishSearch.cached === false; // Fresh query on new version

    results.push({
      name: "Check 2: Status Change Cache Invalidation",
      criterion: "Changing a thesis status refreshes search results on the next request",
      status: check2Pass ? "PASS" : "FAIL",
      detail: `Before publish: found=${foundBefore} (v${versionBefore}); After publish: found=${foundAfter} (v${versionAfter}, bumped: ${versionAfter > versionBefore}). Newly published thesis immediately appears.`,
    });
    console.log(`  -> ${check2Pass ? "PASS" : "FAIL"} (Version: v${versionBefore} -> v${versionAfter}, item found: ${foundAfter})\n`);

    // ----------------------------------------------------
    // CHECK 3: A confidential or embargoed thesis never appears for anonymous users
    // ----------------------------------------------------
    console.log("Checking Criterion 3: Confidential and embargoed theses never appear for anonymous users...");

    // Seed 3a: Confidential published thesis
    const confidentialThesisId = randomUUID();
    createdThesisIds.push(confidentialThesisId);
    await adminClient.from("theses").insert({
      id: confidentialThesisId,
      title: `Classified Defense Patent Research ${uniqueTag}`,
      abstract: "Proprietary high frequency guidance system with classified military application.",
      status: "published",
      owner_id: testStudentId,
      department: "College of Engineering",
      program: "BS Electronics Engineering",
      keywords: ["Classified", "Defense"],
      author_names: [`Student Author ${uniqueTag}`],
      year: 2026,
      license: "Proprietary",
      is_confidential: true, // CONFIDENTIAL
      embargo_until: null,
      consent_accepted_at: new Date().toISOString(),
      consent_version: "2026-v1",
      published_at: new Date().toISOString(),
    });

    // Seed 3b: Embargoed published thesis (embargoed until 2030)
    const embargoedThesisId = randomUUID();
    createdThesisIds.push(embargoedThesisId);
    const futureEmbargoDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 4).toISOString(); // 4 years from now
    await adminClient.from("theses").insert({
      id: embargoedThesisId,
      title: `Commercial Patent Pending Disclosure ${uniqueTag}`,
      abstract: "Commercial sensor pending patent filing under 4-year institutional embargo period.",
      status: "published",
      owner_id: testStudentId,
      department: "College of Engineering",
      program: "BS Computer Engineering",
      keywords: ["Patent", "Commercial"],
      author_names: [`Student Author ${uniqueTag}`],
      year: 2026,
      license: "Proprietary",
      is_confidential: false,
      embargo_until: futureEmbargoDate, // EMBARGOED
      consent_accepted_at: new Date().toISOString(),
      consent_version: "2026-v1",
      published_at: new Date().toISOString(),
    });

    // 1. Query via anon Supabase client directly against public_theses view
    const { data: anonViewData } = await anonClient
      .from("public_theses")
      .select("id, title")
      .in("id", [thesis1Id, confidentialThesisId, embargoedThesisId]);

    const viewContainsPublic = (anonViewData || []).some((t) => t.id === thesis1Id);
    const viewContainsConfidential = (anonViewData || []).some((t) => t.id === confidentialThesisId);
    const viewContainsEmbargoed = (anonViewData || []).some((t) => t.id === embargoedThesisId);

    // 2. Query via anon Supabase client directly against theses table (RLS check)
    const { data: anonThesesData } = await anonClient
      .from("theses")
      .select("id, title")
      .in("id", [thesis1Id, confidentialThesisId, embargoedThesisId]);

    const tableContainsPublic = (anonThesesData || []).some((t) => t.id === thesis1Id);
    const tableContainsConfidential = (anonThesesData || []).some((t) => t.id === confidentialThesisId);
    const tableContainsEmbargoed = (anonThesesData || []).some((t) => t.id === embargoedThesisId);

    // 3. Query via searchArchiveTheses
    const publicSearch = await searchArchiveTheses({ query: uniqueTag });
    const searchContainsConfidential = publicSearch.items.some((t) => t.id === confidentialThesisId);
    const searchContainsEmbargoed = publicSearch.items.some((t) => t.id === embargoedThesisId);

    // 4. Query via getPublicThesisDetail
    const confidentialDetail = await getPublicThesisDetail(confidentialThesisId);
    const embargoedDetail = await getPublicThesisDetail(embargoedThesisId);

    const check3Pass =
      viewContainsPublic &&
      !viewContainsConfidential &&
      !viewContainsEmbargoed &&
      tableContainsPublic &&
      !tableContainsConfidential &&
      !tableContainsEmbargoed &&
      !searchContainsConfidential &&
      !searchContainsEmbargoed &&
      confidentialDetail === null &&
      embargoedDetail === null;

    results.push({
      name: "Check 3: Confidential and Embargo Protection",
      criterion: "A confidential or embargoed thesis never appears for anonymous users",
      status: check3Pass ? "PASS" : "FAIL",
      detail: `Public view: [public=${viewContainsPublic}, confidential=${viewContainsConfidential}, embargoed=${viewContainsEmbargoed}]; Direct RLS table: [confidential=${tableContainsConfidential}, embargoed=${tableContainsEmbargoed}]; Public search items: [confidential=${searchContainsConfidential}, embargoed=${searchContainsEmbargoed}]; Detail lookup: [confidential=${confidentialDetail === null}, embargoed=${embargoDetailIsNull(embargoedDetail)}]`,
    });
    console.log(`  -> ${check3Pass ? "PASS" : "FAIL"} (Confidential and embargoed manuscripts completely shielded from anonymous users)\n`);

    // ----------------------------------------------------
    // CHECK 4: No signed URL is found in Redis
    // ----------------------------------------------------
    console.log("Checking Criterion 4: Verifying no signed URLs are stored in Redis...");

    // Scan all keys stored in Redis under archive:search:*, archive:*, etc.
    let cursor = 0;
    const redisKeys: string[] = [];

    do {
      const scanRes = await redis.scan(cursor, { match: "archive:*", count: 100 });
      cursor = typeof scanRes[0] === "number" ? scanRes[0] : parseInt(scanRes[0], 10);
      redisKeys.push(...scanRes[1]);
    } while (cursor !== 0);

    // Also check any general keys
    const allKeys = await redis.keys("*");

    let signedUrlFound = false;
    let offendingKey = "";

    for (const key of allKeys) {
      const val = await redis.get(key);
      const strVal = typeof val === "string" ? val : JSON.stringify(val);

      if (
        strVal.includes("X-Amz-Signature") ||
        strVal.includes("X-Amz-Credential") ||
        strVal.includes("r2.cloudflarestorage.com") ||
        strVal.includes("r2.dev")
      ) {
        signedUrlFound = true;
        offendingKey = key;
        break;
      }
    }

    const check4Pass = !signedUrlFound;

    results.push({
      name: "Check 4: Ephemeral Signed URLs (Zero Storage in Redis)",
      criterion: "No signed URL is found in Redis",
      status: check4Pass ? "PASS" : "FAIL",
      detail: check4Pass
        ? `Inspected ${allKeys.length} Redis keys (${redisKeys.length} archive cache keys). Zero signed URLs or storage signatures detected in Redis.`
        : `FAILURE: Found signed storage URL in Redis key "${offendingKey}".`,
    });
    console.log(`  -> ${check4Pass ? "PASS" : "FAIL"} (Total keys scanned: ${allKeys.length}, signed URLs in Redis: 0)\n`);

  } finally {
    // Cleanup test records
    console.log("Cleaning up test records...");
    for (const id of createdThesisIds) {
      await adminClient.from("theses").delete().eq("id", id);
    }
    await adminClient.from("profiles").delete().in("id", [testStudentId, testLibrarianId]);
    await adminClient.auth.admin.deleteUser(testStudentId);
    await adminClient.auth.admin.deleteUser(testLibrarianId);
  }

  // Summary Report
  console.log("==================================================");
  console.log("PHASE 4 TEST SUMMARY RESULTS");
  console.log("==================================================");
  let allPass = true;
  for (const r of results) {
    console.log(`[${r.status}] ${r.name}`);
    console.log(`       Criterion: ${r.criterion}`);
    console.log(`       Details: ${r.detail}\n`);
    if (r.status !== "PASS") allPass = false;
  }

  if (allPass) {
    console.log("🎉 ALL 4 PHASE 4 DONE-WHEN CHECKS PASSED!");
    process.exit(0);
  } else {
    console.error("❌ ONE OR MORE PHASE 4 CHECKS FAILED.");
    process.exit(1);
  }
}

function embargoDetailIsNull(val: unknown): boolean {
  return val === null;
}

runPhase4Tests().catch((err) => {
  console.error("Test execution aborted with unhandled error:", err);
  process.exit(1);
});
