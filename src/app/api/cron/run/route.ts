import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { runAllJobs } from "@/lib/jobs";

// Called every 15 minutes by the Netlify scheduled function with the CRON_SECRET.
export const maxDuration = 26;

function authorized(request: Request): boolean {
  const given = Buffer.from((request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(env.cronSecret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { ignoreSendWindow?: boolean };
  const report = await runAllJobs({ ignoreSendWindow: env.isLocalTesting && body.ignoreSendWindow === true });
  return Response.json(report, { headers: { "Cache-Control": "no-store" } });
}
