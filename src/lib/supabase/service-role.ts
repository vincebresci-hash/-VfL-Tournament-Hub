import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/database";

export function createServiceRoleClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY must be set.");
  }

  const { url } = getSupabasePublicConfig();

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Optional service-role access for non-critical, privileged enhancements.
 *
 * Callers must still enforce their own authorization before invoking this
 * helper. A missing key returns null so a Preview deployment can fail closed
 * without taking the surrounding page down.
 */
export function createServiceRoleClientIfConfigured() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  return createServiceRoleClient();
}
