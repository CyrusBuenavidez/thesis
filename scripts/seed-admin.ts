import nextEnvironment from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";

import { getServerEnv } from "../lib/env.ts";

const { loadEnvConfig } = nextEnvironment;
loadEnvConfig(process.cwd());

function generateTemporaryPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  const bytes = randomBytes(16);
  let password = "";
  for (let i = 0; i < bytes.length; i++) {
    password += chars[bytes[i] % chars.length];
  }
  // Ensure it satisfies complexity
  return password + "Aa1!";
}

async function promptEmail(): Promise<string> {
  const args = process.argv.slice(2);
  const argEmail = args.find((a) => a.includes("@"));
  if (argEmail) return argEmail.trim();

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question("Enter Super Admin email (e.g. admin@pecit.edu.ph): ", (answer) => {
      rl.close();
      resolve(answer.trim() || "admin@pecit.edu.ph");
    });
  });
}

async function main() {
  const environment = getServerEnv();

  const email = await promptEmail();
  if (!email || !email.includes("@")) {
    console.error("Error: A valid email address is required.");
    process.exit(1);
  }

  const supabase = createClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.SUPABASE_SECRET_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  const temporaryPassword = generateTemporaryPassword();

  console.log(`Provisioning super_admin account for: ${email}...`);

  // Check if user already exists
  let userId: string;
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  let existingUser = null;
  if (existingProfile) {
    const { data: userData } = await supabase.auth.admin.getUserById(existingProfile.id);
    existingUser = userData?.user;
  }
  if (!existingUser) {
    const { data: userList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    existingUser = userList?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  }

  if (existingUser) {
    userId = existingUser.id;
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      password: temporaryPassword,
      email_confirm: true,
    });
    if (updateError) {
      console.error(`Failed to update existing auth user: ${updateError.message}`);
      process.exit(1);
    }
    console.log("Updated password for existing auth account.");
  } else {
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        full_name: "Super Administrator",
      },
    });

    if (createError || !newUser.user) {
      console.error(`Failed to create auth user: ${createError?.message}`);
      process.exit(1);
    }
    userId = newUser.user.id;
    console.log("Created new auth account.");
  }

  // Upsert profile record
  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: userId,
      email,
      full_name: "Super Administrator",
      role: "super_admin",
      status: "active",
      must_change_password: true,
      department: "Administration",
      program: "System Management",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (profileError) {
    console.error(`Failed to upsert profile record: ${profileError.message}`);
    process.exit(1);
  }

  console.log("\n=======================================================");
  console.log(" Super Admin Provisioned Successfully");
  console.log("=======================================================");
  console.log(` Email:                 ${email}`);
  console.log(` Temporary Password:    ${temporaryPassword}`);
  console.log(" Must Change Password:  true");
  console.log(" Role:                  super_admin");
  console.log("=======================================================");
  console.log("NOTICE: Copy this temporary password now. It will not be shown again.");
}

await main();
