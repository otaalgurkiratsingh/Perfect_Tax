// Tiny .env loader for CLI scripts (Next.js loads .env.local itself; scripts don't).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export function loadEnvFile(file = ".env.local") {
  const full = path.resolve(process.cwd(), file);
  if (!existsSync(full)) return;
  for (const line of readFileSync(full, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
