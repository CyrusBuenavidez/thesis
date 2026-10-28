import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import {
  applySessionPersistenceToCookieOptions,
  getAuthCookieOptions,
  parseSessionPersistence,
  SESSION_PERSISTENCE_COOKIE,
  type SessionPersistence,
} from "@/lib/auth/session-cookie-policy";
import { getPublicEnv } from "@/lib/env";

interface CreateClientOptions {
  sessionPersistence?: SessionPersistence;
}

export async function createClient(options: CreateClientOptions = {}) {
  const cookieStore = await cookies();
  const environment = getPublicEnv();
  const sessionPersistence =
    options.sessionPersistence ??
    parseSessionPersistence(
      cookieStore.get(SESSION_PERSISTENCE_COOKIE)?.value,
    );

  return createServerClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookieOptions: getAuthCookieOptions(sessionPersistence),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(
                name,
                value,
                applySessionPersistenceToCookieOptions(
                  options,
                  sessionPersistence,
                ),
              );
            }
          } catch {
            // Server Components cannot write cookies. The root proxy refreshes
            // the session and writes the replacement cookies to the response.
          }
        },
      },
      global: {
        fetch: (input, init) => fetch(input, { ...init, keepalive: true }),
      },
    },
  );
}
