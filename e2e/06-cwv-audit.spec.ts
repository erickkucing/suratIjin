import { test, expect } from "@playwright/test";
import { db } from "@/db";
import { systemSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

test.describe("06. Core Web Vitals & Responsiveness Audit", () => {
  let portalPath = "/portal/eqf";
  const routes = [
    { name: "Login Page", path: "/login", auth: null },
    { name: "Parent Portal", path: "/portal/eqf", auth: null },
    { name: "Teacher Dashboard", path: "/dashboard", auth: "erick" },
    { name: "Admin Panel", path: "/admin", auth: "admin" },
  ];

  let initialLogoUrl: string | null = null;
  const TEST_LOGO_URL = "/api/files/system/logo-1792927990937.png";

  test.beforeAll(async () => {
    try {
      const cls = await db.query.classes.findFirst();
      if (cls) {
        portalPath = `/portal/${cls.slug}`;
        const parentRoute = routes.find((r) => r.name === "Parent Portal");
        if (parentRoute) parentRoute.path = portalPath;
      }
      const current = await db.query.systemSettings.findFirst({
        where: eq(systemSettings.id, 1),
      });
      initialLogoUrl = current?.logoUrl ?? null;
      await db
        .update(systemSettings)
        .set({ logoUrl: TEST_LOGO_URL })
        .where(eq(systemSettings.id, 1));
    } catch {
      // Best-effort database setup
    }
  });

  test.afterAll(async () => {
    try {
      await db
        .update(systemSettings)
        .set({ logoUrl: initialLogoUrl })
        .where(eq(systemSettings.id, 1));
    } catch {
      // Best-effort database cleanup
    }
  });

  for (const route of routes) {
    test(`should have zero unhandled console errors on ${route.name}`, async ({ page }) => {
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];

      page.on("console", (msg) => {
        if (msg.type() === "error") {
          consoleErrors.push(msg.text());
        }
      });

      page.on("pageerror", (err) => {
        pageErrors.push(err.message);
      });

      if (route.auth === "erick") {
        await page.goto("/login");
        await page.fill("#username", "erick");
        await page.fill("#password", "feelgood6969");
        await Promise.all([
          page.waitForURL(/\/dashboard/, { timeout: 10000 }),
          page.click('button[type="submit"]'),
        ]);
      } else if (route.auth === "admin") {
        await page.goto("/login");
        await page.fill("#username", "admin");
        await page.fill("#password", "feelgood6969");
        await Promise.all([
          page.waitForURL(/\/admin/, { timeout: 10000 }),
          page.click('button[type="submit"]'),
        ]);
      } else {
        await page.goto(route.path);
      }

      await page.waitForLoadState("networkidle");

      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
    });

    test(`should reflow cleanly without horizontal overflow on mobile 375x667 for ${route.name}`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      if (route.auth === "erick") {
        await page.goto("/login");
        await page.fill("#username", "erick");
        await page.fill("#password", "feelgood6969");
        await Promise.all([
          page.waitForURL(/\/dashboard/, { timeout: 10000 }),
          page.click('button[type="submit"]'),
        ]);
      } else if (route.auth === "admin") {
        await page.goto("/login");
        await page.fill("#username", "admin");
        await page.fill("#password", "feelgood6969");
        await Promise.all([
          page.waitForURL(/\/admin/, { timeout: 10000 }),
          page.click('button[type="submit"]'),
        ]);
      } else {
        await page.goto(route.path);
      }

      await page.waitForLoadState("networkidle");

      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      expect(hasHorizontalOverflow).toBe(false);
    });
  }

  test("should verify school logos and QR code images define explicit dimensions and high fetch priority", async ({ page }) => {
    // 1. Login Page
    await page.goto("/login");
    const loginHeaderLogo = page.locator('header img[alt="Logo Sekolah"]');
    await expect(loginHeaderLogo).toBeVisible();
    await expect(loginHeaderLogo).toHaveAttribute("width", "40");
    await expect(loginHeaderLogo).toHaveAttribute("height", "40");
    await expect(loginHeaderLogo).toHaveAttribute("fetchpriority", "high");

    const loginCardLogo = page.locator('main img[alt="Logo Sekolah"]');
    await expect(loginCardLogo).toBeVisible();
    await expect(loginCardLogo).toHaveAttribute("width", "64");
    await expect(loginCardLogo).toHaveAttribute("height", "64");
    await expect(loginCardLogo).toHaveAttribute("fetchpriority", "high");

    await page.context().clearCookies();
    await page.goto(portalPath);
    const portalLockLogo = page.locator('header img[alt="Logo Sekolah"]');
    await expect(portalLockLogo).toBeVisible();
    await expect(portalLockLogo).toHaveAttribute("width", "40");
    await expect(portalLockLogo).toHaveAttribute("height", "40");
    await expect(portalLockLogo).toHaveAttribute("fetchpriority", "high");

    await page.fill("#parent-password-input", "123456");
    await page.click('button[type="submit"]:has-text("Buka Papan Presensi")');
    const portalUnlockedLogo = page.locator('header img[alt="Logo Sekolah"]');
    await expect(portalUnlockedLogo).toBeVisible();
    await expect(portalUnlockedLogo).toHaveAttribute("width", "40");
    await expect(portalUnlockedLogo).toHaveAttribute("height", "40");
    await expect(portalUnlockedLogo).toHaveAttribute("fetchpriority", "high");

    await page.goto("/login");
    await page.fill("#username", "erick");
    await page.fill("#password", "feelgood6969");
    await Promise.all([
      page.waitForURL(/\/dashboard/, { timeout: 10000 }),
      page.click('button[type="submit"]'),
    ]);

    const dashboardLogo = page.locator('header img[alt="Logo Sekolah"]');
    await expect(dashboardLogo).toBeVisible();
    await expect(dashboardLogo).toHaveAttribute("width", "40");
    await expect(dashboardLogo).toHaveAttribute("height", "40");
    await expect(dashboardLogo).toHaveAttribute("fetchpriority", "high");

    const portalSettingsBtn = page.locator('button:has-text("Pengaturan Kelas & Portal")');
    await portalSettingsBtn.click();
    const qrImage = page.locator('img[alt="QR Code Portal Wali Murid"]');
    await expect(qrImage).toBeVisible();
    await expect(qrImage).toHaveAttribute("width", "112");
    await expect(qrImage).toHaveAttribute("height", "112");
    const closeSettingsBtn = page.locator('button[aria-label="Tutup dialog"]');
    await closeSettingsBtn.click();

    await page.goto("/login");
    await page.fill("#username", "admin");
    await page.fill("#password", "feelgood6969");
    await Promise.all([
      page.waitForURL(/\/admin/, { timeout: 10000 }),
      page.click('button[type="submit"]'),
    ]);

    const adminLogo = page.locator('header img[alt="Logo Sekolah"]');
    await expect(adminLogo).toBeVisible();
    await expect(adminLogo).toHaveAttribute("width", "40");
    await expect(adminLogo).toHaveAttribute("height", "40");
    await expect(adminLogo).toHaveAttribute("fetchpriority", "high");
  });
});
