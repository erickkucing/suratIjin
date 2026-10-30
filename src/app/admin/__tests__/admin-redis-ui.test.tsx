// @vitest-environment happy-dom
import React from "react";
(globalThis as any).React = React;
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AdminClient } from "../admin-client";
import * as redisAdminActions from "@/actions/redis-admin";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/actions/auth", () => ({
  logoutAction: vi.fn(),
}));

vi.mock("@/actions/admin", () => ({
  createTeacherAction: vi.fn(),
  updateTeacherAction: vi.fn(),
  createClassAction: vi.fn(),
  updateClassAction: vi.fn(),
  updateAdminSelfPasswordAction: vi.fn(),
}));

vi.mock("@/actions/system-settings", () => ({
  updateThemeAction: vi.fn().mockResolvedValue({ success: true }),
  updateBgThemeAction: vi.fn().mockResolvedValue({ success: true }),
  uploadLogoAction: vi.fn().mockResolvedValue({ success: true }),
  removeLogoAction: vi.fn().mockResolvedValue({ success: true }),
  updateAppNameAction: vi.fn().mockResolvedValue({ success: true }),
  updateSystemIdentityAction: vi.fn().mockResolvedValue({ success: true }),
  updateFooterTextAction: vi.fn().mockResolvedValue({ success: true }),
  updateAiSettingsAction: vi.fn().mockResolvedValue({ success: true }),
  testAiConnectionAction: vi.fn().mockResolvedValue({ success: true, result: { isConnected: true } }),
}));

vi.mock("@/actions/database-admin", () => ({
  getCurrentDatabaseInfoAction: vi.fn().mockResolvedValue({
    success: true,
    data: {
      currentUri: "mysql://surat_user:****@127.0.0.1:3306/db_suratizin",
      host: "127.0.0.1",
      port: 3306,
      database: "db_suratizin",
      user: "surat_user",
      isLocal: true,
      isConnected: true,
      latencyMs: 1,
      serverVersion: "10.11.8-MariaDB",
    },
  }),
  testDatabaseConnectionAction: vi.fn().mockResolvedValue({ success: true }),
  migrateDatabaseAction: vi.fn().mockResolvedValue({ success: true }),
  applyActiveDatabaseAction: vi.fn().mockResolvedValue({ success: true }),
  migrateAndApplyDatabaseAction: vi.fn().mockResolvedValue({ success: true }),
  revertToLocalDatabaseAction: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/actions/redis-admin", () => ({
  testRedisConnectionAction: vi.fn().mockResolvedValue({ success: true, connected: true, latencyMs: 2 }),
  updateRedisSettingsAction: vi.fn().mockResolvedValue({ success: true }),
  getRedisStatusAction: vi.fn().mockResolvedValue({ success: true, connected: true }),
}));

describe("Redis Cache Server UI in Database Subtab", () => {
  const baseSettings = {
    appName: "Sistem Presensi SMK Test",
    logoUrl: null,
    themeColor: "terracotta" as const,
    bgTheme: "warm-zinc" as const,
    footerText: "Footer Test",
    aiEnabled: false,
    aiRouterUrl: "http://127.0.0.1:20128/v1",
    aiRouterApiKey: "",
    aiRouterModel: "gemini/gemini-3.8-flash",
    redisEnabled: false,
    redisUrl: "redis://127.0.0.1:6379",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: true, connected: true, latencyMs: 3 }),
    } as any);
  });

  const navigateToDatabaseSubtab = () => {
    const techButtons = screen.getAllByRole("button", { name: /Pengaturan Teknis/i });
    fireEvent.click(techButtons[0]);

    const dbSubTabBtn = screen.getByRole("tab", { name: /Manajemen Basis Data/i });
    fireEvent.click(dbSubTabBtn);
  };

  it("should render Redis Cache Server section under database subtab", async () => {
    render(
      <AdminClient
        initialClasses={[]}
        initialTeachers={[]}
        initialSettings={baseSettings}
        superadminName="Superadmin"
      />
    );

    navigateToDatabaseSubtab();

    // Verify visual separation banner
    expect(screen.getByText(/Akselerasi & Caching \(Fitur Opsional\)/i)).toBeTruthy();

    // Verify Card 4 Title
    expect(screen.getByRole("heading", { name: /Redis Cache Server/i })).toBeTruthy();

    // Verify URL input exists with default value
    const urlInput = screen.getByLabelText(/URL Koneksi Redis/i) as HTMLInputElement;
    expect(urlInput).toBeTruthy();
    expect(urlInput.value).toBe("redis://127.0.0.1:6379");

    // Verify action buttons exist
    expect(screen.getByRole("button", { name: /^Uji Koneksi$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Simpan Pengaturan/i })).toBeTruthy();
  });

  it("should call testRedisConnectionAction when Uji Koneksi button is clicked", async () => {
    render(
      <AdminClient
        initialClasses={[]}
        initialTeachers={[]}
        initialSettings={baseSettings}
        superadminName="Superadmin"
      />
    );

    navigateToDatabaseSubtab();

    const testBtn = screen.getByRole("button", { name: /^Uji Koneksi$/i });
    await act(async () => {
      fireEvent.click(testBtn);
    });

    expect(redisAdminActions.testRedisConnectionAction).toHaveBeenCalledWith("redis://127.0.0.1:6379");
    expect(screen.getByText(/Koneksi Berhasil \(2 ms\)/i)).toBeTruthy();
  });

  it("should toggle Redis state and call updateRedisSettingsAction", async () => {
    render(
      <AdminClient
        initialClasses={[]}
        initialTeachers={[]}
        initialSettings={baseSettings}
        superadminName="Superadmin"
      />
    );

    navigateToDatabaseSubtab();

    const toggleBtn = screen.getByRole("switch", { name: /Toggle Redis Cache/i });
    expect(toggleBtn.getAttribute("aria-checked")).toBe("false");

    await act(async () => {
      fireEvent.click(toggleBtn);
    });

    expect(redisAdminActions.updateRedisSettingsAction).toHaveBeenCalledWith({
      redisEnabled: true,
      redisUrl: "redis://127.0.0.1:6379",
    });
  });

  it("should retain active connected status when initialized with redisEnabled = true", async () => {
    render(
      <AdminClient
        initialClasses={[]}
        initialTeachers={[]}
        initialSettings={{
          ...baseSettings,
          redisEnabled: true,
          redisUrl: "redis://10.0.0.5:6379",
        }}
        superadminName="Superadmin"
      />
    );

    navigateToDatabaseSubtab();

    const toggleBtn = screen.getByRole("switch", { name: /Toggle Redis Cache/i });
    expect(toggleBtn.getAttribute("aria-checked")).toBe("true");

    const urlInput = screen.getByLabelText(/URL Koneksi Redis/i) as HTMLInputElement;
    expect(urlInput.value).toBe("redis://10.0.0.5:6379");
  });
});
