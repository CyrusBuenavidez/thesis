"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole, type UserRole, invalidateUserProfileCache } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const registerUserSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required"),
  email: z.string().trim().email("Valid email required"),
  role: z.enum(["student", "advisor", "librarian", "admin", "super_admin"]),
  department: z.string().trim().optional(),
  program: z.string().trim().optional(),
  authMode: z.enum(["invite", "password"]),
  temporaryPassword: z.string().optional(),
});

export async function getUsersList(options?: {
  search?: string;
  roleFilter?: string;
  statusFilter?: string;
  page?: number;
  pageSize?: number;
}) {
  await requireRole(["admin", "super_admin"]);
  const admin = createAdminClient();

  const page = options?.page || 1;
  const pageSize = options?.pageSize || 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin.from("profiles").select("*", { count: "estimated" });

  const VALID_ROLES = ["student", "advisor", "librarian", "admin", "super_admin"];
  if (options?.roleFilter && options.roleFilter !== "all" && VALID_ROLES.includes(options.roleFilter)) {
    query = query.eq("role", options.roleFilter);
  }

  if (options?.statusFilter && options.statusFilter !== "all") {
    query = query.eq("status", options.statusFilter);
  }

  if (options?.search) {
    const term = `%${options.search}%`;
    query = query.or(`full_name.ilike.${term},email.ilike.${term}`);
  }

  query = query.order("created_at", { ascending: false }).range(from, to);

  const [profileResult, authUsersResult] = await Promise.all([
    query,
    admin.auth.admin.listUsers({
      page,
      perPage: pageSize,
    }),
  ]);

  const { data, count, error } = profileResult;
  if (error) {
    throw new Error(`Failed to load users: ${error.message}`);
  }

  const authUsers = authUsersResult.data;

  const lastSignInMap = new Map(
    authUsers?.users.map((u) => [u.id, u.last_sign_in_at]) || [],
  );

  const usersWithSignIn = (data || []).map((p) => ({
    ...p,
    last_sign_in_at: lastSignInMap.get(p.id) || null,
  }));

  return {
    users: usersWithSignIn,
    totalCount: count || 0,
    totalPages: Math.ceil((count || 0) / pageSize),
  };
}

export async function registerUser(formData: FormData) {
  const actor = await requireRole(["admin", "super_admin"]);

  const raw = {
    fullName: formData.get("full_name"),
    email: formData.get("email"),
    role: formData.get("role"),
    department: formData.get("department") || undefined,
    program: formData.get("program") || undefined,
    authMode: formData.get("auth_mode"),
    temporaryPassword: formData.get("temporary_password") || undefined,
  };

  const parsed = registerUserSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join(", "),
    };
  }

  const { fullName, email, role, department, program, authMode, temporaryPassword } =
    parsed.data;

  // Role hierarchy enforcement: Admin can only create student, advisor, librarian
  if (actor.role === "admin" && (role === "admin" || role === "super_admin")) {
    return {
      success: false,
      error: "Administrators cannot provision Admin or Super Admin accounts.",
    };
  }

  const admin = createAdminClient();

  // Check if profile or user already exists
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .single();

  if (existingProfile) {
    return {
      success: false,
      error: `An account with email ${email} already exists.`,
    };
  }

  let newUserId: string | null = null;

  try {
    if (authMode === "invite") {
      const { data: inviteData, error: inviteError } =
        await admin.auth.admin.inviteUserByEmail(email, {
          data: { full_name: fullName, role },
        });

      if (inviteError || !inviteData.user) {
        return {
          success: false,
          error: inviteError?.message || "Failed to send invitation email.",
        };
      }
      newUserId = inviteData.user.id;
    } else {
      const passwordToUse = temporaryPassword || "PecitTemp2026!#";
      const { data: createData, error: createError } =
        await admin.auth.admin.createUser({
          email,
          password: passwordToUse,
          email_confirm: true,
          user_metadata: { full_name: fullName, role },
        });

      if (createError || !createData.user) {
        return {
          success: false,
          error: createError?.message || "Failed to create authentication user.",
        };
      }
      newUserId = createData.user.id;
    }

    // Insert matching profile row
    const { error: profileError } = await admin.from("profiles").insert({
      id: newUserId,
      email,
      full_name: fullName,
      role,
      department: department || null,
      program: program || null,
      status: "active",
      must_change_password: role === "student" ? false : authMode === "password",
    });

    if (profileError) {
      // Rollback auth user so auth and profiles never drift (SPEC.md)
      await admin.auth.admin.deleteUser(newUserId);
      return {
        success: false,
        error: `Profile creation failed: ${profileError.message}. Authentication user rolled back.`,
      };
    }

    revalidatePath("/users");
    return { success: true };
  } catch (error) {
    if (newUserId) {
      await admin.auth.admin.deleteUser(newUserId);
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Registration failed.",
    };
  }
}

