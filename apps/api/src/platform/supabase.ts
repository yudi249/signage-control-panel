import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Config } from "./config.ts";

export type Db = SupabaseClient;

/**
 * Satu-satunya tempat klien Supabase dibuat (ADR-0003). Hanya repository di modul
 * yang boleh menerima `Db`; service role key tidak boleh keluar dari apps/api.
 */
export function createDb(config: { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string }): Db {
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
