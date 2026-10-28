import nextEnvironment from "@next/env";
import {
  createServerClient,
  serializeCookieHeader,
  type CookieOptions,
} from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import {
  applySessionPersistenceToCookieOptions,
  AUTH_COOKIE_MAX_AGE_SECONDS,
  getAuthCookieOptions,
} from "../lib/auth/session-cookie-policy.ts";
import { getServerEnv } from "../lib/env.ts";

const { loadEnvConfig } = nextEnvironment;
loadEnvConfig(process.cwd());

interface StoredCookie {
  name: string;
  value: string;
  options: CookieOptions;
}

function decodeHtmlAttribute(value: string) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function readServerActionFields(html: string) {
  const fields = new Map<string, string>();
  const inputPattern = /<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\/>/g;

  for (const match of html.matchAll(inputPattern)) {
    if (match[1]?.startsWith("$ACTION")) {
      fields.set(match[1], decodeHtmlAttribute(match[2] ?? ""));
    }
  }

  if (fields.size === 0) {
    throw new Error("Could not find the login Server Action fields.");
  }

  return fields;
}

async function redirectsTo(response: Response, pathname: string) {
  const location = response.headers.get("location");
  if (
    location &&
    new URL(location, "http://localhost").pathname === pathname
  ) {
    return true;
  }

  const body = await response.text();
  return (
    body.includes(`NEXT_REDIRECT;replace;${pathname};`) ||
    body.includes(`NEXT_REDIRECT;push;${pathname};`) ||
    body.includes(`url=${pathname}`)
  );
}

