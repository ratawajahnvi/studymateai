import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireDatabaseEnv } from "../config/env";

let cachedAdminClient: SupabaseClient | null = null;

/**
 * Returns a server-side Supabase client configured with the service-role key.
 * All repository operations enforce explicit student_profile_id ownership checks
 * in addition to database constraints and RLS policies.
 * NEVER import this module inside client components.
 */
export function getServerSupabaseClient(): {
  client: SupabaseClient;
  storageBucket: string;
} {
  const { supabaseUrl, supabaseServiceRoleKey, storageBucket } = requireDatabaseEnv();

  if (!cachedAdminClient) {
    cachedAdminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return {
    client: cachedAdminClient,
    storageBucket,
  };
}
