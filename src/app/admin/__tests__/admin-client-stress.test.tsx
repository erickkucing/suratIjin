// @vitest-environment happy-dom
import * as React from "react";
(globalThis as any).React = React;

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AdminClient } from "../admin-client";
import { BG_THEME_PRESETS } from "@/lib/system-settings-constants";

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

// Mock theme-toggle
vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => <button data-testid="theme-toggle">ThemeToggle</button>,
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
  uploadLogoAction: vi.fn(),
  removeLogoAction: vi.fn(),
  updateAppNameAction: vi.fn(),
  updateAiSettingsAction: vi.fn(),
  testAiConnectionAction: vi.fn(),
}));

vi.mock("@/actions/database-admin", () => ({
  getCurrentDatabaseInfoAction: vi.fn().mockResolvedValue({ success: true, data: null }),
  testDatabaseConnectionAction: vi.fn(),
  migrateDatabaseAction: vi.fn(),
  applyActiveDatabaseAction: vi.fn(),
  migrateAndApplyDatabaseAction: vi.fn().mockResolvedValue({ success: true, logs: ["✓ Berhasil"], applied: true }),
  revertToLocalDatabaseAction: vi.fn(),
}));

const mockClasses = [
  {
    id: 1,
    name: "Kelas 7A",
    slug: "k7a",
    academicYear: "2026/2027",
    periodTitle: "Semester Ganjil",
    waliKelasId: 10,
    waliKelasName: "Budi Santoso, S.Pd",
    totalStudents: 32,
    totalAbsences: 5,
    isActive: true,
  },
  {
    id: 2,
    name: "Kelas 7B",
    slug: "k7b",
    academicYear: "2026/2027",
    periodTitle: "Semester Ganjil",
    waliKelasId: null,
    waliKelasName: null,
    totalStudents: 30,
    totalAbsences: 0,
    isActive: true,
  },
];

const mockTeachers = [
  {
    id: 10,
    displayName: "Budi Santoso, S.Pd",
    username: "budis",
    assignedClassId: 1,
    assignedClassName: "Kelas 7A",
    role: "wali_kelas",
    isActive: true,
  },
  {
    id: 11,
    displayName: "Siti Rahma, M.Pd",
    username: "sitir",
    assignedClassId: null,
    assignedClassName: null,
    role: "wali_kelas",
    isActive: false,
  },
];

const mockSettings = {
  appName: "Sistem Surat Izin Siswa",
  themeColor: "terracotta" as const,
  bgTheme: "warm-zinc" as const,
  footerText: "Sistem Surat Izin & Ketidakhadiran Siswa.",
  logoUrl: null,
  aiEnabled: false,
  aiRouterUrl: "http://127.0.0.1:20128/v1",
  aiRouterApiKey: "",
  aiRouterModel: "gemini/gemini-3.8-flash",
};

