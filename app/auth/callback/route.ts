import { type NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  const admin = createAdminClient();

  // Check if Google Workspace OAuth is enabled in system settings
  const { data: settingRow } = await admin
    .from("settings")
    .select("value")
    .eq("key", "google_login_enabled")
    .single();

  const googleLoginEnabled = settingRow?.value === true;

  if (!googleLoginEnabled) {
    return new NextResponse(
      "Google sign-in is not enabled. Contact the institution administrator.",
      { status: 403 },
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=Invalid+authorization+code", request.url),
    );
  }

  // Four-layer verification per SPEC.md:
  // 1. Code exchange
  const supabase = await createClient();
  const { data: sessionData, error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError || !sessionData.user) {
    return NextResponse.redirect(
      new URL("/login?error=Authentication+failed", request.url),
    );
  }

  const user = sessionData.user;

  // Check 1: Require a verified email
  if (!user.email_confirmed_at && !user.confirmed_at) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      new URL("/login?error=Email+is+not+verified", request.url),
    );
  }

  // Check 2: Require a domain listed in settings.allowed_email_domains
  const { data: domainsSetting } = await admin
    .from("settings")
    .select("value")
    .eq("key", "allowed_email_domains")
    .single();

  const allowedDomains: string[] = Array.isArray(domainsSetting?.value)
    ? (domainsSetting.value as string[])
    : ["pecit.edu.ph"];

  const emailDomain = user.email?.split("@")[1]?.toLowerCase();
  if (!emailDomain || !allowedDomains.includes(emailDomain)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      new URL(
        "/login?error=Email+domain+is+not+authorized+for+PECIT+access",
        request.url,
      ),
    );
  }

  // Check 3: Existing profile row
  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      new URL(
        "/login?error=This+account+is+not+registered.+Contact+the+administrator.",
        request.url,
      ),
    );
  }

  // Check 4: Profile must be active
  if (profile.status !== "active") {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      new URL(
        "/login?error=This+account+is+disabled.+Contact+the+administrator.",
        request.url,
      ),
    );
  }

  return NextResponse.redirect(new URL("/", request.url));
}
