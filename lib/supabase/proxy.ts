import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import {
  applySessionPersistenceToCookieOptions,
  getAuthCookieOptions,
  parseSessionPersistence,
  SESSION_PERSISTENCE_COOKIE,
} from "@/lib/auth/session-cookie-policy";
import { getPublicEnv } from "@/lib/env";

const PUBLIC_ROUTES = ["/", "/login", "/auth/callback", "/archive"];
const SESSION_CACHE_HEADERS = ["cache-control", "expires", "pragma"];

function isPublicRoute(pathname: string) {
  if (pathname === "/") {
    return true;
  }
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function copySessionState(source: NextResponse, destination: NextResponse) {
  for (const cookie of source.cookies.getAll()) {
    destination.cookies.set(cookie);
  }

  for (const name of SESSION_CACHE_HEADERS) {
    const value = source.headers.get(name);
    if (value) {
      destination.headers.set(name, value);
    }
  }
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const environment = getPublicEnv();
  const sessionPersistence = parseSessionPersistence(
    request.cookies.get(SESSION_PERSISTENCE_COOKIE)?.value,
  );

  const supabase = createServerClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookieOptions: getAuthCookieOptions(sessionPersistence),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }

          response = NextResponse.next({ request });

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(
              name,
              value,
              applySessionPersistenceToCookieOptions(
                options,
                sessionPersistence,
              ),
            );
          }

          for (const [name, value] of Object.entries(headers)) {
            response.headers.set(name, value);
          }
        },
      },
      global: {
        fetch: (input, init) => fetch(input, { ...init, keepalive: true }),
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const hasVerifiedSession = Boolean(data?.claims);

  if (!hasVerifiedSession && !isPublicRoute(request.nextUrl.pathname)) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return response;
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";

    const redirectResponse = NextResponse.redirect(loginUrl);
    copySessionState(response, redirectResponse);
    return redirectResponse;
  }

  return response;
}
