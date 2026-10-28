if (typeof window !== "undefined") {
  throw new Error("This module can only be executed on the server.");
}

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getServerEnv } from "../env.ts";

let adminClientInstance: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (adminClientInstance) {
    return adminClientInstance;
  }

  const environment = getServerEnv();

  adminClientInstance = createClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.SUPABASE_SECRET_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        fetch: (input, init) => fetch(input, { ...init, keepalive: true }),
      },
    },
  );

  return adminClientInstance;
}
