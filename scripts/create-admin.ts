/**
 * Create the first admin (or any staff) account.
 *
 *   npx tsx scripts/create-admin.ts you@firm.ca "Your Name" [admin|staff]
 *
 * Prints a one-time link to set the password (valid 1 hour). Needs
 * NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SITE_URL
 * in the environment or .env.local.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile } from "./env";

loadEnvFile();

async function main() {
  const [email, name, roleArg] = process.argv.slice(2);
  if (!email || !name) {
    console.error('Usage: npx tsx scripts/create-admin.ts you@firm.ca "Your Name" [admin|staff]');
    process.exit(1);
  }
  const role = roleArg === "staff" ? "staff" : "admin";
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data, error } = await db.auth.admin.createUser({
    email: email.toLowerCase(),
    email_confirm: true,
    password: `${randomBytes(24).toString("base64url")}aA1`,
    user_metadata: { full_name: name },
  });
  if (error || !data.user) throw new Error(error?.message ?? "createUser failed");
  const { error: pe } = await db.from("staff_profiles").insert({ id: data.user.id, email: email.toLowerCase(), full_name: name, role });
  if (pe) throw new Error(pe.message);
  const { data: link, error: le } = await db.auth.admin.generateLink({ type: "recovery", email: email.toLowerCase() });
  if (le || !link.properties) throw new Error(le?.message ?? "generateLink failed");
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  console.log(`Created ${role} ${email}.`);
  console.log(`Open this link within 1 hour to set the password (then set up 2-step sign-in):`);
  console.log(`${site}/staff/auth/confirm?token_hash=${link.properties.hashed_token}&type=recovery`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
