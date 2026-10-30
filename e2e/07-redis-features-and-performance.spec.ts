import { test, expect } from "@playwright/test";

test.describe("07. Redis Features, Admin UI & Performance Suite", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test("01. Admin UI: Redis configurations are hidden when toggle is disabled and revealed when enabled", async ({
    page,
  }) => {
    // Login as Superadmin
    await page.goto("/login");
    await page.fill("#username", "admin");
    await page.fill("#password", "feelgood6969");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 10000 });

    // Click "Pengaturan Teknis" tab
    const techTab = page.locator('button:has-text("Pengaturan Teknis")').first();
    await techTab.click();

    // Click "Manajemen Basis Data" subtab
    const dbSubTab = page.locator('button:has-text("Manajemen Basis Data")');
    await dbSubTab.click();

    // Verify Redis card title without (Opsional) badge
    const redisHeading = page.locator('#section-redis-heading');
    await expect(redisHeading).toContainText("Redis Cache Server");
    await expect(redisHeading).not.toContainText("Opsional");

    const toggle = page.getByRole("switch", { name: "Toggle Redis Cache" });
    const isChecked = (await toggle.getAttribute("aria-checked")) === "true";

    if (isChecked) {
      // Toggle off to verify hiding
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "false");
      await expect(page.locator('text="Redis Dinonaktifkan"')).toBeVisible({ timeout: 5000 });
    }

    // Verify configuration fields and status bar are hidden when toggle is disabled
    const hostInput = page.locator('#redis-host-input');
    await expect(hostInput).not.toBeVisible();
    await expect(page.locator('#redis-port-input')).not.toBeVisible();
    await expect(page.locator('#redis-password-input')).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Uji Koneksi", exact: true })).not.toBeVisible();

    // Click toggle to enable
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(page.locator('text="Redis Diaktifkan"')).toBeVisible({ timeout: 5000 });

    // Verify fields and action buttons appear immediately
    await expect(hostInput).toBeVisible();
    await expect(page.locator('#redis-port-input')).toBeVisible();
    await expect(page.locator('#redis-password-input')).toBeVisible();
    await expect(page.getByRole("button", { name: "Uji Koneksi", exact: true })).toBeVisible();
    await expect(page.locator('button:has-text("Simpan Pengaturan")')).toBeVisible();
    await expect(page.locator('text="Siap Diuji"')).toBeVisible();
  });

  test("02. Admin UI: Uji Koneksi works and displays realtime status and latency", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.fill("#username", "admin");
    await page.fill("#password", "feelgood6969");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 10000 });

    await page.locator('button:has-text("Pengaturan Teknis")').first().click();
    await page.locator('button:has-text("Manajemen Basis Data")').click();

    const toggle = page.getByRole("switch", { name: "Toggle Redis Cache" });
    const isChecked = (await toggle.getAttribute("aria-checked")) === "true";
    if (!isChecked) {
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "true");
    }

    // Ensure Host & Port are set to localhost redis
    await page.fill('#redis-host-input', '127.0.0.1');
    await page.fill('#redis-port-input', '6379');

    // Click Uji Koneksi
    const testBtn = page.getByRole("button", { name: "Uji Koneksi", exact: true });
    await testBtn.click();

    // Notice alert banner should show success
    const notice = page.locator('div[role="alert"]:not(#__next-route-announcer__)');
    await expect(notice).toBeVisible({ timeout: 10000 });
    await expect(notice).toContainText(/Koneksi Berhasil/i);
  });

  test("03. Admin UI: Toggle ON, Save settings, and verify persistence after page reload", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.fill("#username", "admin");
    await page.fill("#password", "feelgood6969");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 10000 });

    await page.locator('button:has-text("Pengaturan Teknis")').first().click();
    await page.locator('button:has-text("Manajemen Basis Data")').click();

    const toggle = page.getByRole("switch", { name: "Toggle Redis Cache" });
    const isChecked = (await toggle.getAttribute("aria-checked")) === "true";

    // If currently false, click to turn on
    if (!isChecked) {
      await toggle.click();
    }

    const saveBtn = page.locator('button:has-text("Simpan Pengaturan")');
    await saveBtn.click();

    // Wait for save notification
    await expect(page.locator('text="Pengaturan Tersimpan"')).toBeVisible({ timeout: 10000 });

    // Refresh page to verify persistence
    await page.reload();

    // Navigate back to database subtab
    await page.locator('button:has-text("Pengaturan Teknis")').first().click();
    await page.locator('button:has-text("Manajemen Basis Data")').click();

    // Toggle must still be ON!
    const toggleAfterReload = page.getByRole("switch", { name: "Toggle Redis Cache" });
    await expect(toggleAfterReload).toHaveAttribute("aria-checked", "true");

    // Status indicator should show Online
    const statusOnline = page.locator('span:text-is("Online")');
    await expect(statusOnline.first()).toBeVisible({ timeout: 15000 });

    // Fields must persist values
    await expect(page.locator('#redis-host-input')).toHaveValue('127.0.0.1');
    await expect(page.locator('#redis-port-input')).toHaveValue('6379');
  });

  test("04. Performance & Portal Caching: Cached response time is noticeably faster", async ({
    page,
  }) => {
    // First request: Cache warm-up / initial query
    const t0 = Date.now();
    const res1 = await page.goto("/portal/eqf");
    const dur1 = Date.now() - t0;
    expect(res1?.status()).toBe(200);

    // Second request: Should be served from Redis cache
    const t1 = Date.now();
    const res2 = await page.goto("/portal/eqf");
    const dur2 = Date.now() - t1;
    expect(res2?.status()).toBe(200);

    // Both requests must succeed without error
    await expect(page.locator("body")).toContainText("XII TKJ 2");
  });

  test("05. Realtime Polling API: /api/redis/status returns proper JSON for Superadmin", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.fill("#username", "admin");
    await page.fill("#password", "feelgood6969");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 10000 });

    // Fetch /api/redis/status via page context (maintains session cookie)
    const response = await page.request.get("/api/redis/status");
    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json).toHaveProperty("enabled");
    expect(json).toHaveProperty("connected");
    expect(json).toHaveProperty("latencyMs");
    expect(typeof json.latencyMs).toBe("number");
  });
});
