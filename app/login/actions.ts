"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  getUserLandingRoute,
  type UserRole,
  invalidateUserProfileCache,
} from "@/lib/auth/roles";
import {
  getSessionPreferenceCookieOptions,
  SESSION_PERSISTENCE_COOKIE,
  type SessionPersistence,
} from "@/lib/auth/session-cookie-policy";
import { checkAuthRateLimit } from "@/lib/ratelimit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { verifyTurnstile } from "@/lib/turnstile";

const loginSchema = z.object({
  email: z.string().trim().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
  turnstileToken: z.string().optional(),
  rememberMe: z.boolean(),
});

export type ActionState = {
  error?: string;
  success?: boolean;
};

async function setSessionPersistencePreference(
  persistence: SessionPersistence,
) {
  const cookieStore = await cookies();

  cookieStore.set(
    SESSION_PERSISTENCE_COOKIE,
    persistence,
    getSessionPreferenceCookieOptions(persistence),
  );
}

async function clearSessionPersistencePreference() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_PERSISTENCE_COOKIE);
}

export async function loginAction(
  _prevState: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const currentSessionClient = await createClient();
  const { data: currentAuth } = await currentSessionClient.auth.getUser();

  if (currentAuth.user) {
    const { data: currentProfile, error: currentProfileError } =
      await currentSessionClient
        .from("profiles")
        .select("role, status, must_change_password")
        .eq("id", currentAuth.user.id)
        .single();

    if (currentProfileError && currentProfileError.code !== "PGRST116") {
      return {
        error:
          "Your current session could not be verified. Sign out before trying another account.",
      };
    }

    if (currentProfile && currentProfile.status !== "disabled") {
      redirect(
        currentProfile.must_change_password && currentProfile.role !== "student"
          ? "/users/change-password"
          : getUserLandingRoute(currentProfile.role as UserRole),
      );
    }

    // A missing or disabled profile is not a valid application session.
    await currentSessionClient.auth.signOut({ scope: "local" });
    await clearSessionPersistencePreference();
  }

  const parseResult = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    turnstileToken: formData.get("turnstile_token") || undefined,
    rememberMe: formData.get("remember_me") === "on",
  });

  if (!parseResult.success) {
    return { error: "Invalid email or password." };
  }

  const { email, password, turnstileToken, rememberMe } = parseResult.data;
  const sessionPersistence: SessionPersistence = rememberMe
    ? "persistent"
    : "session";

  // Rate Limiting per IP and per Email
  const headersList = await headers();
  const clientIp =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";

  const [ipAllowed, emailAllowed] = await Promise.all([
    checkAuthRateLimit(`ip:${clientIp}`),
    checkAuthRateLimit(`email:${email.toLowerCase()}`),
  ]);

  if (!ipAllowed || !emailAllowed) {
    return {
      error:
        "Too many sign-in attempts. Please wait a few minutes before trying again.",
    };
  }

  // Turnstile verification
  const turnstileCheck = await verifyTurnstile(turnstileToken, clientIp);
  if (!turnstileCheck.success) {
    return { error: turnstileCheck.error || "Security verification failed." };
  }

  // Authenticate with Supabase Auth
  const supabase = await createClient({ sessionPersistence });
  const { data: authData, error: authError } =
    await supabase.auth.signInWithPassword({
      email,
      password,
    });

  if (authError || !authData.user) {
    // Master prompt Rule 5: Sign-in failures show one generic message
    return { error: "Invalid email or password." };
  }

  // Re-verify profile on server
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, status, must_change_password")
    .eq("id", authData.user.id)
    .single();

  if (!profile) {
    await supabase.auth.signOut({ scope: "local" });
    await clearSessionPersistencePreference();
    return { error: "Invalid email or password." };
  }

  // Deactivated users cannot sign in
  if (profile.status === "disabled") {
    await supabase.auth.signOut({ scope: "local" });
    await clearSessionPersistencePreference();
    return {
      error:
        "This account is disabled. Please contact the administrator.",
    };
  }

  let destination = getUserLandingRoute(profile.role as UserRole);

  if (profile.must_change_password && profile.role !== "student") {
    destination = "/users/change-password";
  }

  await setSessionPersistencePreference(sessionPersistence);
  redirect(destination);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub && typeof data.claims.sub === "string") {
    invalidateUserProfileCache(data.claims.sub);
  }
  await supabase.auth.signOut({ scope: "local" });
  await clearSessionPersistencePreference();
  redirect("/login");
}
