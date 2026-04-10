import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const CLAWFC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_CLAWFC_SUPABASE_URL ?? "";
const CLAWFC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_CLAWFC_SUPABASE_ANON_KEY ?? "";

let client: SupabaseClient | null = null;

/** Returns the ClawFC Supabase client, or null when credentials are missing. */
export const getClawFCClient = (): SupabaseClient | null => {
  if (!CLAWFC_SUPABASE_URL || !CLAWFC_SUPABASE_ANON_KEY) return null;
  if (!client) {
    client = createClient(CLAWFC_SUPABASE_URL, CLAWFC_SUPABASE_ANON_KEY);
  }
  return client;
};

export const isClawFCConfigured = (): boolean =>
  Boolean(CLAWFC_SUPABASE_URL && CLAWFC_SUPABASE_ANON_KEY);
