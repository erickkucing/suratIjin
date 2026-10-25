import { describe, it, expect } from "vitest";
import { THEME_PRESETS, getSystemSettings, ThemeColor } from "../system-settings";
import { db } from "@/db";
import { systemSettings, classes, users } from "@/db/schema";
import { eq } from "drizzle-orm";

describe("System Settings & 5 Curated Themes", () => {
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

    let settings = await getSystemSettings();
    expect(settings.themeColor).toBe("emerald");

    // Reset back to terracotta
    await db
      .update(systemSettings)
      .set({ themeColor: "terracotta" })
      .where(eq(systemSettings.id, 1));

    settings = await getSystemSettings();
    expect(settings.themeColor).toBe("terracotta");
  });

  it("should allow updating logoUrl in systemSettings table", async () => {
    const testLogo = "/api/files/system/test-logo.png";
    await db
      .update(systemSettings)
      .set({ logoUrl: testLogo })
      .where(eq(systemSettings.id, 1));

    let settings = await getSystemSettings();
    expect(settings.logoUrl).toBe(testLogo);

    // Reset logo
    await db
      .update(systemSettings)
      .set({ logoUrl: null })
      .where(eq(systemSettings.id, 1));

    settings = await getSystemSettings();
    expect(settings.logoUrl).toBeNull();
  });
});
