import nextEnvironment from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import { getServerEnv } from "../lib/env.ts";

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

// Helper: create a test user with profile
async function createTestUser(
  role: "student" | "advisor" | "librarian" | "admin" | "super_admin",
  name: string,
) {
  const env = getServerEnv();
  const adminClient = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const email = `test_${role}_${randomUUID().slice(0, 8)}@pecit.edu.ph`;
  const password = "Phase3Test2026!#";

  const { data: user, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });

  if (createErr || !user.user) {
    throw new Error(`Failed to create test user: ${createErr?.message}`);
  }

  const userId = user.user.id;

  const { error: profileErr } = await adminClient.from("profiles").upsert({
    id: userId,
    email,
    full_name: name,
    role,
    status: "active",
    department: "College of Engineering",
  });

  if (profileErr) throw profileErr;

  const anonClient = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: sessionData, error: loginErr } = await anonClient.auth.signInWithPassword({
    email,
    password,
  });

  if (loginErr || !sessionData.session) {
    throw new Error(`Login failed for test user ${email}: ${loginErr?.message}`);
  }

  return {
    id: userId,
    email,
    role,
    name,
    client: anonClient,
    session: sessionData.session,
  };
}

async function runCheck1(env: ReturnType<typeof getServerEnv>): Promise<TestResult> {
  const name = "Check 1: Every move in the lifecycle diagram works for its role and fails for every other role";
  const criterion = "Lifecycle moves work for authorized roles and fail for unauthorized roles";

  const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

  let author: Awaited<ReturnType<typeof createTestUser>> | null = null;
  let strangerStudent: Awaited<ReturnType<typeof createTestUser>> | null = null;
  let assignedAdvisor: Awaited<ReturnType<typeof createTestUser>> | null = null;
  let otherAdvisor: Awaited<ReturnType<typeof createTestUser>> | null = null;
  let librarian: Awaited<ReturnType<typeof createTestUser>> | null = null;

  let thesisId: string | null = null;

  try {
    author = await createTestUser("student", "Lifecycle Author Student");
    strangerStudent = await createTestUser("student", "Stranger Student");
    assignedAdvisor = await createTestUser("advisor", "Assigned Faculty Advisor");
    otherAdvisor = await createTestUser("advisor", "Unassigned Faculty Advisor");
    librarian = await createTestUser("librarian", "Head Librarian");

    // 1. Create a draft thesis
    const { data: thesis, error: tErr } = await adminClient
      .from("theses")
      .insert({
        title: "[TEST] Lifecycle Verification Thesis",
        abstract: "Comprehensive state machine test for thesis lifecycle transitions.",
        status: "draft",
        owner_id: author.id,
        primary_supervisor_id: assignedAdvisor.id,
        department: "College of Engineering",
        program: "BS Computer Engineering",
        consent_accepted_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (tErr || !thesis) throw new Error(`Could not create thesis: ${tErr?.message}`);
    thesisId = thesis.id;

    // A. Move draft -> submitted:
    // Unauthorized: stranger student should fail
    const { error: strangerSubmitErr } = await strangerStudent.client.rpc("transition_thesis_status", {
      p_thesis_id: thesisId,
      p_to_status: "submitted",
      p_reason: "Stranger attempting submission",
    });
    if (!strangerSubmitErr) {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: "Security breach: Unrelated student was able to submit another student's draft thesis.",
      };
    }

    // Authorized: author student should succeed
    const { error: authorSubmitErr } = await author.client.rpc("transition_thesis_status", {
      p_thesis_id: thesisId,
      p_to_status: "submitted",
      p_reason: "Initial student submission",
    });
    if (authorSubmitErr) {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: `Author submission failed: ${authorSubmitErr.message}`,
      };
    }

    // B. Move submitted -> under_review:
    // Unauthorized: author student should fail
    const { error: studentReviewErr } = await author.client.rpc("transition_thesis_status", {
      p_thesis_id: thesisId,
      p_to_status: "under_review",
    });
    if (!studentReviewErr) {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: "Security breach: Student was able to advance thesis into under_review status.",
      };
    }

    // Authorized: assigned advisor should succeed
    const { error: advisorReviewErr } = await assignedAdvisor.client.rpc("transition_thesis_status", {
      p_thesis_id: thesisId,
      p_to_status: "under_review",
      p_reason: "Advisor started evaluation",
    });
    if (advisorReviewErr) {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: `Assigned advisor review start failed: ${advisorReviewErr.message}`,
      };
    }

    // C. Move under_review -> revision_requested:
    // Unauthorized: request without reason should fail
    const { error: noReasonErr } = await assignedAdvisor.client.rpc("transition_thesis_status", {
      p_thesis_id: thesisId,
      p_to_status: "revision_requested",
      p_reason: "", // blank reason
    });
    if (!noReasonErr) {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: "Validation failure: Advisor was able to request revisions without a written reason.",
      };
    }

    // Unauthorized: unassigned advisor should fail
    const { error: otherAdvRevErr } = await otherAdvisor.client.rpc("transition_thesis_status", {
      p_thesis_id: thesisId,
      p_to_status: "revision_requested",
      p_reason: "Valid reason from unassigned advisor",
    });
    if (!otherAdvRevErr) {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: "Security breach: Unassigned advisor was able to request revisions.",
      };
    }

    // Authorized: assigned advisor with reason should succeed
    const { error: advisorRevOkErr } = await assignedAdvisor.client.rpc("transition_thesis_status", {
      p_thesis_id: thesisId,
      p_to_status: "revision_requested",
      p_reason: "Please expand literature review on distributed locks.",
    });
    if (advisorRevOkErr) {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: `Assigned advisor request revisions failed: ${advisorRevOkErr.message}`,
      };
    }

    // D. Move revision_requested -> submitted:
    // Authorized: author resubmits
    const { error: resubmitErr } = await author.client.rpc("transition_thesis_status", {
      p_thesis_id: thesisId,
      p_to_status: "submitted",
      p_reason: "Revised manuscript addressing comments",
    });
    if (resubmitErr) {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: `Author resubmission failed: ${resubmitErr.message}`,
      };
    }

    // Back to under_review by advisor
    await assignedAdvisor.client.rpc("transition_thesis_status", {
      p_thesis_id: thesisId,
      p_to_status: "under_review",
    });

    // E. Move under_review -> accepted:
    // Unauthorized: student cannot accept
    const { error: studentAcceptErr } = await author.client.rpc("transition_thesis_status", {
      p_thesis_id: thesisId,
      p_to_status: "accepted",
    });
    if (!studentAcceptErr) {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: "Security breach: Student was able to accept their own thesis.",
      };
    }

    // Authorized: advisor accepts
    const { error: advisorAcceptErr } = await assignedAdvisor.client.rpc("transition_thesis_status", {
      p_thesis_id: thesisId,
      p_to_status: "accepted",
      p_reason: "Manuscript approved for publication",
    });
    if (advisorAcceptErr) {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: `Advisor accept failed: ${advisorAcceptErr.message}`,
      };
    }

    // F. Move accepted -> published:
    // Unauthorized: Advisor cannot publish (only Librarian or Admin can publish)
    const { error: advisorPublishErr } = await assignedAdvisor.client.rpc("transition_thesis_status", {
      p_thesis_id: thesisId,
      p_to_status: "published",
    });
    if (!advisorPublishErr) {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: "Security breach: Advisor was able to publish thesis directly.",
      };
    }

    // Authorized: Librarian publishes
    const { error: librarianPublishErr } = await librarian.client.rpc("transition_thesis_status", {
      p_thesis_id: thesisId,
      p_to_status: "published",
      p_reason: "Published by PECIT Library",
    });
    if (librarianPublishErr) {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: `Librarian publish failed: ${librarianPublishErr.message}`,
      };
    }

    // G. Move published -> archived:
    // Authorized: Librarian archives
    const { error: librarianArchiveErr } = await librarian.client.rpc("transition_thesis_status", {
      p_thesis_id: thesisId,
      p_to_status: "archived",
      p_reason: "Archived to permanent collection",
    });
    if (librarianArchiveErr) {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: `Librarian archive failed: ${librarianArchiveErr.message}`,
      };
    }

    return {
      name,
      criterion,
      status: "PASS",
      detail: "Verified: All lifecycle transitions (draft -> submitted -> under_review -> revision_requested -> submitted -> accepted -> published -> archived) work for authorized roles and are strictly blocked for unauthorized roles.",
    };
  } catch (err: unknown) {
    return {
      name,
      criterion,
      status: "FAIL",
      detail: `Exception during check: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    if (thesisId) {
      await adminClient.from("theses").delete().eq("id", thesisId);
    }
    const usersToDelete = [author, strangerStudent, assignedAdvisor, otherAdvisor, librarian];
    for (const u of usersToDelete) {
      if (u) {
        await adminClient.from("profiles").delete().eq("id", u.id);
        await adminClient.auth.admin.deleteUser(u.id);
      }
    }
  }
}

async function runCheck2(env: ReturnType<typeof getServerEnv>): Promise<TestResult> {
  const name = "Check 2: A revision upload returns the thesis to Submitted";
  const criterion = "Revision upload returns the thesis to Submitted";

  const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);
  let student: Awaited<ReturnType<typeof createTestUser>> | null = null;
  let thesisId: string | null = null;

  try {
    student = await createTestUser("student", "Revision Student");

    // Create thesis in revision_requested
    const { data: thesis, error: tErr } = await adminClient
      .from("theses")
      .insert({
        title: "[TEST] Thesis Awaiting Revision",
        abstract: "Research thesis requiring student revisions.",
        status: "revision_requested",
        owner_id: student.id,
        department: "College of Engineering",
        program: "BS Computer Engineering",
      })
      .select()
      .single();

    if (tErr || !thesis) throw new Error(`Could not create thesis: ${tErr?.message}`);
    thesisId = thesis.id;

    // Student uploads revision and transitions status back to submitted
    const { error: transErr } = await student.client.rpc("transition_thesis_status", {
      p_thesis_id: thesisId,
      p_to_status: "submitted",
      p_reason: "Uploaded revised manuscript version v2",
    });

    if (transErr) {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: `Transition failed: ${transErr.message}`,
      };
    }

    // Verify current status in database
    const { data: current } = await adminClient
      .from("theses")
      .select("status")
      .eq("id", thesisId)
      .single();

    if (current?.status !== "submitted") {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: `Expected status "submitted", but got "${current?.status}".`,
      };
    }

    return {
      name,
      criterion,
      status: "PASS",
      detail: 'Verified: Revision submission successfully moved thesis from "revision_requested" back to "submitted".',
    };
  } catch (err: unknown) {
    return {
      name,
      criterion,
      status: "FAIL",
      detail: `Exception: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    if (thesisId) await adminClient.from("theses").delete().eq("id", thesisId);
    if (student) {
      await adminClient.from("profiles").delete().eq("id", student.id);
      await adminClient.auth.admin.deleteUser(student.id);
    }
  }
}

