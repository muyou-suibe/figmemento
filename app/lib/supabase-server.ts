import { createClient } from "@supabase/supabase-js";
import { readSupabaseServerConfig } from "../config/server";

export function getSupabaseServerClient() {
  const { url, secretKey } = readSupabaseServerConfig();

  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
