"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface SystemSettingsMap {
  institution_name: string;
  admin_contact_email: string;
  allowed_email_domains: string[];
  google_auto_provision: boolean;
  retention_policy: {
    log_retention_days: number;
    closed_account_retention_days: number;
  };
  primary_color: string;
  announcement_banner?: string;
  announcement_enabled?: boolean;
}

export interface DepartmentItem {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  program_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ProgramItem {
  id: string;
  name: string;
  code: string;
  department_id: string | null;
  department_name: string;
  type: "college" | "senior_high";
  description: string | null;
  created_at?: string;
  updated_at?: string;
}

import { requireRole } from "@/lib/auth/roles";

let cachedSettings: { data: SystemSettingsMap; timestamp: number } | null = null;
let cachedDepartments: { data: DepartmentItem[]; timestamp: number } | null = null;
let cachedPrograms: Map<string, { data: ProgramItem[]; timestamp: number }> = new Map();
const CONFIG_CACHE_TTL_MS = 30000; // 30 seconds

function invalidateSettingsCache() {
  cachedSettings = null;
}

function invalidateInstitutionalCache() {
  cachedDepartments = null;
  cachedPrograms.clear();
}

async function requireAdmin() {
  const profile = await requireRole(["admin", "super_admin"]);
  const admin = createAdminClient();
  return { user: profile, admin };
}

export async function getSystemSettings(): Promise<SystemSettingsMap> {
  const now = Date.now();
  if (cachedSettings && now - cachedSettings.timestamp < CONFIG_CACHE_TTL_MS) {
    return cachedSettings.data;
  }

  const { admin } = await requireAdmin();

  const { data: rows, error } = await admin.from("settings").select("key, value");

  if (error) {
    console.error("Failed to load settings:", error);
    throw new Error("Could not load system settings");
  }

  const map: Record<string, unknown> = {};
  for (const row of rows || []) {
    map[row.key] = row.value;
  }

    const result: SystemSettingsMap = {
    institution_name:
      typeof map.institution_name === "string"
        ? map.institution_name
        : "Philippine Electronics and Communication Institute of Technology",
    admin_contact_email:
      typeof map.admin_contact_email === "string"
        ? map.admin_contact_email
        : "admin@pecit.edu.ph",
    allowed_email_domains: Array.isArray(map.allowed_email_domains)
      ? (map.allowed_email_domains as string[])
      : ["pecit.edu.ph"],
    google_auto_provision: Boolean(map.google_auto_provision),
    retention_policy:
      map.retention_policy && typeof map.retention_policy === "object"
        ? (map.retention_policy as SystemSettingsMap["retention_policy"])
        : { log_retention_days: 1825, closed_account_retention_days: 365 },
    primary_color:
      typeof map.primary_color === "string" ? map.primary_color : "#0A2540",
    announcement_banner:
      typeof map.announcement_banner === "string" ? map.announcement_banner : "",
    announcement_enabled: Boolean(map.announcement_enabled),
  };

  cachedSettings = { data: result, timestamp: now };
  return result;
}

export async function updateSystemSettings(
  settings: Partial<SystemSettingsMap>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { admin } = await requireAdmin();

    const updates = Object.entries(settings);
    for (const [key, value] of updates) {
      const { error } = await admin
        .from("settings")
        .upsert({ key, value: value as unknown });

      if (error) throw error;
    }

    invalidateSettingsCache();
    revalidatePath("/settings");
    revalidatePath("/");
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function getDepartments(): Promise<DepartmentItem[]> {
  const now = Date.now();
  if (cachedDepartments && now - cachedDepartments.timestamp < CONFIG_CACHE_TTL_MS) {
    return cachedDepartments.data;
  }

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("departments")
    .select("id, name, code, description, created_at, updated_at, programs(id)")
    .order("name", { ascending: true });

  if (error) {
    console.error("Failed to load departments:", error);
    return [];
  }

  const result = (rows || []).map(
    (row: {
      id: string;
      name: string;
      code: string | null;
      description: string | null;
      programs?: { id: string }[] | null;
      created_at?: string;
      updated_at?: string;
    }) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      description: row.description,
      program_count: Array.isArray(row.programs) ? row.programs.length : 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }),
  );

  cachedDepartments = { data: result, timestamp: now };
  return result;
}

