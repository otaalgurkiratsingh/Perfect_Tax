import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { db, env } from "./helpers";

test("database security self-check: RLS everywhere, nothing for anon, private bucket", () => {
  const out = execFileSync("psql", [env.SUPABASE_DB_URL, "-X", "-q", "-A", "-t", "-f", path.resolve(__dirname, "../../supabase/checks/security.sql")], { encoding: "utf8" });
  expect(out.trim(), out).toBe("");
});

test("SINs are never stored in plain text anywhere", async () => {
  const { data } = await db().from("intakes").select("answers, sin_ciphertext, spouse_sin_ciphertext").not("sin_ciphertext", "is", null).limit(200);
  expect(data!.length).toBeGreaterThan(0);
  for (const row of data!) {
    expect(row.sin_ciphertext).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(JSON.stringify(row.answers)).not.toMatch(/\b\d{3}\s?\d{3}\s?\d{3}\b/);
  }
  const dump = execFileSync("psql", [env.SUPABASE_DB_URL, "-X", "-A", "-t", "-c", "select string_agg(t::text, ' ') from (select * from audit_log) t; select string_agg(m::text, ' ') from message_log m;"], { encoding: "utf8" });
  expect(dump).not.toMatch(/130\s?692\s?544/);
});

test("audit log is append-only (updates and deletes are refused)", () => {
  for (const sql of ["update audit_log set action = 'x' where id = (select min(id) from audit_log);", "delete from audit_log where id = (select min(id) from audit_log);"]) {
    expect(() => execFileSync("psql", [env.SUPABASE_DB_URL, "-X", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })).toThrow(/append-only/);
  }
});