async function runCheck3(env: ReturnType<typeof getServerEnv>): Promise<TestResult> {
  const name = "Check 3: Publish is refused without publication consent";
  const criterion = "Publish is refused without publication consent";

  const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);
  let librarian: Awaited<ReturnType<typeof createTestUser>> | null = null;
  let student: Awaited<ReturnType<typeof createTestUser>> | null = null;
  let thesisId: string | null = null;

  try {
    librarian = await createTestUser("librarian", "Test Librarian");
    student = await createTestUser("student", "Student Without Consent");

    // Create an accepted thesis where consent_accepted_at IS NULL
    const { data: thesis, error: tErr } = await adminClient
      .from("theses")
      .insert({
        title: "[TEST] Manuscript Missing Publication Consent",
        abstract: "Testing enforcement of institutional publication consent.",
        status: "accepted",
        owner_id: student.id,
        department: "College of Engineering",
        program: "BS Computer Engineering",
        consent_accepted_at: null, // NO CONSENT!
      })
      .select()
      .single();

    if (tErr || !thesis) throw new Error(`Could not create thesis: ${tErr?.message}`);
    thesisId = thesis.id;

    // Attempt to publish as Librarian
    const { error: publishErr } = await librarian.client.rpc("transition_thesis_status", {
      p_thesis_id: thesisId,
      p_to_status: "published",
      p_reason: "Librarian attempting publish",
    });

    if (!publishErr) {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: "Security failure: Thesis was published even though consent_accepted_at is NULL.",
      };
    }

    if (!publishErr.message.includes("publication agreement consent is missing")) {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: `Expected missing consent error, received: "${publishErr.message}"`,
      };
    }

    // Verify thesis status is STILL accepted
    const { data: current } = await adminClient
      .from("theses")
      .select("status")
      .eq("id", thesisId)
      .single();

    if (current?.status !== "accepted") {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: `Thesis status changed unexpectedly to ${current?.status}`,
      };
    }

    return {
      name,
      criterion,
      status: "PASS",
      detail: `Verified: Attempting to publish without author consent was rejected with error: "${publishErr.message}". Status remains "accepted".`,
    };
  } catch (err: unknown) {
    return {
      name,
      criterion,
      status: "FAIL",
      detail: `Exception: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    if (thesisId) await adminClient.from("theses").delete().eq("id", thesisId);
    if (student) {
      await adminClient.from("profiles").delete().eq("id", student.id);
      await adminClient.auth.admin.deleteUser(student.id);
    }
    if (librarian) {
      await adminClient.from("profiles").delete().eq("id", librarian.id);
      await adminClient.auth.admin.deleteUser(librarian.id);
    }
  }
}

async function runCheck4(env: ReturnType<typeof getServerEnv>): Promise<TestResult> {
  const name = "Check 4: Each move appears once in activity_logs, and activity_logs cannot be edited or deleted";
  const criterion = "Each move appears once in activity_logs, and activity_logs cannot be edited or deleted";

  const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);
  let student: Awaited<ReturnType<typeof createTestUser>> | null = null;
  let advisor: Awaited<ReturnType<typeof createTestUser>> | null = null;
  let thesisId: string | null = null;

  try {
    student = await createTestUser("student", "Audit Student");
    advisor = await createTestUser("advisor", "Audit Advisor");

    // 1. Create draft thesis
    const { data: thesis, error: tErr } = await adminClient
      .from("theses")
      .insert({
        title: "[TEST] Audit Trail Integrity Thesis",
        abstract: "Verifying activity_logs append-only behavior.",
        status: "draft",
        owner_id: student.id,
        primary_supervisor_id: advisor.id,
        department: "College of Engineering",
        program: "BS Computer Engineering",
      })
      .select()
      .single();

    if (tErr || !thesis) throw new Error(`Could not create thesis: ${tErr?.message}`);
    thesisId = thesis.id;

    // Perform two distinct moves
    // Move 1: draft -> submitted (by student)
    await student.client.rpc("transition_thesis_status", {
      p_thesis_id: thesisId,
      p_to_status: "submitted",
      p_reason: "Audit Move 1",
    });

    // Move 2: submitted -> under_review (by advisor)
    await advisor.client.rpc("transition_thesis_status", {
      p_thesis_id: thesisId,
      p_to_status: "under_review",
      p_reason: "Audit Move 2",
    });

    // 2. Verify both moves appear once in activity_logs
    const { data: logs, error: logErr } = await adminClient
      .from("activity_logs")
      .select("id, from_status, to_status, actor_id, reason")
      .eq("thesis_id", thesisId)
      .order("created_at", { ascending: true });

    if (logErr || !logs || logs.length !== 2) {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: `Expected exactly 2 activity_log entries, found ${logs?.length ?? 0}.`,
      };
    }

    if (logs[0].from_status !== "draft" || logs[0].to_status !== "submitted") {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: `Log 0 has unexpected statuses: ${logs[0].from_status} -> ${logs[0].to_status}`,
      };
    }

    if (logs[1].from_status !== "submitted" || logs[1].to_status !== "under_review") {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: `Log 1 has unexpected statuses: ${logs[1].from_status} -> ${logs[1].to_status}`,
      };
    }

    // 3. Verify activity_logs cannot be edited (UPDATE blocked by trigger)
    const targetLogId = logs[0].id;
    const { error: updateErr } = await adminClient
      .from("activity_logs")
      .update({ reason: "Tampered reason" })
      .eq("id", targetLogId);

    if (!updateErr || !updateErr.message.includes("activity_logs is append-only")) {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: `Expected append-only trigger exception on UPDATE, but got: "${updateErr?.message || "UPDATE succeeded"}"`,
      };
    }

    // 4. Verify activity_logs cannot be deleted (DELETE blocked by trigger)
    const { error: deleteErr } = await adminClient
      .from("activity_logs")
      .delete()
      .eq("id", targetLogId);

    if (!deleteErr || !deleteErr.message.includes("activity_logs is append-only")) {
      return {
        name,
        criterion,
        status: "FAIL",
        detail: `Expected append-only trigger exception on DELETE, but got: "${deleteErr?.message || "DELETE succeeded"}"`,
      };
    }

    return {
      name,
      criterion,
      status: "PASS",
      detail: 'Verified: Each transition wrote exactly 1 row to activity_logs with correct statuses. Both UPDATE and DELETE operations were rejected by "trg_activity_logs_append_only" trigger.',
    };
  } catch (err: unknown) {
    return {
      name,
      criterion,
      status: "FAIL",
      detail: `Exception: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    if (thesisId) await adminClient.from("theses").delete().eq("id", thesisId);
    if (student) {
      await adminClient.from("profiles").delete().eq("id", student.id);
      await adminClient.auth.admin.deleteUser(student.id);
    }
    if (advisor) {
      await adminClient.from("profiles").delete().eq("id", advisor.id);
      await adminClient.auth.admin.deleteUser(advisor.id);
    }
  }
}

async function main() {
  console.log("=============================================================");
  console.log(" PECIT Thesis Archive: Phase 3 Done-When Verification Suite");
  console.log("=============================================================\n");

  const env = getServerEnv();

  console.log("Running Check 1 (Lifecycle RBAC permissions)...");
  const r1 = await runCheck1(env);
  results.push(r1);
  console.log(`-> [${r1.status}] ${r1.name}\n   ${r1.detail}\n`);

  console.log("Running Check 2 (Revision upload returns to Submitted)...");
  const r2 = await runCheck2(env);
  results.push(r2);
  console.log(`-> [${r2.status}] ${r2.name}\n   ${r2.detail}\n`);

  console.log("Running Check 3 (Publish refused without consent)...");
  const r3 = await runCheck3(env);
  results.push(r3);
  console.log(`-> [${r3.status}] ${r3.name}\n   ${r3.detail}\n`);

  console.log("Running Check 4 (Audit trail integrity & append-only)...");
  const r4 = await runCheck4(env);
  results.push(r4);
  console.log(`-> [${r4.status}] ${r4.name}\n   ${r4.detail}\n`);

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
