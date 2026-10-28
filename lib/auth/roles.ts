import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { createClient } from "@/lib/supabase/server";

export type UserRole =
  | "student"
  | "advisor"
  | "librarian"
  | "admin"
  | "super_admin";

export type ProfileStatus = "active" | "disabled" | "graduated";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  department: string | null;
  program: string | null;
  status: ProfileStatus;
  must_change_password: boolean;
  privacy_consent_at: string | null;
  created_at: string;
  updated_at: string;
}

export function getUserLandingRoute(role: UserRole): string {
  switch (role) {
    case "student":
      return "/thesis-management";
    case "advisor":
      return "/review-manager";
    case "librarian":
      return "/repository";
    case "admin":
    case "super_admin":
    default:
      return "/dashboard";
  }
}

interface CachedProfile {
  profile: UserProfile;
  expiresAt: number;
}

const profileMemoryCache = new Map<string, CachedProfile>();
const PROFILE_CACHE_TTL_MS = 15_000; // 15 seconds micro-cache

export function invalidateUserProfileCache(userId?: string) {
  if (userId) {
    profileMemoryCache.delete(userId);
  } else {
    profileMemoryCache.clear();
  }
}

export async function getVerifiedUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (claimsData?.claims?.sub && typeof claimsData.claims.sub === "string") {
    return claimsData.claims.sub;
  }
  const { data: authData } = await supabase.auth.getUser();
  return authData?.user?.id ?? null;
}

export const getCurrentUserProfile = cache(async (): Promise<UserProfile | null> => {
  await connection();

  const supabase = await createClient();

  // Fast-path: get verified JWT claims locally without remote network round-trip (2-3ms vs 180ms)
  let userId: string | null = null;
  const { data: claimsData } = await supabase.auth.getClaims();

  if (claimsData?.claims?.sub && typeof claimsData.claims.sub === "string") {
    userId = claimsData.claims.sub;
  } else {
    // Fallback to getUser() if claims are not directly present
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return null;
    }
    userId = authData.user.id;
  }

  if (!userId) {
    return null;
  }

  // Micro-cache check to avoid hitting the database repeatedly within a session
  const cached = profileMemoryCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.profile;
  }

  // Fetch fresh profile from database (Rule 5)
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    return null;
  }

  const userProfile = profile as UserProfile;
  profileMemoryCache.set(userId, {
    profile: userProfile,
    expiresAt: Date.now() + PROFILE_CACHE_TTL_MS,
  });

  return userProfile;
});

export async function requireUser(): Promise<UserProfile> {
  const profile = await getCurrentUserProfile();

  if (!profile) {
    redirect("/login");
  }

  if (profile.status === "disabled") {
    redirect("/login?error=disabled");
  }

  return profile;
}

export async function requireRole(allowedRoles: UserRole[]): Promise<UserProfile> {
  const profile = await requireUser();

  if (!allowedRoles.includes(profile.role)) {
    redirect(getUserLandingRoute(profile.role));
  }

  return profile;
}
