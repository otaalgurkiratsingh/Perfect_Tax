import { expect, test as setup } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureStaff, resetRateLimits, STAFF, totp } from "./helpers";

// Signs in as an admin through the real UI — password, then 2-step (TOTP)
// enrolment — and saves the session for the dashboard tests.
setup("admin signs in with password + authenticator app", async ({ page }) => {
  await resetRateLimits();
  await ensureStaff(STAFF.admin);

  // Wrong password is refused and logged.
  await page.goto("/staff/login");
  await page.getByLabel("Email").fill(STAFF.admin.email);
  await page.getByLabel("Password").fill("wrong-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("That email and password don't match")).toBeVisible();

  await page.getByLabel("Password").fill(STAFF.admin.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // 2FA is required before the dashboard opens.
  await expect(page.getByRole("heading", { name: "Set up two-step sign-in" })).toBeVisible();
  const secret = (await page.getByTestId("mfa-secret").textContent())!.trim();
  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("That code didn't work")).toBeVisible();
  await page.getByLabel("6-digit code").fill(totp(secret));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Intake inbox" })).toBeVisible();

  mkdirSync("test-results/.auth", { recursive: true });
  writeFileSync("test-results/.auth/totp-secret.txt", secret);
  await page.context().storageState({ path: "test-results/.auth/admin.json" });
});
