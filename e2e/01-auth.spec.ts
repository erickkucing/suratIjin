import { test, expect } from "@playwright/test";
import { execSync } from "child_process";

test.describe("01. Authentication & Security Module", () => {
  test.beforeAll(async () => {
    try {
      execSync("redis-cli flushall");
    } catch {}
  });

  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test("should successfully log in as Superadmin and redirect to /admin", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("h2")).toContainText("Selamat Datang");

    await page.fill("#username", "admin");
    await page.fill("#password", "feelgood6969");
    await Promise.all([
      page.waitForURL(/\/admin/, { timeout: 10000 }),
      page.click('button[type="submit"]'),
    ]);

    await expect(page).toHaveURL(/\/admin/);
    await expect(page.locator("h1")).toContainText("Superadmin");
  });

  test("should successfully log in as Wali Kelas and redirect to /dashboard", async ({ page }) => {
    await page.goto("/login");

    await page.fill("#username", "erick");
    await page.fill("#password", "feelgood6969");
    await Promise.all([
      page.waitForURL(/\/dashboard/, { timeout: 10000 }),
      page.click('button[type="submit"]'),
    ]);

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator("body")).toContainText("XII TKJ 2");
  });

  test("should show error alert on invalid credentials", async ({ page }) => {
    await page.goto("/login");

    await page.fill("#username", "invalid_teacher");
    await page.fill("#password", "wrongpassword");
    await page.click('button[type="submit"]');

    const alert = page.locator('div[role="alert"]:not(#__next-route-announcer__)');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/Username atau password salah/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test("should trigger rate limit lockout (HTTP 429) after multiple failed attempts", async ({ page }) => {
    await page.goto("/login");
    const testUsername = `lockout_probe_${Date.now()}`;

    // Perform repeated failed logins to hit the rate limiter (threshold is 5)
    for (let i = 0; i < 5; i++) {
      await page.fill("#username", testUsername);
      await page.fill("#password", "badpass123");
      await page.click('button[type="submit"]');
      await page.waitForTimeout(400);
    }

    const alert = page.locator('div[role="alert"]:not(#__next-route-announcer__)');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/Terlalu banyak percobaan/i);

    // Clear rate limit lock so subsequent tests from 127.0.0.1 proceed smoothly
    try {
      execSync("redis-cli flushall");
    } catch {}
  });

  test("should successfully log out and redirect to /login", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#username", "erick");
    await page.fill("#password", "feelgood6969");
    await Promise.all([
      page.waitForURL(/\/dashboard/, { timeout: 10000 }),
      page.click('button[type="submit"]'),
    ]);
    await expect(page).toHaveURL(/\/dashboard/);

    const logoutBtn = page.locator('button[title="Keluar"]');
    await expect(logoutBtn).toBeVisible();
    await Promise.all([
      page.waitForURL(/\/login/, { timeout: 10000 }),
      logoutBtn.click(),
    ]);

    await expect(page).toHaveURL(/\/login/);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
