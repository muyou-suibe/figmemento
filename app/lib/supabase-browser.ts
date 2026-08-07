import { createClient } from "@supabase/supabase-js";
import { getPublicSupabaseConfig } from "../config/public";

export function getSupabaseBrowserClient() {
  const { url, publishableKey } = getPublicSupabaseConfig();

  return createClient(url, publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}
