import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Cliente con service_role — solo para uso en servidor, nunca en cliente
export function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