async function main() {
  const env = getServerEnv();
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
  );
  const suffix = randomUUID().slice(0, 8);
  const password = "SessionPolicyTest2026!#";
  const existingEmail = `test_session_admin_${suffix}@pecit.edu.ph`;
  const otherEmail = `test_session_student_${suffix}@pecit.edu.ph`;
  const createdUserIds: string[] = [];

  try {
    for (const [email, role] of [
      [existingEmail, "admin"],
      [otherEmail, "student"],
    ] as const) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (error || !data.user) {
        throw new Error(`Could not create a temporary ${role} account.`);
      }

      createdUserIds.push(data.user.id);

      const { error: profileError } = await admin.from("profiles").upsert({
        id: data.user.id,
        email,
        full_name: `[TEST] Session ${role}`,
        role,
        status: "active",
        must_change_password: false,
      });

      if (profileError) {
        throw new Error(`Could not create a temporary ${role} profile.`);
      }
    }

    const cookieJar = new Map<string, StoredCookie>();
    const signedInClient = createServerClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      {
        cookieOptions: getAuthCookieOptions("persistent"),
        cookies: {
          getAll() {
            return [...cookieJar.values()].map(({ name, value }) => ({
              name,
              value,
            }));
          },
          setAll(cookiesToSet) {
            for (const cookie of cookiesToSet) {
              cookieJar.set(cookie.name, {
                ...cookie,
                options: applySessionPersistenceToCookieOptions(
                  cookie.options,
                  "persistent",
                ),
              });
            }
          },
        },
      },
    );

    const { error: signInError } = await signedInClient.auth.signInWithPassword({
      email: existingEmail,
      password,
    });

    if (signInError) {
      throw new Error("Could not establish the temporary authenticated session.");
    }

    const { data: signedInAuth, error: signedInAuthError } =
      await signedInClient.auth.getUser();
    if (signedInAuthError || !signedInAuth.user) {
      throw new Error("The temporary session could not be revalidated.");
    }

    const { data: signedInProfile, error: signedInProfileError } =
      await signedInClient
        .from("profiles")
        .select("role, status")
        .eq("id", signedInAuth.user.id)
        .single();
    if (
      signedInProfileError ||
      signedInProfile?.role !== "admin" ||
      signedInProfile.status !== "active"
    ) {
      throw new Error("The temporary session could not read its own profile.");
    }

    const authCookies = [...cookieJar.values()].filter((cookie) =>
      cookie.name.includes("auth-token"),
    );
    if (
      authCookies.length === 0 ||
      authCookies.some(
        (cookie) => cookie.options.maxAge !== AUTH_COOKIE_MAX_AGE_SECONDS,
      )
    ) {
      throw new Error("Remember me did not create persistent auth cookies.");
    }

    const sessionOnlyCookieJar = new Map<string, StoredCookie>();
    const sessionOnlyClient = createServerClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      {
        cookieOptions: getAuthCookieOptions("session"),
        cookies: {
          getAll() {
            return [...sessionOnlyCookieJar.values()].map(({ name, value }) => ({
              name,
              value,
            }));
          },
          setAll(cookiesToSet) {
            for (const cookie of cookiesToSet) {
              sessionOnlyCookieJar.set(cookie.name, {
                ...cookie,
                options: applySessionPersistenceToCookieOptions(
                  cookie.options,
                  "session",
                ),
              });
            }
          },
        },
      },
    );
    const { error: sessionOnlySignInError } =
      await sessionOnlyClient.auth.signInWithPassword({
        email: otherEmail,
        password,
      });
    const sessionOnlyAuthCookies = [...sessionOnlyCookieJar.values()].filter(
      (cookie) => cookie.name.includes("auth-token"),
    );

    if (
      sessionOnlySignInError ||
      sessionOnlyAuthCookies.length === 0 ||
      sessionOnlyAuthCookies.some(
        (cookie) =>
          cookie.options.maxAge !== undefined ||
          cookie.options.expires !== undefined,
      )
    ) {
      throw new Error("Session-only login created persistent auth cookies.");
    }

    const cookieHeader = [...cookieJar.values()]
      .map(({ name, value, options }) =>
        serializeCookieHeader(name, value, options).split(";", 1)[0],
      )
      .join("; ");

    const loginPageResponse = await fetch(`${env.APP_URL}/login`, {
      headers: { cookie: cookieHeader },
      redirect: "manual",
    });

    if (!(await redirectsTo(loginPageResponse, "/dashboard"))) {
      const protectedResponse = await fetch(`${env.APP_URL}/dashboard`, {
        headers: { cookie: cookieHeader },
        redirect: "manual",
      });
      throw new Error(
        `Authenticated /login returned ${loginPageResponse.status} to ${loginPageResponse.headers.get("location") ?? "no location"}; /dashboard returned ${protectedResponse.status} to ${protectedResponse.headers.get("location") ?? "no location"}; cookies: ${[...cookieJar.keys()].join(", ")}.`,
      );
    }

    const anonymousLoginResponse = await fetch(`${env.APP_URL}/login`);
    const actionFields = readServerActionFields(
      await anonymousLoginResponse.text(),
    );
    const formData = new FormData();

    for (const [name, value] of actionFields) {
      formData.set(name, value);
    }
    formData.set("email", otherEmail);
    formData.set("password", password);
    formData.set("remember_me", "on");
    formData.set("turnstile_token", "test-pass-token");

    const accountSwitchResponse = await fetch(`${env.APP_URL}/login`, {
      method: "POST",
      headers: { cookie: cookieHeader },
      body: formData,
      redirect: "manual",
    });

    if (!(await redirectsTo(accountSwitchResponse, "/dashboard"))) {
      throw new Error(
        `Authenticated login submission returned ${accountSwitchResponse.status} without redirecting to the existing account.`,
      );
    }

    console.log("PASS: Remember me produced persistent auth cookies.");
    console.log("PASS: Clearing Remember me produced browser-session cookies.");
    console.log("PASS: Authenticated users are redirected away from /login.");
    console.log("PASS: Login submission cannot replace an active account.");
  } finally {
    for (const userId of createdUserIds) {
      await admin.from("profiles").delete().eq("id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
});
