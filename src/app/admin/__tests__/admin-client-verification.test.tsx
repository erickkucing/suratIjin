// @vitest-environment happy-dom
import React from "react";
(globalThis as any).React = React;
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

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
  updateSystemIdentityAction: vi.fn().mockResolvedValue({
    success: true,
    appName: "Sistem Presensi SMK Baru",
    footerText: "Footer Kustom SMK Baru",
  }),
  updateFooterTextAction: vi.fn().mockResolvedValue({ success: true }),
  updateAiSettingsAction: vi.fn().mockResolvedValue({ success: true }),
  testAiConnectionAction: vi.fn().mockResolvedValue({ success: true, result: { isConnected: true } }),
}));

vi.mock("@/actions/database-admin", () => ({
  getCurrentDatabaseInfoAction: vi.fn().mockResolvedValue({ success: true, isConnected: true }),
  testDatabaseConnectionAction: vi.fn().mockResolvedValue({ success: true }),
  migrateDatabaseAction: vi.fn().mockResolvedValue({ success: true }),
  applyActiveDatabaseAction: vi.fn().mockResolvedValue({ success: true }),
  migrateAndApplyDatabaseAction: vi.fn().mockResolvedValue({ success: true, logs: ["✓ Berhasil"], applied: true }),
  revertToLocalDatabaseAction: vi.fn().mockResolvedValue({ success: true }),
}));

import { AdminClient } from "../admin-client";
import { BG_THEME_PRESETS } from "@/lib/system-settings-constants";

