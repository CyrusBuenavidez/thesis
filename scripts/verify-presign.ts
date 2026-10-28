import nextEnvironment from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { getServerEnv } from "../lib/env.ts";

const { loadEnvConfig } = nextEnvironment;
loadEnvConfig(process.cwd());

async function testPresignRoute() {
  const env = getServerEnv();
  const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

  const studentEmail = `student_presign_${randomUUID().slice(0, 8)}@pecit.edu.ph`;
  const password = "PresignPass2026!#";

  const { data: user, error: createErr } = await adminClient.auth.admin.createUser({
    email: studentEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Test Presign Student" },
  });

  if (createErr || !user.user) {
    throw new Error(`Failed to create test student: ${createErr?.message}`);
  }

  const userId = user.user.id;

  await adminClient.from("profiles").upsert({
    id: userId,
    email: studentEmail,
    full_name: "Test Presign Student",
    role: "student",
    status: "active",
  });

  // Sign in as student to get session tokens / cookies
  const anonClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const { data: sessionData, error: loginErr } = await anonClient.auth.signInWithPassword({
    email: studentEmail,
    password,
  });

  if (loginErr || !sessionData.session) {
    throw new Error(`Login failed: ${loginErr?.message}`);
  }

  const accessToken = sessionData.session.access_token;
  const refreshToken = sessionData.session.refresh_token;

  const freshThesisId = randomUUID();

  // Call the Next.js API endpoint with Supabase Auth headers / cookies
  const res = await fetch("http://localhost:3000/api/theses/presign-upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      // Also construct Supabase SSR cookies in case route parses cookies
      Cookie: `sb-${new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]}-auth-token=${encodeURIComponent(JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }))}`,
    },
    body: JSON.stringify({
      thesisId: freshThesisId,
      versionNumber: 1,
      contentType: "application/pdf",
    }),
  });

  const resText = await res.text();
  console.log("Presign response status:", res.status);
  console.log("Presign response text:", resText.slice(0, 300));
  let resJson: Record<string, unknown> = {};
  try {
    resJson = JSON.parse(resText);
  } catch {
    // not json
  }

  // Clean up
  await adminClient.from("profiles").delete().eq("id", userId);
  await adminClient.auth.admin.deleteUser(userId);

  if (res.status === 200 && resJson.url && resJson.key) {
    console.log("SUCCESS: Presign upload for new thesis (v1) succeeded!");
  } else {
    throw new Error(`Presign route failed with status ${res.status}: ${JSON.stringify(resJson)}`);
  }
}

testPresignRoute().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
