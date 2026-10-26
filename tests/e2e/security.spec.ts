import { expect, test } from "@playwright/test";
import { ensureStaff, resetRateLimits, STAFF, totp } from "./helpers";

test.use({ storageState: { cookies: [], origins: [] } });

test("idle staff sessions expire and failed logins are rate-limited", async ({ page, context }) => {
  await resetRateLimits();
  await ensureStaff(STAFF.staff);
  await page.goto("/staff/login");
  await page.getByLabel("Email").fill(STAFF.staff.email);
  await page.getByLabel("Password").fill(STAFF.staff.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  const secret = (await page.getByTestId("mfa-secret").textContent())!.trim();
  await page.getByLabel("6-digit code").fill(totp(secret));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Intake inbox" })).toBeVisible();
  // Staff (non-admin) can't open admin pages.
  await page.goto("/staff/audit");
  await expect(page).toHaveURL(/reason=forbidden/);

  // Simulate 31 minutes of inactivity.
  const cookies = await context.cookies();
  const seen = cookies.find((c) => c.name === "staff_seen")!;
  await context.addCookies([{ ...seen, value: String(Date.now() - 31 * 60_000) }]);
  await page.goto("/staff");
  await expect(page).toHaveURL(/\/staff\/login\?reason=idle/);
  await expect(page.getByText("signed out after a period of inactivity")).toBeVisible();
  await page.goto("/staff");
  await expect(page).toHaveURL(/\/staff\/login/);

  // Brute force: after 5 attempts for one email in 15 minutes, even the right password is refused.
  await resetRateLimits();
  for (let i = 0; i < 5; i++) {
    await page.getByLabel("Email").fill(STAFF.staff.email);
    await page.getByLabel("Password").fill(`wrong-${i}`);
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/staff/login")),
      page.getByRole("button", { name: "Sign in" }).click(),
    ]);
    await expect(page.getByText("That email and password don't match")).toBeVisible();
  }
  await page.getByLabel("Password").fill(STAFF.staff.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Too many sign-in attempts")).toBeVisible();
  await resetRateLimits();
});