describe("Adversarial Stress Test: AdminClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("1. Notification & Alert State Handling under Stress", () => {
    it("handles auto-dismiss after exactly 5000ms with fake timers", () => {
      vi.useFakeTimers();

      render(
        <AdminClient
          initialClasses={mockClasses}
          initialTeachers={mockTeachers}
          initialSettings={mockSettings}
          superadminName="Superadmin"
        />
      );

      // Switch to settings tab to trigger a background theme notification (using desktop tab)
      const settingsTabs = screen.getAllByRole("button", { name: /Pengaturan Tampilan/i });
      fireEvent.click(settingsTabs[0]);

      // Select Clean Slate theme
      const cleanSlateBtn = screen.getByRole("button", { name: /Clean Slate/i });
      fireEvent.click(cleanSlateBtn);

      // Notification banner should appear
      const alert = screen.getByRole("alert");
      expect(alert).not.toBeNull();
      expect(alert.textContent).toContain("Clean Slate");

      // Advance by 4900ms - should still be visible
      act(() => {
        vi.advanceTimersByTime(4900);
      });
      expect(screen.queryByRole("alert")).not.toBeNull();

      // Advance past 5000ms - should be auto-dismissed
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("survives rapid multiple clicks on dismiss button without unhandled errors", () => {
      render(
        <AdminClient
          initialClasses={mockClasses}
          initialTeachers={mockTeachers}
          initialSettings={mockSettings}
          superadminName="Superadmin"
        />
      );

      // Trigger notification via background theme selection
      const settingsTabs = screen.getAllByRole("button", { name: /Pengaturan Tampilan/i });
      fireEvent.click(settingsTabs[0]);
      const cleanSlateBtn = screen.getByRole("button", { name: /Clean Slate/i });
      fireEvent.click(cleanSlateBtn);

      const closeButton = screen.getByRole("button", { name: /Tutup notifikasi/i });
      expect(closeButton).not.toBeNull();

      // Fire 10 rapid clicks on close button
      for (let i = 0; i < 10; i++) {
        fireEvent.click(closeButton);
      }

      // Banner should be dismissed and no unhandled exceptions thrown
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("resets 5-second auto-dismiss countdown when a second notification is fired", () => {
      vi.useFakeTimers();

      render(
        <AdminClient
          initialClasses={mockClasses}
          initialTeachers={mockTeachers}
          initialSettings={mockSettings}
          superadminName="Superadmin"
        />
      );

      const settingsTabs = screen.getAllByRole("button", { name: /Pengaturan Tampilan/i });
      fireEvent.click(settingsTabs[0]);

      // First notification
      const cleanSlateBtn = screen.getByRole("button", { name: /Clean Slate/i });
      fireEvent.click(cleanSlateBtn);
      expect(screen.getByRole("alert").textContent).toContain("Clean Slate");

      // Advance 3000ms
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      // Second notification: Nordic Cool
      const nordicBtn = screen.getByRole("button", { name: /Nordic Cool/i });
      fireEvent.click(nordicBtn);
      expect(screen.getByRole("alert").textContent).toContain("Nordic Cool");

      // Advance another 3000ms (total 6000ms from start, but only 3000ms from second notification)
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      // The second notification MUST still be visible because countdown was reset!
      expect(screen.queryByRole("alert")).not.toBeNull();
      expect(screen.getByRole("alert").textContent).toContain("Nordic Cool");

      // Advance another 2500ms (5500ms from second notification) -> now dismissed
      act(() => {
        vi.advanceTimersByTime(2500);
      });
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("handles rapid tab switching without desync or race conditions", () => {
      render(
        <AdminClient
          initialClasses={mockClasses}
          initialTeachers={mockTeachers}
          initialSettings={mockSettings}
          superadminName="Superadmin"
        />
      );

      const classesTabs = screen.getAllByRole("button", { name: /Manajemen Kelas/i });
      const teachersTabs = screen.getAllByRole("button", { name: /Akun Wali Kelas/i });
      const settingsTabs = screen.getAllByRole("button", { name: /Pengaturan Tampilan/i });
      const databaseTabs = screen.getAllByRole("button", { name: /Pengaturan Teknis/i });

      // Rapidly switch tabs 20 times in alternating sequence (using both desktop & mobile buttons)
      act(() => {
        for (let i = 0; i < 5; i++) {
          fireEvent.click(teachersTabs[0]);
          fireEvent.click(settingsTabs[1]); // Mobile button
          fireEvent.click(databaseTabs[0]);
          fireEvent.click(classesTabs[1]); // Mobile button
        }
      });

      // Assert final state matches classes tab cleanly
      expect(screen.getByRole("region", { name: /Tabel Manajemen Kelas/i })).not.toBeNull();
      expect(screen.queryByRole("region", { name: /Tabel Akun Wali Kelas/i })).toBeNull();
    });

  });

  describe("2. LocalStorage Resilience (SSR, Private Browsing, Quota)", () => {
    it("safely mounts and falls back when localStorage.getItem throws SecurityError (Private Browsing)", () => {
      const originalGetItem = Storage.prototype.getItem;
      Storage.prototype.getItem = vi.fn().mockImplementation(() => {
        throw new DOMException("The operation is insecure.", "SecurityError");
      });

      try {
        expect(() => {
          render(
            <AdminClient
              initialClasses={mockClasses}
              initialTeachers={mockTeachers}
              initialSettings={mockSettings}
              superadminName="Superadmin"
            />
          );
        }).not.toThrow();

        // UI renders without crashing, default warm-zinc preset is kept
        expect(screen.getByText("Superadmin")).not.toBeNull();
      } finally {
        Storage.prototype.getItem = originalGetItem;
      }
    });

    it("safely handles localStorage.setItem throwing QuotaExceededError", () => {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = vi.fn().mockImplementation(() => {
        throw new DOMException("Quota exceeded.", "QuotaExceededError");
      });

      try {
        render(
          <AdminClient
            initialClasses={mockClasses}
            initialTeachers={mockTeachers}
            initialSettings={mockSettings}
            superadminName="Superadmin"
          />
        );

        const settingsTabs = screen.getAllByRole("button", { name: /Pengaturan Tampilan/i });
        fireEvent.click(settingsTabs[0]);

        const cleanSlateBtn = screen.getByRole("button", { name: /Clean Slate/i });
        // Clicking should not throw despite localStorage failing
        expect(() => fireEvent.click(cleanSlateBtn)).not.toThrow();

        // React state & notification still update successfully
        expect(screen.getByRole("alert").textContent).toContain("Clean Slate");
      } finally {
        Storage.prototype.setItem = originalSetItem;
      }
    });

    it("safely ignores malicious or invalid saved theme ID in localStorage", () => {
      localStorage.setItem("app_bg_theme", "malicious-theme-id-injection");

      render(
        <AdminClient
          initialClasses={mockClasses}
          initialTeachers={mockTeachers}
          initialSettings={mockSettings}
          superadminName="Superadmin"
        />
      );

      // Should not set invalid data-bg-theme attribute
      expect(document.documentElement.getAttribute("data-bg-theme")).not.toBe("malicious-theme-id-injection");
    });
  });

  describe("3. Table Rows with Missing Class / Inactive Status", () => {
    it("renders unassigned class for teacher with semantic italic text and no broken markup", () => {
      render(
        <AdminClient
          initialClasses={mockClasses}
          initialTeachers={mockTeachers}
          initialSettings={mockSettings}
          superadminName="Superadmin"
        />
      );

      const teachersTabs = screen.getAllByRole("button", { name: /Akun Wali Kelas/i });
      fireEvent.click(teachersTabs[0]);

      // Siti Rahma has assignedClassName = null -> should display 'Belum ditugaskan'
      const unassignedSpans = screen.getAllByText("Belum ditugaskan");
      expect(unassignedSpans.length).toBeGreaterThan(0);
      expect(unassignedSpans[0].className).toContain("italic");
      expect(unassignedSpans[0].className).toContain("whitespace-nowrap");
    });

    it("renders inactive teacher status with semantic alpa/danger text and whitespace-nowrap", () => {
      render(
        <AdminClient
          initialClasses={mockClasses}
          initialTeachers={mockTeachers}
          initialSettings={mockSettings}
          superadminName="Superadmin"
        />
      );

      const teachersTabs = screen.getAllByRole("button", { name: /Akun Wali Kelas/i });
      fireEvent.click(teachersTabs[0]);

      // Active status for Budi
      const activeStatus = screen.getByText("Aktif");
      expect(activeStatus.className).toContain("text-[var(--status-success-fg)]");
      expect(activeStatus.className).toContain("whitespace-nowrap");

      // Inactive status for Siti
      const inactiveStatus = screen.getByText("Nonaktif");
      expect(inactiveStatus.className).toContain("text-[var(--status-alpa-fg)]");
      expect(inactiveStatus.className).toContain("whitespace-nowrap");
    });

    it("renders unassigned wali kelas for class table with fallback text", () => {
      render(
        <AdminClient
          initialClasses={mockClasses}
          initialTeachers={mockTeachers}
          initialSettings={mockSettings}
          superadminName="Superadmin"
        />
      );

      // In Manajemen Kelas tab, Kelas 7B has no waliKelasName
      const unassignedClassWali = screen.getByText("Belum ditugaskan");
      expect(unassignedClassWali).not.toBeNull();
      expect(unassignedClassWali.className).toContain("text-amber-600");
    });

    it("renders gracefully with completely empty tables without runtime crash", () => {
      expect(() => {
        render(
          <AdminClient
            initialClasses={[]}
            initialTeachers={[]}
            initialSettings={mockSettings}
            superadminName="Superadmin"
          />
        );
      }).not.toThrow();

      // Stats counters render 0 cleanly
      const zeros = screen.getAllByText("0");
      expect(zeros.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("4. Responsive Bottom Navigation & Layout Clearance", () => {
    it("renders mobile bottom navigation bar with 4 required tabs and touch targets", () => {
      render(
        <AdminClient
          initialClasses={mockClasses}
          initialTeachers={mockTeachers}
          initialSettings={mockSettings}
          superadminName="Superadmin"
        />
      );

      const bottomNav = screen.getByRole("navigation", { name: "Navigasi Bawah Admin" });
      expect(bottomNav).not.toBeNull();
      expect(bottomNav.className).toContain("md:hidden");
      expect(bottomNav.className).toContain("fixed bottom-0");
      expect(bottomNav.className).toContain("z-30");

      // 4 tab buttons in mobile bottom nav
      const buttons = bottomNav.querySelectorAll("button");
      expect(buttons.length).toBe(4);

      // Check touch-target class on all mobile buttons
      buttons.forEach((btn) => {
        expect(btn.className).toContain("touch-target");
      });
    });

    it("ensures main container has pb-24 bottom clearance for mobile navigation", () => {
      const { container } = render(
        <AdminClient
          initialClasses={mockClasses}
          initialTeachers={mockTeachers}
          initialSettings={mockSettings}
          superadminName="Superadmin"
        />
      );

      const main = container.querySelector("main");
      expect(main).not.toBeNull();
      expect(main?.className).toContain("pb-24");
      expect(main?.className).toContain("md:pb-6");
    });

    it("renders responsive 2-column grid metric cards", () => {
      const { container } = render(
        <AdminClient
          initialClasses={mockClasses}
          initialTeachers={mockTeachers}
          initialSettings={mockSettings}
          superadminName="Superadmin"
        />
      );

      const statsContainer = container.querySelector(".grid.grid-cols-2");
      expect(statsContainer).not.toBeNull();
      expect(statsContainer?.className).toContain("grid-cols-2");
      expect(statsContainer?.className).toContain("lg:grid-cols-4");
    });
  });
});
