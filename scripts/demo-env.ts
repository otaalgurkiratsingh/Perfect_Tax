/**
 * Write .env.local for a LOCAL demo from `npx supabase status` (run `npx supabase start` first).
 *
 *   npm run demo:env                 (refuses to overwrite an existing .env.local)
 *   npm run demo:env -- --force
 *
 * Messages stay in dry-run (written to .outbox/, never sent). Turnstile is skipped.
 * For demos and development only — never use these settings for the real deployment.
 */
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";

const file = path.resolve(process.cwd(), ".env.local");
if (existsSync(file) && !process.argv.includes("--force")) {
  console.error(".env.local already exists. Use `npm run demo:env -- --force` to replace it.");
  process.exit(1);
}
const status = execSync("npx supabase status -o env", { encoding: "utf8" });
const get = (name: string) => {
  const m = new RegExp(`^${name}="?([^"\\n]+)"?$`, "m").exec(status);
  if (!m) throw new Error(`${name} missing from \`supabase status\` — is \`npx supabase start\` running?`);
  return m[1];
};
const secret = () => randomBytes(32).toString("base64");
const lines = [
  `NEXT_PUBLIC_SUPABASE_URL=${get("API_URL")}`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY=${get("ANON_KEY")}`,
  `SUPABASE_SERVICE_ROLE_KEY=${get("SERVICE_ROLE_KEY")}`,
  `SUPABASE_DB_URL=${get("DB_URL")}`,
  "NEXT_PUBLIC_SITE_URL=http://localhost:3000",
  `SIN_ENCRYPTION_KEY=${secret()}`,
  `LINK_SIGNING_SECRET=${secret()}`,
  `CRON_SECRET=${randomBytes(24).toString("hex")}`,
  "MESSAGING_MODE=dry_run",
  "INSECURE_LOCAL_TESTING=1",
  `DEV_OUTBOX_DIR=${path.resolve(process.cwd(), ".outbox")}`,
  "TWILIO_AUTH_TOKEN=local-demo-token",
  "STORAGE_PROXY=1",
  "",
];
writeFileSync(file, lines.join("\n"), { mode: 0o600 });
console.log("Wrote .env.local for a local demo (messages are NOT sent; they're saved in .outbox/).");
