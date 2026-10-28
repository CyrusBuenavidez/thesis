import type { CookieOptions } from "@supabase/ssr";

export const SESSION_PERSISTENCE_COOKIE = "pecit-session-persistence";

export const AUTH_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

export type SessionPersistence = "persistent" | "session";

export function parseSessionPersistence(
  value: string | undefined,
): SessionPersistence {
  return value === "session" ? "session" : "persistent";
}

export function getAuthCookieOptions(
  persistence: SessionPersistence,
): CookieOptions {
  return {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    // Override @supabase/ssr's persistent default with a browser-session
    // cookie when the user clears Remember me.
    maxAge:
      persistence === "persistent"
        ? AUTH_COOKIE_MAX_AGE_SECONDS
        : undefined,
  };
}

export function getSessionPreferenceCookieOptions(
  persistence: SessionPersistence,
): CookieOptions {
  return {
    ...getAuthCookieOptions(persistence),
    httpOnly: true,
  };
}

export function applySessionPersistenceToCookieOptions(
  options: CookieOptions,
  persistence: SessionPersistence,
): CookieOptions {
  if (persistence === "persistent" || options.maxAge === 0) {
    return options;
  }

  return {
    ...options,
    expires: undefined,
    maxAge: undefined,
  };
}
