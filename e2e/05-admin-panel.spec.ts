import { test, expect } from "@playwright/test";

test.describe("05. Superadmin Panel Workflow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill("#username", "admin");
    await page.fill("#password", "feelgood6969");
    await Promise.all([
      page.waitForURL(/\/admin/, { timeout: 10000 }),
      page.click('button[type="submit"]'),
    ]);
    await expect(page).toHaveURL(/\/admin/);
  });

  test("should navigate across all 4 superadmin tabs seamlessly", async ({ page }) => {
    await expect(page.locator('button:has-text("Manajemen Kelas")').first()).toBeVisible();
    await expect(page.locator("body")).toContainText("XII TKJ 2");

    const teachersTab = page.locator('button:has-text("Akun Wali Kelas")').first();
    await teachersTab.click();
    await expect(page.locator("body")).toContainText("erick");

    const settingsTab = page.locator('button:has-text("Pengaturan Tampilan")').first();
    await settingsTab.click();
    await expect(page.locator("body")).toContainText("Logo Sekolah & Ikon Aplikasi");

    const dbTab = page.locator('button:has-text("Pengaturan Teknis")').first();
    await dbTab.click();

    const dbSubTab = page.locator('button:has-text("Manajemen Basis Data")').first();
    await dbSubTab.click();
    await expect(page.locator("body")).toContainText("Status Database Aplikasi Saat Ini");
  });

  test("should toggle between Dark Mode and Light Mode and persist in localStorage", async ({ page }) => {
    const themeBtn = page.locator('button[aria-label*="Beralih ke mode"]');
    await expect(themeBtn).toBeVisible();

    const initialIsDark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark")
    );

    await themeBtn.click();
    const afterFirstToggle = await page.evaluate(() =>
      document.documentElement.classList.contains("dark")
    );
    expect(afterFirstToggle).toBe(!initialIsDark);

    const storedTheme = await page.evaluate(() => localStorage.getItem("surat_theme"));
    expect(storedTheme).toBe(afterFirstToggle ? "dark" : "light");

    await page.reload();
    const afterReload = await page.evaluate(() =>
      document.documentElement.classList.contains("dark")
    );
    expect(afterReload).toBe(afterFirstToggle);

    await themeBtn.click();
    const backToOriginal = await page.evaluate(() =>
      document.documentElement.classList.contains("dark")
    );
    expect(backToOriginal).toBe(initialIsDark);
  });
});
