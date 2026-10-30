import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  updateAiSettingsAction,
  testAiConnectionAction,
  updateSystemIdentityAction,
  updateFooterTextAction,
  uploadLogoAction,
  removeLogoAction,
} from "../system-settings";
import { db } from "@/db";
import { users, systemSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import * as authModule from "@/lib/auth";
import fs from "fs";
import path from "path";
import sharp from "sharp";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("System Settings AI Actions", () => {
  beforeEach(async () => {
    // Reset AI settings to disabled
    await db
      .update(systemSettings)
      .set({
        aiEnabled: false,
        aiRouterUrl: "http://127.0.0.1:20128/v1",
        aiRouterApiKey: null,
        aiRouterModel: "gemini/gemini-3.8-flash",
      })
      .where(eq(systemSettings.id, 1));
  });

  it("should block non-superadmin from updating AI settings", async () => {
    // Mock user as wali_kelas
    const spy = vi.spyOn(authModule, "getCurrentUser").mockResolvedValue({
      id: 99,
      username: "guru_test",
      displayName: "Guru Test",
      role: "wali_kelas",
    } as any);

    const res = await updateAiSettingsAction({
      aiEnabled: true,
      aiRouterUrl: "http://127.0.0.1:20128/v1",
      aiRouterModel: "gemini/gemini-3.8-flash",
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("Hanya Superadmin");
    spy.mockRestore();
  });

  it("should fail validation on invalid URL", async () => {
    const adminUser = await db.query.users.findFirst({
      where: eq(users.role, "superadmin"),
    });
    if (!adminUser) throw new Error("Superadmin not found");

    const spy = vi.spyOn(authModule, "getCurrentUser").mockResolvedValue({
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      role: "superadmin",
    } as any);

    const res = await updateAiSettingsAction({
      aiEnabled: true,
      aiRouterUrl: "invalid-url-without-protocol",
      aiRouterModel: "gemini/gemini-3.8-flash",
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("Format URL");
    spy.mockRestore();
  });

  it("should successfully update AI settings for superadmin", async () => {
    const adminUser = await db.query.users.findFirst({
      where: eq(users.role, "superadmin"),
    });
    if (!adminUser) throw new Error("Superadmin not found");

    const spy = vi.spyOn(authModule, "getCurrentUser").mockResolvedValue({
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      role: "superadmin",
    } as any);

    const res = await updateAiSettingsAction({
      aiEnabled: true,
      aiRouterUrl: "http://127.0.0.1:20128/v1",
      aiRouterApiKey: "sk-test-key-123",
      aiRouterModel: "gemini/gemini-3.7-flash",
    });

    expect(res.success).toBe(true);
    expect(res.settings?.aiEnabled).toBe(true);
    expect(res.settings?.aiRouterModel).toBe("gemini/gemini-3.7-flash");

    // Check DB record
    const updated = await db.query.systemSettings.findFirst({
      where: eq(systemSettings.id, 1),
    });
    expect(updated?.aiEnabled).toBe(true);
    expect(updated?.aiRouterApiKey).toBe("sk-test-key-123");
    expect(updated?.aiRouterModel).toBe("gemini/gemini-3.7-flash");

    spy.mockRestore();
  });

  it("should block non-superadmin from testing AI connection", async () => {
    const spy = vi.spyOn(authModule, "getCurrentUser").mockResolvedValue(null);

    const res = await testAiConnectionAction();
    expect(res.success).toBe(false);
    expect(res.error).toContain("Hanya Superadmin");

    spy.mockRestore();
  });
});

describe("System Identity & Footer Actions", () => {
  it("should block non-superadmin from updating identity or footer", async () => {
    const spy = vi.spyOn(authModule, "getCurrentUser").mockResolvedValue({
      id: 88,
      username: "wali_kelas_1",
      role: "wali_kelas",
    } as any);

    const res = await updateSystemIdentityAction({
      appName: "SMK Test",
      footerText: "Footer Test",
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain("Hanya Superadmin");

    const resFooter = await updateFooterTextAction("Footer Only Test");
    expect(resFooter.success).toBe(false);
    expect(resFooter.error).toContain("Hanya Superadmin");

    spy.mockRestore();
  });

  it("should successfully update appName and custom footerText for superadmin", async () => {
    const adminUser = await db.query.users.findFirst({
      where: eq(users.role, "superadmin"),
    });
    if (!adminUser) throw new Error("Superadmin not found");

    const spy = vi.spyOn(authModule, "getCurrentUser").mockResolvedValue({
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      role: "superadmin",
    } as any);

    const res = await updateSystemIdentityAction({
      appName: "SMK Negeri 1 Surabaya",
      footerText: "SMK Negeri 1 Surabaya - Dibuat untuk kenyamanan guru dan orang tua.",
    });

    expect(res.success).toBe(true);
    expect(res.appName).toBe("SMK Negeri 1 Surabaya");
    expect(res.footerText).toBe("SMK Negeri 1 Surabaya - Dibuat untuk kenyamanan guru dan orang tua.");

    // Verify DB
    const row = await db.query.systemSettings.findFirst({
      where: eq(systemSettings.id, 1),
    });
    expect(row?.appName).toBe("SMK Negeri 1 Surabaya");
    expect(row?.footerText).toBe("SMK Negeri 1 Surabaya - Dibuat untuk kenyamanan guru dan orang tua.");

    spy.mockRestore();
  });

  it("should use default fallback when footerText is empty string", async () => {
    const adminUser = await db.query.users.findFirst({
      where: eq(users.role, "superadmin"),
    });
    if (!adminUser) throw new Error("Superadmin not found");

    const spy = vi.spyOn(authModule, "getCurrentUser").mockResolvedValue({
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      role: "superadmin",
    } as any);

    const res = await updateSystemIdentityAction({
      appName: "Sistem Surat Izin Siswa",
      footerText: "   ",
    });

    expect(res.success).toBe(true);
    expect(res.footerText).toBe("Sistem Surat Izin & Ketidakhadiran Siswa.");

    spy.mockRestore();
  });

  it("should generate PWA icons (192, 512, apple-icon) on uploadLogoAction and clean up on removeLogoAction", async () => {
    const adminUser = await db.query.users.findFirst({
      where: eq(users.role, "superadmin"),
    });
    if (!adminUser) throw new Error("Superadmin not found");

    const spy = vi.spyOn(authModule, "getCurrentUser").mockResolvedValue({
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      role: "superadmin",
    } as any);

    // Create a 100x100 dummy PNG buffer
    const testPngBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 181, g: 72, b: 38, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const file = new File([new Uint8Array(testPngBuffer)], "test-logo.png", { type: "image/png" });
    const formData = new FormData();
    formData.append("logo", file);

    const uploadRes = await uploadLogoAction(formData);
    expect(uploadRes.success).toBe(true);
    expect(uploadRes.logoUrl).toBeDefined();

    const storageBase = process.env.STORAGE_PATH || "./storage/uploads";
    const systemDir = path.resolve(storageBase, "system");

    const match = uploadRes.logoUrl?.match(/logo-(\d+)\.png$/);
    expect(match).not.toBeNull();
    const ts = match![1];

    const logoPath = path.resolve(systemDir, `logo-${ts}.png`);
    const icon192Path = path.resolve(systemDir, `icon-192-${ts}.png`);
    const icon512Path = path.resolve(systemDir, `icon-512-${ts}.png`);
    const iconMaskablePath = path.resolve(systemDir, `icon-maskable-512-${ts}.png`);
    const appleIconPath = path.resolve(systemDir, `apple-icon-${ts}.png`);

    expect(fs.existsSync(logoPath)).toBe(true);
    expect(fs.existsSync(icon192Path)).toBe(true);
    expect(fs.existsSync(icon512Path)).toBe(true);
    expect(fs.existsSync(iconMaskablePath)).toBe(true);
    expect(fs.existsSync(appleIconPath)).toBe(true);

    // Verify dimensions of generated icons
    const icon192Meta = await sharp(icon192Path).metadata();
    expect(icon192Meta.width).toBe(192);
    expect(icon192Meta.height).toBe(192);

    const icon512Meta = await sharp(icon512Path).metadata();
    expect(icon512Meta.width).toBe(512);
    expect(icon512Meta.height).toBe(512);

    const iconMaskableMeta = await sharp(iconMaskablePath).metadata();
    expect(iconMaskableMeta.width).toBe(512);
    expect(iconMaskableMeta.height).toBe(512);

    const appleIconMeta = await sharp(appleIconPath).metadata();
    expect(appleIconMeta.width).toBe(180);
    expect(appleIconMeta.height).toBe(180);

    // Verify that corner pixel of maskable & apple-icon is solid white (#FFFFFF, alpha = 255)
    const { data: maskableRaw } = await sharp(iconMaskablePath).raw().toBuffer({ resolveWithObject: true });
    expect(maskableRaw[0]).toBe(255); // R
    expect(maskableRaw[1]).toBe(255); // G
    expect(maskableRaw[2]).toBe(255); // B
    expect(maskableRaw[3]).toBe(255); // A (fully opaque)

    const { data: appleRaw } = await sharp(appleIconPath).raw().toBuffer({ resolveWithObject: true });
    expect(appleRaw[0]).toBe(255); // R
    expect(appleRaw[1]).toBe(255); // G
    expect(appleRaw[2]).toBe(255); // B
    expect(appleRaw[3]).toBe(255); // A (fully opaque)

    // Test removeLogoAction
    const removeRes = await removeLogoAction();
    expect(removeRes.success).toBe(true);

    const updatedRow = await db.query.systemSettings.findFirst({
      where: eq(systemSettings.id, 1),
    });
    expect(updatedRow?.logoUrl).toBeNull();

    // Clean up created test files
    [logoPath, icon192Path, icon512Path, iconMaskablePath, appleIconPath].forEach((p) => {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    });

    spy.mockRestore();
  });
});
