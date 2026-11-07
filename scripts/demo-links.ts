/**
 * Print ready-to-click demo links (LOCAL / DEMO databases only).
 *
 *   npm run demo:links -- https://your-tunnel.example.com
 *
 * Gives: the client form, staff sign-in (seed admin), a one-time client-page sign-in
 * for "Seed Bakery Inc." (valid 1 hour, works once) and a personal no-login upload
 * link for "Seed Plumbing". Run `npm run db:seed` first.
 */
import { loadEnvFile } from "./env";

loadEnvFile();

async function main() {
  const base = (process.argv[2] ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!/127\.0\.0\.1|localhost/.test(url) && !process.argv.includes("--allow-remote")) {
    throw new Error(`Refusing: ${url} is not a local database.`);
  }
  const { adminClient } = await import("@/lib/supabase/admin");
  const { issueToken } = await import("@/lib/security/tokens");
  const db = adminClient();

  const { data: bakery } = await db.from("clients").select("id, email").eq("email", "seed-bakery@example.com").maybeSingle();
  const { data: plumbing } = await db.from("clients").select("id").eq("email", "seed-plumbing@example.com").maybeSingle();
  if (!bakery || !plumbing) throw new Error("Demo clients not found — run `npm run db:seed` first.");
  await db.from("clients").update({ active: true }).like("email", "seed-%");

  // Same as the dashboard's "Invite to client page": make sure the client has a login linked to it.
  const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
  let userId = users.users.find((u) => u.email === bakery.email)?.id;
  if (!userId) {
    const { data: created, error: ce } = await db.auth.admin.createUser({ email: bakery.email!, email_confirm: true });
    if (ce || !created.user) throw new Error(ce?.message ?? "Could not create client login");
    userId = created.user.id;
  }
  await db.from("clients").update({ auth_user_id: null }).eq("auth_user_id", userId).neq("id", bakery.id);
  await db.from("clients").update({ auth_user_id: userId }).eq("id", bakery.id);
  const { data: link, error } = await db.auth.admin.generateLink({ type: "magiclink", email: bakery.email! });
  if (error || !link.properties?.hashed_token) throw new Error(error?.message ?? "Could not create sign-in link");
  const { data: cq } = await db.from("client_quarters").select("id").eq("client_id", plumbing.id).order("created_at", { ascending: false }).limit(1).single();
  const token = await issueToken({ purpose: "quarter_upload", clientQuarterId: cq!.id, expiresAt: new Date(Date.now() + 2 * 86_400_000) });

  const QRCode = (await import("qrcode")).default;
  console.log("\nScan to open the client form on a phone:\n");
  console.log(await QRCode.toString(`${base}/start`, { type: "terminal", small: true }));
  console.log(`
Client form (no account):        ${base}/start
Office tablet mode:              ${base}/start?kiosk=1
Staff dashboard:                 ${base}/staff
  email: seed-admin@example.com   password: the one printed by db:seed (or SEED_ADMIN_PASSWORD)
  first sign-in asks you to scan a QR code with an authenticator app
Client page (Seed Bakery Inc.):  ${base}/portal/auth/confirm?token_hash=${link.properties.hashed_token}&type=magiclink
  (works once, for 1 hour — rerun this command for a fresh one)
Personal upload link (Seed Plumbing, as sent by text): ${base}/q#t=${token}
`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
