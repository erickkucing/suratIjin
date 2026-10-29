import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  THEME_PRESETS,
  getSystemSettings,
  ThemeColor,
  invalidateSystemSettingsCache,
} from "../system-settings";
import { db } from "@/db";
import { systemSettings, classes, users } from "@/db/schema";
import { eq } from "drizzle-orm";

describe("System Settings & 5 Curated Themes", () => {
  beforeEach(() => {
    invalidateSystemSettingsCache();
  });
  beforeAll(async () => {
    await db
      .insert(systemSettings)
      .values({
        id: 1,
        appName: "Sistem Surat Izin Siswa",
        themeColor: "terracotta",
        bgTheme: "warm-zinc",
        aiEnabled: false,
      })
      .onDuplicateKeyUpdate({
        set: {
          themeColor: "terracotta",
          logoUrl: null,
        },
      });
  });
  it("should provide exactly 5 curated color themes with complete palette tokens", () => {
    expect(THEME_PRESETS.length).toBe(5);

    const themeIds = THEME_PRESETS.map((t) => t.id);
    expect(themeIds).toContain("terracotta");
    expect(themeIds).toContain("emerald");
    expect(themeIds).toContain("ocean");
    expect(themeIds).toContain("indigo");
    expect(themeIds).toContain("burgundy");

    for (const preset of THEME_PRESETS) {
      expect(preset.name).toBeTruthy();
      expect(preset.description).toBeTruthy();
      expect(preset.primaryLightHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(preset.primaryDarkHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(preset.hoverLightHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(preset.accentBgHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("should fetch system settings with fallback to terracotta", async () => {
    const settings = await getSystemSettings();
    expect(settings).toBeDefined();
    expect(["terracotta", "emerald", "ocean", "indigo", "burgundy"]).toContain(settings.themeColor);
  });

  it("should allow updating themeColor in systemSettings table", async () => {
    await db
      .update(systemSettings)
      .set({ themeColor: "emerald" })
      .where(eq(systemSettings.id, 1));
    invalidateSystemSettingsCache();

    let settings = await getSystemSettings();
    expect(settings.themeColor).toBe("emerald");

    // Reset back to terracotta
    await db
      .update(systemSettings)
      .set({ themeColor: "terracotta" })
      .where(eq(systemSettings.id, 1));
    invalidateSystemSettingsCache();

    settings = await getSystemSettings();
    expect(settings.themeColor).toBe("terracotta");
  });

  it("should allow updating logoUrl in systemSettings table", async () => {
    const testLogo = "/api/files/system/test-logo.png";
    await db
      .update(systemSettings)
      .set({ logoUrl: testLogo })
      .where(eq(systemSettings.id, 1));
    invalidateSystemSettingsCache();

    let settings = await getSystemSettings();
    expect(settings.logoUrl).toBe(testLogo);

    // Reset logo
    await db
      .update(systemSettings)
      .set({ logoUrl: null })
      .where(eq(systemSettings.id, 1));
    invalidateSystemSettingsCache();

    settings = await getSystemSettings();
    expect(settings.logoUrl).toBeNull();
  });

  it("should fetch and update footerText in systemSettings table", async () => {
    let settings = await getSystemSettings();
    expect(settings.footerText).toBe("Sistem Surat Izin & Ketidakhadiran Siswa.");

    const customFooter = "SMK Negeri 1 Surabaya - Dibuat untuk kenyamanan bersama.";
    await db
      .update(systemSettings)
      .set({ footerText: customFooter })
      .where(eq(systemSettings.id, 1));
    invalidateSystemSettingsCache();

    settings = await getSystemSettings();
    expect(settings.footerText).toBe(customFooter);

    // Reset back to default
    await db
      .update(systemSettings)
      .set({ footerText: "Sistem Surat Izin & Ketidakhadiran Siswa." })
      .where(eq(systemSettings.id, 1));
    invalidateSystemSettingsCache();
  });

  it("should reuse in-memory cache until invalidated", async () => {
    const first = await getSystemSettings();
    // Directly update DB without invalidation
    await db
      .update(systemSettings)
      .set({ appName: "Direct DB Mutated Name" })
      .where(eq(systemSettings.id, 1));

    // Should still return cached value
    const second = await getSystemSettings();
    expect(second.appName).toBe(first.appName);

    // Now invalidate and verify fresh fetch
    invalidateSystemSettingsCache();
    const third = await getSystemSettings();
    expect(third.appName).toBe("Direct DB Mutated Name");

    // Cleanup
    await db
      .update(systemSettings)
      .set({ appName: "Sistem Surat Izin Siswa" })
      .where(eq(systemSettings.id, 1));
    invalidateSystemSettingsCache();
  });
});
