import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  updateAiSettingsAction,
  testAiConnectionAction,
  updateSystemIdentityAction,
  updateFooterTextAction,
} from "../system-settings";
import { db } from "@/db";
import { users, systemSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import * as authModule from "@/lib/auth";

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
});
