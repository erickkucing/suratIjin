import { test, expect } from "@playwright/test";
import { db } from "@/db";
import { classes } from "@/db/schema";
import { eq } from "drizzle-orm";

test.describe("04. Parent Portal Workflow", () => {
  let CLASS_SLUG = "eqf";

  test.beforeAll(async () => {
    const cls = await db.query.classes.findFirst();
    if (cls) {
      CLASS_SLUG = cls.slug;
      if (!cls.parentPasswordHash) {
        await db
          .update(classes)
          .set({ parentPasswordHash: "$2b$10$UbE2l7RTO8tui0wEFfUhkOggyVqCm1WsrJ6dvShvKN7s3T98CL4cu" })
          .where(eq(classes.id, cls.id));
      }
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test("should display PIN gate, show error on wrong PIN, and unlock with correct PIN 123456", async ({ page }) => {
    await page.goto(`/portal/${CLASS_SLUG}`);

    await expect(page.locator("h2")).toContainText("Akses Kelas XII TKJ 2");
    await expect(page.locator("text=Login Staf Pengajar")).toHaveCount(0);
    const pinInput = page.locator("#parent-password-input");
    await expect(pinInput).toBeVisible();

    await pinInput.fill("wrong_pin_999");
    await page.click('button[type="submit"]:has-text("Buka Papan Presensi")');

    const errorAlert = page.locator(".bg-red-50, .dark\\:bg-red-950\\/40");
    await expect(errorAlert).toBeVisible({ timeout: 5000 });
    await expect(errorAlert).toContainText(/Kata sandi|salah/i);

    await pinInput.fill("123456");
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/auth/unlock") && r.status() === 200),
      page.click('button[type="submit"]:has-text("Buka Papan Presensi")'),
    ]);

    await expect(page.locator("h1")).toContainText("Kelas XII TKJ 2", { timeout: 10000 });
    await expect(page.locator("body")).toContainText("Wali Kelas");
  });

  test("should search student and verify 100% appreciation board on unlocked portal", async ({ page }) => {
    await page.goto(`/portal/${CLASS_SLUG}`);
    await page.fill("#parent-password-input", "123456");
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/auth/unlock") && r.status() === 200),
      page.click('button[type="submit"]:has-text("Buka Papan Presensi")'),
    ]);
    await expect(page.locator("h1")).toContainText("Kelas XII TKJ 2", { timeout: 10000 });

    const searchInput = page.locator('input[placeholder="Cari nama putra/putri Anda..."]');
    await expect(searchInput).toBeVisible();
    await searchInput.fill("Adrian");
    await page.waitForTimeout(300);

    await expect(page.locator('text=Adrian Manuel Hartono')).toBeVisible();

    await searchInput.fill("");

    const appreciationHeading = page.locator('h3:has-text("Kehadiran 100%")');
    await expect(appreciationHeading).toBeVisible();

    const studentItem = page.locator('section:has(h3:has-text("Kehadiran 100%")) p').first();
    await expect(studentItem).toBeVisible();
  });
});
