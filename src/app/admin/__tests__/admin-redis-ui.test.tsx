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

  it("should render Redis Cache Server section with configurations hidden when disabled", async () => {
    render(
      <AdminClient
        initialClasses={[]}
        initialTeachers={[]}
        initialSettings={baseSettings}
        superadminName="Superadmin"
      />
    );

    navigateToDatabaseSubtab();

    // Verify Card 4 Title (clean, no "Opsional" badge)
    const redisHeading = screen.getByRole("heading", { name: /^Redis Cache Server$/i });
    expect(redisHeading).toBeTruthy();

    // Toggle switch is rendered and off
    const toggleBtn = screen.getByRole("switch", { name: /Toggle Redis Cache/i });
    expect(toggleBtn.getAttribute("aria-checked")).toBe("false");

    // When disabled, configuration fields and action buttons are NOT rendered
    expect(screen.queryByLabelText(/Host \/ Alamat Server Redis/i)).toBeNull();
    expect(screen.queryByLabelText(/Port Redis/i)).toBeNull();
    expect(screen.queryByLabelText(/Password Redis \(Opsional\)/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /^Uji Koneksi$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Simpan Pengaturan/i })).toBeNull();
    expect(screen.queryByTitle(/Periksa status koneksi Redis sekarang/i)).toBeNull();
  });

  it("should reveal configuration fields and status bar when toggle is clicked to enable", async () => {
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

    // Click to enable
    await act(async () => {
      fireEvent.click(toggleBtn);
    });

    expect(toggleBtn.getAttribute("aria-checked")).toBe("true");

    // Fields and buttons must now be visible with default values
    const hostInput = screen.getByLabelText(/Host \/ Alamat Server Redis/i) as HTMLInputElement;
    expect(hostInput).toBeTruthy();
    expect(hostInput.value).toBe("127.0.0.1");

    const portInput = screen.getByLabelText(/Port Redis/i) as HTMLInputElement;
    expect(portInput).toBeTruthy();
    expect(portInput.value).toBe("6379");

    const passInput = screen.getByLabelText(/Password Redis \(Opsional\)/i) as HTMLInputElement;
    expect(passInput).toBeTruthy();
    expect(passInput.value).toBe("");

    expect(screen.getByRole("button", { name: /^Uji Koneksi$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Simpan Pengaturan/i })).toBeTruthy();
    expect(screen.getByTitle(/Periksa status koneksi Redis sekarang/i)).toBeTruthy();
    expect(screen.getAllByText(/Online|Siap Diuji/i).length).toBeGreaterThanOrEqual(1);
  });

  it("should auto-enable toggle and call updateRedisSettingsAction with redisEnabled: true when Simpan Pengaturan is clicked", async () => {
    render(
      <AdminClient
        initialClasses={[]}
        initialTeachers={[]}
        initialSettings={{
          ...baseSettings,
          redisEnabled: true,
        }}
        superadminName="Superadmin"
      />
    );

    navigateToDatabaseSubtab();

    const saveBtn = screen.getByRole("button", { name: /Simpan Pengaturan/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(redisAdminActions.updateRedisSettingsAction).toHaveBeenCalledWith({
      redisEnabled: true,
      redisUrl: "redis://127.0.0.1:6379",
    });
    expect(screen.getByText(/Pengaturan Tersimpan/i)).toBeTruthy();
  });

  it("should call testRedisConnectionAction and auto-save when Uji Koneksi button is clicked", async () => {
    render(
      <AdminClient
        initialClasses={[]}
        initialTeachers={[]}
        initialSettings={{
          ...baseSettings,
          redisEnabled: true,
        }}
        superadminName="Superadmin"
      />
    );

    navigateToDatabaseSubtab();

    const testBtn = screen.getByRole("button", { name: /^Uji Koneksi$/i });
    await act(async () => {
      fireEvent.click(testBtn);
    });

    expect(redisAdminActions.testRedisConnectionAction).toHaveBeenCalledWith("redis://127.0.0.1:6379");
    expect(redisAdminActions.updateRedisSettingsAction).toHaveBeenCalledWith({
      redisEnabled: true,
      redisUrl: "redis://127.0.0.1:6379",
    });
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
          redisUrl: "redis://:secret123@10.0.0.5:6380",
        }}
        superadminName="Superadmin"
      />
    );

    navigateToDatabaseSubtab();

    const toggleBtn = screen.getByRole("switch", { name: /Toggle Redis Cache/i });
    expect(toggleBtn.getAttribute("aria-checked")).toBe("true");

    const hostInput = screen.getByLabelText(/Host \/ Alamat Server Redis/i) as HTMLInputElement;
    expect(hostInput.value).toBe("10.0.0.5");

    const portInput = screen.getByLabelText(/Port Redis/i) as HTMLInputElement;
    expect(portInput.value).toBe("6380");

    const passInput = screen.getByLabelText(/Password Redis \(Opsional\)/i) as HTMLInputElement;
    expect(passInput.value).toBe("secret123");
  });

  it("should toggle password visibility between password and text", async () => {
    render(
      <AdminClient
        initialClasses={[]}
        initialTeachers={[]}
        initialSettings={{
          ...baseSettings,
          redisEnabled: true,
          redisUrl: "redis://:mypassword@127.0.0.1:6379",
        }}
        superadminName="Superadmin"
      />
    );

    navigateToDatabaseSubtab();

    const passInput = screen.getByLabelText(/Password Redis \(Opsional\)/i) as HTMLInputElement;
    expect(passInput.type).toBe("password");

    const togglePassBtn = screen.getByTitle(/Lihat password Redis/i);
    fireEvent.click(togglePassBtn);
    expect(passInput.type).toBe("text");

    const hidePassBtn = screen.getByTitle(/Sembunyikan password Redis/i);
    fireEvent.click(hidePassBtn);
    expect(passInput.type).toBe("password");
  });
});
