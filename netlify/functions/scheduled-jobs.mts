import type { Config } from "@netlify/functions";

// Netlify Scheduled Function: every 15 minutes, ask the app to run its jobs
// (reminders, quarterly chase, retention flags, cleanup). Scheduled functions
// only run on the published production deploy.
export default async () => {
  const base = process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error("scheduled-jobs: URL or CRON_SECRET is not set");
    return;
  }
  const res = await fetch(`${base}/api/cron/run`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: "{}",
  });
  console.log("scheduled-jobs", res.status, await res.text());
};

export const config: Config = {
  schedule: "*/15 * * * *",
};