describe("AdminClient Empirical Verification (R1 - R6)", () => {
  const dummyClasses = [
    {
      id: 1,
      name: "X-RPL-1",
      slug: "xrpl1",
      academicYear: "2024/2025",
      periodTitle: "Semester Ganjil",
      isActive: true,
      teacherId: 10,
      teacherName: "Budi Santoso",
      totalStudents: 32,
      totalAbsences: 5,
    },
    {
      id: 2,
      name: "X-TKJ-2",
      slug: "xtkj2",
      academicYear: "2024/2025",
      periodTitle: "Semester Ganjil",
      isActive: true,
      teacherId: null,
      teacherName: null,
      totalStudents: 28,
      totalAbsences: 2,
    },
  ];

  const dummyTeachers = [
    {
      id: 10,
      username: "wali_budi",
      displayName: "Budi Santoso",
      role: "wali_kelas",
      isActive: true,
      assignedClassId: 1,
      assignedClassName: "X-RPL-1",
    },
    {
      id: 20,
      username: "wali_siti",
      displayName: "Siti Rahma",
      role: "wali_kelas",
      isActive: false,
      assignedClassId: null,
      assignedClassName: null,
    },
  ];

  const dummySettings = {
    appName: "Sistem Presensi SMK",
    themeColor: "terracotta" as const,
    bgTheme: "warm-zinc" as const,
    footerText: "Sistem Presensi SMK - Hak Cipta Dilindungi.",
    logoUrl: null,
    aiEnabled: false,
    aiRouterUrl: "http://127.0.0.1:20128/v1",
    aiRouterApiKey: "",
    aiRouterModel: "gemini/gemini-3.8-flash",
  };

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  // ==========================================
  // R1: Top Bar Cleanup & Navigation Icon Button
  // ==========================================
  describe("R1: Top Bar Header & Navigation", () => {
    it("renders 'Superadmin' title without 'Panel' prefix", () => {
      render(
        <AdminClient
          initialClasses={dummyClasses}
          initialTeachers={dummyTeachers}
          initialSettings={dummySettings}
          superadminName="Administrator"
        />
      );

      const headerTitle = screen.getByRole("heading", { level: 1 });
      expect(headerTitle.textContent?.trim()).toBe("Superadmin");
      expect(screen.queryByText(/Panel Superadmin/i)).toBeNull();
      expect(screen.queryByText(/Panel SuperAdmin/i)).toBeNull();
    });

    it("does not render subtitle/metadata below admin header", () => {
      render(
        <AdminClient
          initialClasses={dummyClasses}
          initialTeachers={dummyTeachers}
          initialSettings={dummySettings}
          superadminName="Administrator"
        />
      );

      expect(screen.queryByText(/Admin: Administrator/i)).toBeNull();
      expect(screen.queryByText(/Manajemen Multi-Kelas/i)).toBeNull();
    });

    it("renders 'Buka Dashboard' as an icon-only button with proper accessibility and touch-target", () => {
      render(
        <AdminClient
          initialClasses={dummyClasses}
          initialTeachers={dummyTeachers}
          initialSettings={dummySettings}
          superadminName="Administrator"
        />
      );

      const dashboardBtn = screen.getByRole("link", { name: "Buka Dashboard" });
      expect(dashboardBtn).toBeDefined();
      expect(dashboardBtn.getAttribute("href")).toBe("/dashboard");
      expect(dashboardBtn.getAttribute("title")).toBe("Buka Dashboard");
      expect(dashboardBtn.className).toContain("touch-target");
      expect(dashboardBtn.textContent?.trim()).toBe(""); // Icon only, no visible text label
    });

    it("renders Logout button with proper touch-target and accessibility", () => {
      render(
        <AdminClient
          initialClasses={dummyClasses}
          initialTeachers={dummyTeachers}
          initialSettings={dummySettings}
          superadminName="Administrator"
        />
      );

      const logoutBtn = screen.getByRole("button", { name: "Keluar" });
      expect(logoutBtn).toBeDefined();
      expect(logoutBtn.getAttribute("title")).toBe("Keluar");
      expect(logoutBtn.className).toContain("touch-target");
    });
  });

  // ==========================================
  // R2: Closable Popup Notification Banners
  // ==========================================
  describe("R2: Closable Popup Notification Banners", () => {
    it("renders a closable banner when an alert is triggered (e.g. background theme change)", () => {
      render(
        <AdminClient
          initialClasses={dummyClasses}
          initialTeachers={dummyTeachers}
          initialSettings={dummySettings}
          superadminName="Administrator"
        />
      );

      // Navigate to Settings tab
      const settingsTab = screen.getAllByRole("button", { name: /Pengaturan Tampilan/i })[0];
      fireEvent.click(settingsTab);

      // Click on a background theme button to trigger alertMsg
      const slateBtn = screen.getByText("Clean Slate").closest("button");
      expect(slateBtn).not.toBeNull();
      fireEvent.click(slateBtn!);

      // Verify the banner is rendered with role="alert" and aria-live="polite"
      const alertBanner = screen.getByRole("alert");
      expect(alertBanner).toBeDefined();
      expect(alertBanner.getAttribute("aria-live")).toBe("polite");
      expect(alertBanner.className).toContain("fixed");
      expect(alertBanner.className).toContain("top-20");
      expect(alertBanner.className).toContain("z-[60]");
      expect(alertBanner.textContent).toContain("Clean Slate");

      // Verify close button exists and works
      const closeBtn = screen.getByRole("button", { name: "Tutup notifikasi" });
      expect(closeBtn).toBeDefined();
      expect(closeBtn.className).toContain("touch-target");

      // Click close button -> banner immediately disappears
      fireEvent.click(closeBtn);
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("auto-dismisses the alert banner after 5 seconds", () => {
      render(
        <AdminClient
          initialClasses={dummyClasses}
          initialTeachers={dummyTeachers}
          initialSettings={dummySettings}
          superadminName="Administrator"
        />
      );

      // Navigate to Settings tab and trigger alert
      const settingsTab = screen.getAllByRole("button", { name: /Pengaturan Tampilan/i })[0];
      fireEvent.click(settingsTab);

      const creamBtn = screen.getByText("Subtle Cream").closest("button");
      fireEvent.click(creamBtn!);

      expect(screen.getByRole("alert")).toBeDefined();

      // Fast-forward 4999ms -> still visible
      act(() => {
        vi.advanceTimersByTime(4999);
      });
      expect(screen.getByRole("alert")).toBeDefined();

      // Fast-forward past 5000ms -> dismissed
      act(() => {
        vi.advanceTimersByTime(2);
      });
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });

  // ==========================================
  // R3: Compact Horizontally Scrollable Dashboard Metrics
  // ==========================================
  describe("R3: Dashboard Metric Cards", () => {
    it("renders horizontal scrollable container with no-scrollbar class", () => {
      const { container } = render(
        <AdminClient
          initialClasses={dummyClasses}
          initialTeachers={dummyTeachers}
          initialSettings={dummySettings}
          superadminName="Administrator"
        />
      );

      const statsContainer = container.querySelector(".overflow-x-auto.no-scrollbar");
      expect(statsContainer).not.toBeNull();
      expect(statsContainer?.className).toContain("snap-x");
      expect(statsContainer?.className).toContain("snap-mandatory");
      expect(statsContainer?.className).toContain("sm:grid");
    });

    it("removes all redundant subtitle texts under numbers", () => {
      render(
        <AdminClient
          initialClasses={dummyClasses}
          initialTeachers={dummyTeachers}
          initialSettings={dummySettings}
          superadminName="Administrator"
        />
      );

      expect(screen.queryByText("Kelas terdaftar")).toBeNull();
      expect(screen.queryByText("Guru berwenang")).toBeNull();
      expect(screen.queryByText("Seluruh kelas")).toBeNull();
      expect(screen.queryByText("Arsip tersimpan")).toBeNull();
    });

    it("displays correct aggregated statistics numbers", () => {
      render(
        <AdminClient
          initialClasses={dummyClasses}
          initialTeachers={dummyTeachers}
          initialSettings={dummySettings}
          superadminName="Administrator"
        />
      );

      // Total Kelas = 2, Total Wali Kelas = 2, Total Siswa = 60 (32+28), Total Absen = 7 (5+2)
      expect(screen.getByText("Total Kelas")).toBeDefined();
      expect(screen.getByText("Total Wali Kelas")).toBeDefined();
      expect(screen.getByText("Total Siswa Aktif")).toBeDefined();
      expect(screen.getByText("Total Ketidakhadiran")).toBeDefined();
    });
  });

  // ==========================================
  // R4: Clean Semantic Text for Walikelas Table Badges
  // ==========================================
  describe("R4: Walikelas Table Badges", () => {
    it("renders clean text without badge borders for 'Kelas yang Diampu' and 'Status'", () => {
      render(
        <AdminClient
          initialClasses={dummyClasses}
          initialTeachers={dummyTeachers}
          initialSettings={dummySettings}
          superadminName="Administrator"
        />
      );

      // Switch to teachers tab
      const teachersTab = screen.getAllByRole("button", { name: /Akun Wali Kelas/i })[0];
      fireEvent.click(teachersTab);

      // Check assigned class cell
      const assignedClassSpan = screen.getByText("X-RPL-1");
      expect(assignedClassSpan.className).toContain("whitespace-nowrap");
      expect(assignedClassSpan.className).not.toContain("border");
      expect(assignedClassSpan.className).not.toContain("rounded-full");

      // Check unassigned cell
      const unassignedSpan = screen.getByText("Belum ditugaskan");
      expect(unassignedSpan.className).toContain("whitespace-nowrap");
      expect(unassignedSpan.className).not.toContain("border");

      // Check active status cell
      const activeStatusSpan = screen.getByText("Aktif");
      expect(activeStatusSpan.className).toContain("whitespace-nowrap");
      expect(activeStatusSpan.className).toContain("text-[var(--status-success-fg)]");
      expect(activeStatusSpan.className).not.toContain("border");
      expect(activeStatusSpan.className).not.toContain("rounded-full");

      // Check inactive status cell
      const inactiveStatusSpan = screen.getByText("Nonaktif");
      expect(inactiveStatusSpan.className).toContain("whitespace-nowrap");
      expect(inactiveStatusSpan.className).toContain("text-[var(--status-alpa-fg)]");
      expect(inactiveStatusSpan.className).not.toContain("border");
      expect(inactiveStatusSpan.className).not.toContain("rounded-full");
    });
  });

  // ==========================================
  // R5: Responsive Mobile Bottom Navigation
  // ==========================================
  describe("R5: Responsive Mobile Bottom Navigation", () => {
    it("renders fixed bottom navigation bar on mobile with 4 tabs and aria-current", () => {
      render(
        <AdminClient
          initialClasses={dummyClasses}
          initialTeachers={dummyTeachers}
          initialSettings={dummySettings}
          superadminName="Administrator"
        />
      );

      const bottomNav = screen.getByRole("navigation", { name: "Navigasi Bawah Admin" });
      expect(bottomNav).toBeDefined();
      expect(bottomNav.className).toContain("md:hidden");
      expect(bottomNav.className).toContain("fixed");
      expect(bottomNav.className).toContain("bottom-0");

      // Check all 4 mobile tab buttons
      const buttons = bottomNav.querySelectorAll("button");
      expect(buttons.length).toBe(4);

      // Initially activeTab === 'classes'
      expect(buttons[0].getAttribute("aria-current")).toBe("page");
      expect(buttons[0].getAttribute("aria-label")).toBe("Manajemen Kelas");
      expect(buttons[0].className).toContain("touch-target");

      expect(buttons[1].getAttribute("aria-current")).toBeNull();
      expect(buttons[1].getAttribute("aria-label")).toBe("Akun Wali Kelas");

      expect(buttons[2].getAttribute("aria-current")).toBeNull();
      expect(buttons[2].getAttribute("aria-label")).toBe("Pengaturan Tampilan");

      expect(buttons[3].getAttribute("aria-current")).toBeNull();
      expect(buttons[3].getAttribute("aria-label")).toBe("Pengaturan Teknis");

      // Click on mobile bottom nav button for "Pengaturan Teknis"
      fireEvent.click(buttons[3]);
      expect(buttons[3].getAttribute("aria-current")).toBe("page");
      expect(buttons[0].getAttribute("aria-current")).toBeNull();
    });

    it("has pb-24 md:pb-6 clearance on main container to prevent bottom bar collision", () => {
      const { container } = render(
        <AdminClient
          initialClasses={dummyClasses}
          initialTeachers={dummyTeachers}
          initialSettings={dummySettings}
          superadminName="Administrator"
        />
      );

      const mainEl = container.querySelector("main");
      expect(mainEl?.className).toContain("pb-24");
      expect(mainEl?.className).toContain("md:pb-6");
    });
  });

  // ==========================================
  // R6: Admin Navigation & Settings UI/UX Refactor
  // ==========================================
  describe("R6: Admin Navigation & Settings UI/UX Refactor", () => {
    it("renames tab to 'Pengaturan Tampilan' and removes AI-slop badges from theme cards", () => {
      render(
        <AdminClient
          initialClasses={dummyClasses}
          initialTeachers={dummyTeachers}
          initialSettings={dummySettings}
          superadminName="Administrator"
        />
      );

      // Switch to Pengaturan Tampilan
      const settingsTab = screen.getAllByRole("button", { name: /Pengaturan Tampilan/i })[0];
      fireEvent.click(settingsTab);

      // Verify title is "Tema Warna"
      const themeSectionHeading = screen.getByRole("heading", { name: /Tema Warna/i });
      expect(themeSectionHeading).toBeDefined();

      // Verify AI-slop badges ("Akademis", "Institusional", "Modern", "Wibawa") are NOT present
      expect(screen.queryByText("Akademis")).toBeNull();
      expect(screen.queryByText("Institusional")).toBeNull();
      expect(screen.queryByText("Modern")).toBeNull();
      expect(screen.queryByText("Wibawa")).toBeNull();
    });

    it("renders 'Tema Latar Belakang' with 5 curated aesthetic presets and persists selection", () => {
      render(
        <AdminClient
          initialClasses={dummyClasses}
          initialTeachers={dummyTeachers}
          initialSettings={dummySettings}
          superadminName="Administrator"
        />
      );

      // Switch to Pengaturan Tampilan
      const settingsTab = screen.getAllByRole("button", { name: /Pengaturan Tampilan/i })[0];
      fireEvent.click(settingsTab);

      // Verify "Tema Latar Belakang" section heading
      const bgSectionHeading = screen.getByRole("heading", { name: /Tema Latar Belakang/i });
      expect(bgSectionHeading).toBeDefined();

      // Verify all 5 curated presets
      expect(BG_THEME_PRESETS.length).toBe(5);
      BG_THEME_PRESETS.forEach((preset: { id: string; name: string }) => {
        expect(screen.getByText(preset.name)).toBeDefined();
      });

      // Select 'nordic-cool' preset
      const nordicPreset = BG_THEME_PRESETS.find((p: { id: string }) => p.id === "nordic-cool")!;
      const nordicBtn = screen.getByText(nordicPreset.name).closest("button");
      expect(nordicBtn).not.toBeNull();
      fireEvent.click(nordicBtn!);

      // Check global document root synchronization
      expect(document.documentElement.getAttribute("data-bg-theme")).toBe("nordic-cool");
    });

    it("consolidates 9router AI settings into 'Pengaturan Teknis' tab", () => {
      render(
        <AdminClient
          initialClasses={dummyClasses}
          initialTeachers={dummyTeachers}
          initialSettings={dummySettings}
          superadminName="Administrator"
        />
      );

      // In Pengaturan Tampilan, 9Router should NOT be present
      const settingsTab = screen.getAllByRole("button", { name: /Pengaturan Tampilan/i })[0];
      fireEvent.click(settingsTab);
      expect(screen.queryByRole("heading", { name: /Integrasi AI/i })).toBeNull();

      // Switch to Pengaturan Teknis
      const techTab = screen.getAllByRole("button", { name: /Pengaturan Teknis/i })[0];
      fireEvent.click(techTab);

      // Now 9Router should be present alongside database tools
      expect(screen.getByRole("heading", { name: /Integrasi AI/i })).toBeDefined();
      expect(screen.getByRole("switch", { name: /Aktifkan Integrasi 9Router/i })).toBeDefined();
    });

    it("allows editing custom footer text with live preview in Pengaturan Tampilan", () => {
      render(
        <AdminClient
          initialClasses={dummyClasses}
          initialTeachers={dummyTeachers}
          initialSettings={dummySettings}
          superadminName="Administrator"
        />
      );

      // Switch to Pengaturan Tampilan
      const settingsTab = screen.getAllByRole("button", { name: /Pengaturan Tampilan/i })[0];
      fireEvent.click(settingsTab);

      // Verify section heading
      expect(screen.getByRole("heading", { name: /Identitas Sistem & Teks Footer/i })).toBeDefined();

      // Verify inputs
      const appNameInput = screen.getByLabelText(/Nama Sekolah \/ Sistem/i) as HTMLInputElement;
      const footerInput = screen.getByLabelText(/Teks Footer & Catatan Hak Cipta/i) as HTMLInputElement;
      expect(appNameInput.value).toBe("Sistem Presensi SMK");
      expect(footerInput.value).toBe("Sistem Presensi SMK - Hak Cipta Dilindungi.");

      // Verify Live Preview & AppFooter display initial text with year
      const currentYear = new Date().getFullYear();
      const initialMatches = screen.getAllByText(new RegExp(`© ${currentYear} Sistem Presensi SMK - Hak Cipta Dilindungi.`));
      expect(initialMatches.length).toBeGreaterThanOrEqual(1);

      // Change footer text
      fireEvent.change(footerInput, {
        target: { value: "SMK Negeri 1 Surabaya Official" },
      });

      // Verify Live Preview updates dynamically
      const previewMatches = screen.getAllByText(new RegExp(`© ${currentYear} SMK Negeri 1 Surabaya Official`));
      expect(previewMatches.length).toBeGreaterThanOrEqual(1);

      // Submit the form
      const submitBtn = screen.getByRole("button", { name: /Simpan Perubahan Identitas/i });
      fireEvent.click(submitBtn);

      // Verify footer component is NOT rendered on admin page (restricted to login page only)
      expect(screen.queryByRole("contentinfo")).toBeNull();
    });

    it("renders mobile FAB button for classes and teachers and organizes Pengaturan Teknis into distinct sections", () => {
      render(
        <AdminClient
          initialClasses={dummyClasses}
          initialTeachers={dummyTeachers}
          initialSettings={dummySettings}
          superadminName="Administrator"
        />
      );

      // Verify FAB button exists for Classes
      const classFabs = screen.getAllByRole("button", { name: /Buat Kelas Baru/i });
      expect(classFabs.length).toBeGreaterThanOrEqual(1);

      // Switch to Teachers tab
      const teachersTab = screen.getAllByRole("button", { name: /Akun Wali Kelas/i })[0];
      fireEvent.click(teachersTab);

      // Verify FAB button exists for Teachers
      const teacherFabs = screen.getAllByRole("button", { name: /Tambah Wali Kelas/i });
      expect(teacherFabs.length).toBeGreaterThanOrEqual(1);

      // Switch to Pengaturan Teknis
      const techTab = screen.getAllByRole("button", { name: /Pengaturan Teknis/i })[0];
      fireEvent.click(techTab);

      // Verify AI sub-tab is active initially
      expect(screen.getByRole("heading", { name: /Integrasi AI/i })).toBeDefined();

      // Switch to Basis Data sub-tab and verify its card heading
      const dbSubTab = screen.getByRole("tab", { name: /Manajemen Basis Data/i });
      fireEvent.click(dbSubTab);
      expect(screen.getByRole("heading", { name: /Status Database Aplikasi Saat Ini/i })).toBeDefined();

      // Verify FAB is not rendered on technical settings tab
      expect(screen.queryByTitle(/Buat Kelas Baru/i)).toBeNull();
      expect(screen.queryByTitle(/Tambah Wali Kelas/i)).toBeNull();
    });
  });

  // ==========================================
  // Adversarial Challenges & Edge Case Stress Testing
  // ==========================================
  describe("Adversarial Challenges & Edge Cases", () => {
    it("handles empty classes and teachers gracefully without throwing", () => {
      expect(() => {
        render(
          <AdminClient
            initialClasses={[]}
            initialTeachers={[]}
            initialSettings={dummySettings}
            superadminName="Administrator"
          />
        );
      }).not.toThrow();

      // Stats should show 0
      const zeroes = screen.getAllByText("0");
      expect(zeroes.length).toBeGreaterThanOrEqual(2);
    });

    it("handles null/undefined initialSettings with safe fallbacks", () => {
      expect(() => {
        render(
          <AdminClient
            initialClasses={dummyClasses}
            initialTeachers={dummyTeachers}
            initialSettings={null as any}
            superadminName="Administrator"
          />
        );
      }).not.toThrow();

      // Switch to settings tab to view app name input
      const settingsTab = screen.getAllByRole("button", { name: /Pengaturan Tampilan/i })[0];
      act(() => {
        fireEvent.click(settingsTab);
      });

      // Fallback app name
      const appNameInput = screen.getByPlaceholderText(/Contoh: Sistem Presensi/i) as HTMLInputElement;
      expect(appNameInput.value).toBe("Sistem Surat Izin Siswa");
    });

    it("survives localStorage SecurityError (private browsing mode)", () => {
      const mockStorage = {
        getItem: vi.fn().mockImplementation(() => {
          throw new DOMException("Access denied", "SecurityError");
        }),
        setItem: vi.fn().mockImplementation(() => {
          throw new DOMException("Access denied", "SecurityError");
        }),
      };
      vi.stubGlobal("localStorage", mockStorage);

      expect(() => {
        render(
          <AdminClient
            initialClasses={dummyClasses}
            initialTeachers={dummyTeachers}
            initialSettings={dummySettings}
            superadminName="Administrator"
          />
        );
      }).not.toThrow();

      // Switch to Pengaturan Tampilan and change theme
      const settingsTab = screen.getAllByRole("button", { name: /Pengaturan Tampilan/i })[0];
      act(() => {
        fireEvent.click(settingsTab);
      });

      const slateBtn = screen.getByText("Clean Slate").closest("button");
      expect(() => {
        act(() => {
          fireEvent.click(slateBtn!);
        });
      }).not.toThrow();

      vi.unstubAllGlobals();
    });

    it("synchronizes mobile section title dynamically across all 4 tabs", () => {
      const { container } = render(
        <AdminClient
          initialClasses={dummyClasses}
          initialTeachers={dummyTeachers}
          initialSettings={dummySettings}
          superadminName="Administrator"
        />
      );

      const bottomNav = screen.getByRole("navigation", { name: "Navigasi Bawah Admin" });
      const [btnClasses, btnTeachers, btnSettings, btnDatabase] = bottomNav.querySelectorAll("button");
      const mobileHeading = container.querySelector("h2.md\\:hidden");

      // Initial tab: classes
      expect(mobileHeading?.textContent).toBe(`Manajemen Kelas (${dummyClasses.length})`);

      // Switch to teachers
      act(() => {
        fireEvent.click(btnTeachers);
      });
      expect(mobileHeading?.textContent).toBe(`Akun Wali Kelas (${dummyTeachers.length})`);

      // Switch to settings
      act(() => {
        fireEvent.click(btnSettings);
      });
      expect(mobileHeading?.textContent).toBe("Pengaturan Tampilan");

      // Switch to database
      act(() => {
        fireEvent.click(btnDatabase);
      });
      expect(mobileHeading?.textContent).toBe("Pengaturan Teknis");
    });

    it("verifies all 5 background themes apply correct CSS custom properties to document root", () => {
      render(
        <AdminClient
          initialClasses={dummyClasses}
          initialTeachers={dummyTeachers}
          initialSettings={dummySettings}
          superadminName="Administrator"
        />
      );

      const settingsTab = screen.getAllByRole("button", { name: /Pengaturan Tampilan/i })[0];
      act(() => {
        fireEvent.click(settingsTab);
      });

      BG_THEME_PRESETS.forEach((preset: { id: string; name: string }) => {
        const btn = screen.getByText(preset.name).closest("button");
        act(() => {
          fireEvent.click(btn!);
        });
        expect(document.documentElement.getAttribute("data-bg-theme")).toBe(preset.id);
      });
    });

    it("renders anti-slop remote database components and supports copying Connection URI", async () => {
      const mockDbInfo = {
        success: true,
        data: {
          isConnected: true,
          isLocal: false,
          host: "192.168.47.20",
          port: 3306,
          database: "suratizin-prod",
          user: "erick",
          currentUri: "mysql://erick:****@192.168.47.20:3306/suratizin-prod",
        },
      };

      const { getCurrentDatabaseInfoAction } = await import("@/actions/database-admin");
      vi.mocked(getCurrentDatabaseInfoAction).mockResolvedValue(mockDbInfo as any);

      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: writeTextMock,
        },
        configurable: true,
        writable: true,
      });

      render(
        <AdminClient
          initialClasses={dummyClasses}
          initialTeachers={dummyTeachers}
          initialSettings={dummySettings}
          superadminName="Administrator"
        />
      );

      const techTab = screen.getAllByRole("button", { name: /Pengaturan Teknis/i })[0];
      act(() => {
        fireEvent.click(techTab);
      });

      const dbSubTab = screen.getByRole("tab", { name: /Manajemen Basis Data/i });
      await act(async () => {
        fireEvent.click(dbSubTab);
      });

      expect(screen.getByText("Connection URI Aktif")).toBeDefined();
      expect(screen.getByText("Disensor")).toBeDefined();
      expect(screen.getByText("mysql://erick:****@192.168.47.20:3306/suratizin-prod")).toBeDefined();

      const copyBtn = screen.getByRole("button", { name: /Salin URI/i });
      expect(copyBtn).toBeDefined();

      await act(async () => {
        fireEvent.click(copyBtn);
      });

      expect(writeTextMock).toHaveBeenCalledWith("mysql://erick:****@192.168.47.20:3306/suratizin-prod");
      expect(screen.getByText("Tersalin!")).toBeDefined();

      expect(screen.getByText("Koneksi Database Remote Aktif")).toBeDefined();
      expect(
        screen.getByText("Sistem terhubung ke database eksternal. Anda dapat beralih kembali ke basis data lokal kapan saja.")
      ).toBeDefined();

      const revertBtn = screen.getByRole("button", { name: /Kembalikan ke Database Lokal/i });
      expect(revertBtn).toBeDefined();

      const banner = revertBtn.closest("div[class*='rounded-xl']");
      expect(banner?.className).not.toContain("purple");
      expect(revertBtn.className).not.toContain("purple");
    });
  });
});