export async function toggleUserStatus(userId: string, currentStatus: string) {
  const actor = await requireRole(["admin", "super_admin"]);
  const admin = createAdminClient();

  const { data: target } = await admin
    .from("profiles")
    .select("role, status")
    .eq("id", userId)
    .single();

  if (!target) {
    return { success: false, error: "Target user not found." };
  }

  // Last super_admin cannot be demoted or deactivated
  if (target.role === "super_admin") {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact" })
      .eq("role", "super_admin")
      .eq("status", "active");

    if ((count || 0) <= 1 && currentStatus === "active") {
      return {
        success: false,
        error: "The last active Super Administrator cannot be deactivated.",
      };
    }
  }

  // Hierarchy enforcement
  if (actor.role === "admin" && (target.role === "admin" || target.role === "super_admin")) {
    return {
      success: false,
      error: "Administrators cannot alter Admin or Super Admin statuses.",
    };
  }

  const nextStatus = currentStatus === "active" ? "disabled" : "active";
  const { error } = await admin
    .from("profiles")
    .update({ status: nextStatus })
    .eq("id", userId);

  if (error) {
    return { success: false, error: error.message };
  }

  invalidateUserProfileCache(userId);
  revalidatePath("/users");
  return { success: true };
}

export async function changeUserRole(_userId: string, _newRole: UserRole) {
  return {
    success: false,
    error: "User role is immutable and cannot be changed after registration.",
  };
}

export async function resetUserPassword(userId: string) {
  await requireRole(["admin", "super_admin"]);
  const admin = createAdminClient();

  const { data: user } = await admin.from("profiles").select("email, role").eq("id", userId).single();
  if (!user) {
    return { success: false, error: "User not found." };
  }

  const tempPass = "PecitReset2026!#";
  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    password: tempPass,
  });

  if (authError) {
    return { success: false, error: authError.message };
  }

  // Only non-students are required or permitted to change their password
  const mustChange = user.role !== "student";

  await admin
    .from("profiles")
    .update({ must_change_password: mustChange })
    .eq("id", userId);

  invalidateUserProfileCache(userId);
  revalidatePath("/users");
  return {
    success: true,
    message: `Password reset to temporary password: ${tempPass}`,
  };
}

export interface CsvPreviewRow {
  rowIndex: number;
  email: string;
  fullName: string;
  role: string;
  department: string;
  program: string;
  valid: boolean;
  error?: string;
}

export async function parseAndValidateCsv(rows: Record<string, string>[]): Promise<{
  validCount: number;
  invalidCount: number;
  preview: CsvPreviewRow[];
}> {
  await requireRole(["admin", "super_admin"]);
  const allowedRoles = new Set(["student", "advisor", "librarian", "admin", "super_admin"]);

  const preview: CsvPreviewRow[] = rows.map((row, idx) => {
    const email = row.email?.trim() || "";
    const fullName = row.name?.trim() || row.full_name?.trim() || "";
    const role = (row.role?.trim().toLowerCase() || "student") as UserRole;
    const department = row.department?.trim() || "";
    const program = row.program?.trim() || "";

    const emailCheck = z.string().email().safeParse(email);
    const validRole = allowedRoles.has(role);

    let error = "";
    if (!emailCheck.success) {
      error = "Invalid email format";
    } else if (!fullName) {
      error = "Missing full name";
    } else if (!validRole) {
      error = `Unknown role: ${role}`;
    }

    return {
      rowIndex: idx + 1,
      email,
      fullName,
      role,
      department,
      program,
      valid: !error,
      error: error || undefined,
    };
  });

  const validCount = preview.filter((r) => r.valid).length;
  const invalidCount = preview.length - validCount;

  return { validCount, invalidCount, preview };
}

export async function updateOwnPassword(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const newPassword = String(formData.get("new_password") || "");
  const confirmPassword = String(formData.get("confirm_password") || "");

  if (newPassword.length < 12) {
    return { success: false, error: "Password must be at least 12 characters long." };
  }

  if (newPassword !== confirmPassword) {
    return { success: false, error: "Passwords do not match." };
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { success: false, error: "Authentication session expired. Please sign in again." };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  if (profile?.role === "student") {
    return {
      success: false,
      error: "Students are not allowed to update their password. Only administrators can change student passwords.",
    };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  await admin
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", userData.user.id);

  redirect("/");
}

