import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against a local Supabase stack (`npx supabase start`)
// and a production build (`npm run build && npm run start`) with
// INSECURE_LOCAL_TESTING=1 so Turnstile is skipped and dry-run messages
// (with links) are written to DEV_OUTBOX_DIR for the tests to follow.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/e2e-results.json" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "staff-setup", testMatch: /staff\.setup\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "security", testMatch: /security\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", testMatch: /intake\.spec\.ts/, use: { ...devices["iPhone 13"], browserName: "chromium" } },
    {
      name: "dashboard",
      testMatch: /(dashboard|automations|quarterly|extraction)\.spec\.ts/,
      dependencies: ["staff-setup"],
      use: { ...devices["Desktop Chrome"], storageState: "test-results/.auth/admin.json", acceptDownloads: true },
    },
  ],
  webServer: {
    command: "npm run start -- -H 127.0.0.1 -p 3000",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