export async function addDepartment(data: {
  name: string;
  code?: string;
  description?: string;
}): Promise<{ success: boolean; data?: DepartmentItem; error?: string }> {
  try {
    const { admin } = await requireAdmin();
    const name = data.name.trim();
    if (!name) return { success: false, error: "Department name is required." };

    const { data: created, error } = await admin
      .from("departments")
      .insert({
        name,
        code: data.code?.trim().toUpperCase() || null,
        description: data.description?.trim() || null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return { success: false, error: "A department with this name already exists." };
      }
      return { success: false, error: error.message };
    }

    invalidateInstitutionalCache();
    revalidatePath("/settings");
    revalidatePath("/archive");
    revalidatePath("/");
    return { success: true, data: created };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateDepartment(
  id: string,
  data: {
    name: string;
    code?: string;
    description?: string;
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    const { admin } = await requireAdmin();
    const name = data.name.trim();
    if (!name) return { success: false, error: "Department name is required." };

    const { data: existing } = await admin
      .from("departments")
      .select("name")
      .eq("id", id)
      .single();

    const { error } = await admin
      .from("departments")
      .update({
        name,
        code: data.code?.trim().toUpperCase() || null,
        description: data.description?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      if (error.code === "23505") {
        return { success: false, error: "A department with this name already exists." };
      }
      return { success: false, error: error.message };
    }

    if (existing && existing.name !== name) {
      await admin
        .from("programs")
        .update({ department_name: name })
        .eq("department_id", id);
    }

    invalidateInstitutionalCache();
    revalidatePath("/settings");
    revalidatePath("/archive");
    revalidatePath("/");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteDepartment(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { admin } = await requireAdmin();

    const { count: progCount } = await admin
      .from("programs")
      .select("id", { count: "exact", head: true })
      .eq("department_id", id);

    if (progCount && progCount > 0) {
      return {
        success: false,
        error: `Cannot delete department: ${progCount} program(s) are associated with it. Please reassign or delete them first.`,
      };
    }

    const { error } = await admin.from("departments").delete().eq("id", id);
    if (error) return { success: false, error: error.message };

    invalidateInstitutionalCache();
    revalidatePath("/settings");
    revalidatePath("/archive");
    revalidatePath("/");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function getPrograms(
  type: "all" | "college" | "senior_high" = "all",
): Promise<ProgramItem[]> {
  const now = Date.now();
  const cached = cachedPrograms.get(type);
  if (cached && now - cached.timestamp < CONFIG_CACHE_TTL_MS) {
    return cached.data;
  }

  const admin = createAdminClient();
  let query = admin
    .from("programs")
    .select("id, name, code, department_id, department_name, type, description, created_at, updated_at")
    .order("name", { ascending: true });

  if (type !== "all") {
    query = query.eq("type", type);
  }

  const { data: rows, error } = await query;
  if (error) {
    console.error("Failed to load programs:", error);
    return [];
  }

  const result = (rows || []).map(
    (row: {
      id: string;
      name: string;
      code: string;
      department_id: string | null;
      department_name: string;
      type: "college" | "senior_high";
      description: string | null;
      created_at?: string;
      updated_at?: string;
    }) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      department_id: row.department_id,
      department_name: row.department_name,
      type: row.type,
      description: row.description,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }),
  );

  cachedPrograms.set(type, { data: result, timestamp: now });
  return result;
}

export async function addProgram(data: {
  name: string;
  code: string;
  department_name: string;
  type?: "college" | "senior_high";
  description?: string;
}): Promise<{ success: boolean; data?: ProgramItem; error?: string }> {
  try {
    const { admin } = await requireAdmin();
    const name = data.name.trim();
    const code = data.code.trim().toUpperCase();
    const departmentName = data.department_name.trim();

    if (!name) return { success: false, error: "Program name is required." };
    if (!code) return { success: false, error: "Program code is required." };
    if (!departmentName) return { success: false, error: "Department is required." };

    const { data: dept } = await admin
      .from("departments")
      .select("id")
      .ilike("name", departmentName)
      .maybeSingle();

    const inferredType =
      data.type ||
      (departmentName.toUpperCase().includes("SENIOR HIGH") ? "senior_high" : "college");

    const { data: created, error } = await admin
      .from("programs")
      .insert({
        name,
        code,
        department_id: dept?.id || null,
        department_name: departmentName,
        type: inferredType,
        description: data.description?.trim() || null,
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };

    invalidateInstitutionalCache();
    revalidatePath("/settings");
    return { success: true, data: created };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateProgram(
  id: string,
  data: {
    name: string;
    code: string;
    department_name: string;
    type?: "college" | "senior_high";
    description?: string;
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    const { admin } = await requireAdmin();
    const name = data.name.trim();
    const code = data.code.trim().toUpperCase();
    const departmentName = data.department_name.trim();

    if (!name) return { success: false, error: "Program name is required." };
    if (!code) return { success: false, error: "Program code is required." };
    if (!departmentName) return { success: false, error: "Department is required." };

    const { data: dept } = await admin
      .from("departments")
      .select("id")
      .ilike("name", departmentName)
      .maybeSingle();

    const inferredType =
      data.type ||
      (departmentName.toUpperCase().includes("SENIOR HIGH") ? "senior_high" : "college");

    const { error } = await admin
      .from("programs")
      .update({
        name,
        code,
        department_id: dept?.id || null,
        department_name: departmentName,
        type: inferredType,
        description: data.description?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) return { success: false, error: error.message };

    invalidateInstitutionalCache();
    revalidatePath("/settings");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteProgram(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { admin } = await requireAdmin();

    const { error } = await admin.from("programs").delete().eq("id", id);
    if (error) return { success: false, error: error.message };

    invalidateInstitutionalCache();
    revalidatePath("/settings");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
