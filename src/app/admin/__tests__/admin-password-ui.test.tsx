// @vitest-environment happy-dom
import React from "react";
(globalThis as any).React = React;
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AdminClient } from "../admin-client";
import * as adminActions from "@/actions/admin";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock server actions
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
  getCurrentDatabaseInfoAction: vi.fn().mockResolvedValue({ success: true, isConnected: true }),
  testDatabaseConnectionAction: vi.fn().mockResolvedValue({ success: true }),
  migrateDatabaseAction: vi.fn().mockResolvedValue({ success: true }),
  applyActiveDatabaseAction: vi.fn().mockResolvedValue({ success: true }),
  migrateAndApplyDatabaseAction: vi.fn().mockResolvedValue({ success: true }),
  revertToLocalDatabaseAction: vi.fn().mockResolvedValue({ success: true }),
}));

describe("Admin Password UI in Settings Tab", () => {
  const initialSettings = {
    id: 1,
    appName: "Sistem Presensi SMK Test",
    logoUrl: null,
    themeColor: "terracotta" as const,
    bgTheme: "warm-zinc" as const,
    footerText: "Footer Test",
    aiEnabled: false,
    aiRouterUrl: "http://127.0.0.1:20128/v1",
    aiRouterApiKey: "",
    aiRouterModel: "gemini/gemini-3.8-flash",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderAndOpenSettingsTab = async () => {
    render(
      <AdminClient
        initialClasses={[]}
        initialTeachers={[]}
        initialSettings={initialSettings}
        superadminName="Superadmin Test"
      />
    );

    // Switch to tab "Pengaturan Tampilan"
    const settingsTabBtn = screen.getAllByRole("button", { name: /Pengaturan Tampilan/i })[0];
    await act(async () => {
      fireEvent.click(settingsTabBtn);
    });
  };

  it("should render Keamanan Akun Admin section in settings tab", async () => {
    await renderAndOpenSettingsTab();

    expect(screen.getByText("Keamanan Akun Admin")).toBeDefined();
    expect(screen.getByLabelText("Kata Sandi Baru")).toBeDefined();
    expect(screen.getByLabelText("Ketik Ulang Kata Sandi Baru")).toBeDefined();

    const submitBtn = screen.getByRole("button", { name: /Perbarui Kata Sandi/i });
    expect(submitBtn).toBeDefined();
    expect((submitBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("should validate minimum length realtime and show alert", async () => {
    await renderAndOpenSettingsTab();

    const newPassInput = screen.getByLabelText("Kata Sandi Baru");
    await act(async () => {
      fireEvent.change(newPassInput, { target: { value: "123" } });
    });

    expect(screen.getByText(/Minimal 6 karakter \(saat ini 3\/6\)/i)).toBeDefined();

    const submitBtn = screen.getByRole("button", { name: /Perbarui Kata Sandi/i });
    expect((submitBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("should check password matching realtime (mismatch vs match)", async () => {
    await renderAndOpenSettingsTab();

    const newPassInput = screen.getByLabelText("Kata Sandi Baru");
    const confirmPassInput = screen.getByLabelText("Ketik Ulang Kata Sandi Baru");
    const submitBtn = screen.getByRole("button", { name: /Perbarui Kata Sandi/i }) as HTMLButtonElement;

    // Type valid new password
    await act(async () => {
      fireEvent.change(newPassInput, { target: { value: "passwordBaru123" } });
    });

    // Type mismatched confirm password
    await act(async () => {
      fireEvent.change(confirmPassInput, { target: { value: "passwordLain" } });
    });

    expect(screen.getByText("Kata sandi belum cocok")).toBeDefined();
    expect(submitBtn.disabled).toBe(true);

    // Now type exact match
    await act(async () => {
      fireEvent.change(confirmPassInput, { target: { value: "passwordBaru123" } });
    });

    expect(screen.getByText("Kata sandi cocok")).toBeDefined();
    expect(submitBtn.disabled).toBe(false);
  });

  it("should toggle password visibility on eye button click", async () => {
    await renderAndOpenSettingsTab();

    const newPassInput = screen.getByLabelText("Kata Sandi Baru") as HTMLInputElement;
    const toggleNewPassBtn = screen.getByRole("button", { name: "Tampilkan kata sandi baru" });

    expect(newPassInput.type).toBe("password");

    await act(async () => {
      fireEvent.click(toggleNewPassBtn);
    });

    expect(newPassInput.type).toBe("text");
    expect(screen.getByRole("button", { name: "Sembunyikan kata sandi baru" })).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sembunyikan kata sandi baru" }));
    });

    expect(newPassInput.type).toBe("password");
  });

  it("should call updateAdminSelfPasswordAction and trigger success feedback upon form submission", async () => {
    (adminActions.updateAdminSelfPasswordAction as any).mockResolvedValue({
      success: true,
      message: "Kata sandi admin berhasil diperbarui.",
      redirectUrl: "/login",
    });

    await renderAndOpenSettingsTab();

    const newPassInput = screen.getByLabelText("Kata Sandi Baru");
    const confirmPassInput = screen.getByLabelText("Ketik Ulang Kata Sandi Baru");
    const submitBtn = screen.getByRole("button", { name: /Perbarui Kata Sandi/i }) as HTMLButtonElement;

    await act(async () => {
      fireEvent.change(newPassInput, { target: { value: "AdminBaru#2026" } });
      fireEvent.change(confirmPassInput, { target: { value: "AdminBaru#2026" } });
    });

    expect(submitBtn.disabled).toBe(false);

    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(adminActions.updateAdminSelfPasswordAction).toHaveBeenCalledWith({
      newPassword: "AdminBaru#2026",
      confirmPassword: "AdminBaru#2026",
    });

    expect(
      await screen.findByText(/Kata sandi admin berhasil diperbarui\. Mengalihkan ke halaman login\.\.\./i)
    ).toBeDefined();
  });
});
