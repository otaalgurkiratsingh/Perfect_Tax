import "server-only";
import { redirect } from "next/navigation";
import { sessionClient } from "@/lib/supabase/server";
import type { ClientRow } from "@/lib/quarterly/engine";

/** Signed-in client (magic link). Reads go through RLS: a client only ever sees their own rows. */
export async function requireClient() {
  const supabase = await sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/portal/login");
  const { data: client } = await supabase.from("clients").select("*").eq("auth_user_id", user.id).maybeSingle();
  if (!client) redirect("/portal/login?reason=no_account");
  return { supabase, user, client: client as ClientRow };
}
