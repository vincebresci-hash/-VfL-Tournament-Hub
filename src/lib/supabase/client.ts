import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "@/lib/supabase/env";
import { supabaseAuthCookieOptions } from "@/lib/supabase/cookie-options";
import type { Database } from "@/lib/supabase/database";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient<Database> | undefined;

export function createClient() {
  if (browserClient) {
    return browserClient;
  }

  const { url, publishableKey } = getSupabasePublicConfig();
  browserClient = createBrowserClient<Database>(url, publishableKey, {
    cookieOptions: supabaseAuthCookieOptions,
  });

  return browserClient;
}
