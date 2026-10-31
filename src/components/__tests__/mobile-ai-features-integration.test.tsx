// @vitest-environment happy-dom
import React from "react";
(globalThis as any).React = React;
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TeacherProfileModal } from "../teacher-profile-modal";
import { BatchLetterScannerModal } from "../batch-letter-scanner-modal";
import { DashboardClient } from "@/app/dashboard/dashboard-client";
import { ConfirmDialogProvider } from "@/components/confirm-dialog-provider";
import { UserSessionPayload } from "@/lib/auth";
import { DashboardData } from "@/db/queries";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Mock auth actions
vi.mock("@/actions/auth", () => ({
  updateSelfProfileAction: vi.fn().mockResolvedValue({ success: true }),
  logoutAction: vi.fn().mockResolvedValue(undefined),
}));

// Mock client-side image compression
vi.mock("@/lib/client-image-compress", () => ({
  processFileBeforeUpload: vi.fn().mockImplementation(async (file: File) => ({
    file,
    originalSize: file.size,
    compressedSize: file.size,
    reductionPercentage: 0,
  })),
}));

// Mock URL object methods
if (typeof URL.createObjectURL === "undefined") {
  URL.createObjectURL = vi.fn().mockReturnValue("blob:http://localhost/mock-url");
}
if (typeof URL.revokeObjectURL === "undefined") {
  URL.revokeObjectURL = vi.fn();
}

const mockUser: UserSessionPayload = {
  id: 1,
  username: "guru_ipa",
  displayName: "Siti Rahmawati, S.Pd.",
  role: "teacher",
  classId: 1,
};

const mockData: DashboardData = {
  classInfo: {
    id: 1,
    name: "Kelas 7A",
    inviteCode: "7A-2026",
    periodTitle: "Semester Genap 2025/2026",
    portalEnabled: true,
  },
  totalClassStudents: 3,
  studentsList: [
    { id: 101, name: "Ahmad Rizky", nis: "1001", classId: 1, isActive: true, createdAt: new Date() },
    { id: 102, name: "Bunga Citra", nis: "1002", classId: 1, isActive: true, createdAt: new Date() },
    { id: 103, name: "Dimas Anggara", nis: "1003", classId: 1, isActive: true, createdAt: new Date() },
  ],
  records: [
    {
      id: 1,
      studentId: 101,
      classId: 1,
      attendanceDate: "2026-10-30",
      status: "Alpa",
      hasLetter: false,
      letterUrl: null,
      notes: "Alpa beruntun tanpa kabar",
      createdAt: new Date(),
      updatedAt: new Date(),
      studentName: "Ahmad Rizky",
      studentNis: "1001",
    },
    {
      id: 2,
      studentId: 101,
      classId: 1,
      attendanceDate: "2026-10-29",
      status: "Alpa",
      hasLetter: false,
      letterUrl: null,
      notes: "Alpa beruntun tanpa kabar",
      createdAt: new Date(),
      updatedAt: new Date(),
      studentName: "Ahmad Rizky",
      studentNis: "1001",
    },
    {
      id: 3,
      studentId: 101,
      classId: 1,
      attendanceDate: "2026-10-28",
      status: "Alpa",
      hasLetter: false,
      letterUrl: null,
      notes: "Alpa beruntun tanpa kabar",
      createdAt: new Date(),
      updatedAt: new Date(),
      studentName: "Ahmad Rizky",
      studentNis: "1001",
    },
  ],
  summary: {
    totalAlpa: 3,
    totalIzin: 0,
    totalSakit: 0,
    totalWithoutLetter: 3,
  },
  students100Percent: [],
  studentRecap: [
    {
      studentId: 101,
      studentName: "Ahmad Rizky",
      studentNis: "1001",
      totalAlpa: 3,
      totalIzin: 0,
      totalSakit: 0,
      totalAbsences: 3,
      totalDaysWithoutLetter: 3,
    },
  ],
};

describe("Mobile AI Features & Usability Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("TeacherProfileModal Logout Functionality", () => {
    it("renders 'Keluar dari Akun' button in the profile modal", () => {
      render(
        <TeacherProfileModal
          isOpen={true}
          onClose={vi.fn()}
          user={mockUser}
          classNameTitle="Kelas 7A"
          onSuccess={vi.fn()}
        />
      );

      const logoutButton = screen.getByRole("button", { name: /keluar dari akun/i });
      expect(logoutButton).toBeDefined();
      expect(logoutButton.textContent).toContain("Keluar dari Akun");
    });
  });

  describe("BatchLetterScannerModal Mobile Camera & Multi-File UX", () => {
    it("renders both 'Jepret Kamera' and 'Pilih dari Berkas / Galeri' buttons in Tab 1", () => {
      render(
        <BatchLetterScannerModal
          isOpen={true}
          onClose={vi.fn()}
          classId={1}
          classNameTitle="Kelas 7A"
          studentsList={mockData.studentsList}
          onSuccess={vi.fn()}
          onShowToast={vi.fn()}
        />
      );

      expect(screen.getByRole("button", { name: /jepret kamera/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /pilih dari berkas \/ galeri/i })).toBeDefined();
    });
  });

  describe("DashboardClient Mobile Speed Dial & Header AI Notification", () => {
    it("renders AI insights button in the header with notification badge when at-risk students are detected", () => {
      render(
        <ConfirmDialogProvider>
          <DashboardClient
            initialData={mockData}
            user={mockUser}
            classesList={[{ id: 1, name: "Kelas 7A", inviteCode: "7A", periodTitle: "Semester Genap", portalEnabled: true }]}
            currentClassId={1}
          />
        </ConfirmDialogProvider>
      );

      const aiHeaderButton = screen.getByRole("button", { name: /buka wawasan presensi ai/i });
      expect(aiHeaderButton).toBeDefined();

      // At-risk student Ahmad Rizky has 3 Alpas -> badge with count should be displayed
      const badge = screen.getByLabelText(/siswa berisiko terdeteksi/i);
      expect(badge).toBeDefined();
      expect(badge.textContent).toBe("1");
    });

    it("toggles mobile speed dial and displays 'Pindai Surat AI' and 'Tambah Catatan'", async () => {
      render(
        <ConfirmDialogProvider>
          <DashboardClient
            initialData={mockData}
            user={mockUser}
            classesList={[{ id: 1, name: "Kelas 7A", inviteCode: "7A", periodTitle: "Semester Genap", portalEnabled: true }]}
            currentClassId={1}
          />
        </ConfirmDialogProvider>
      );

      // Find the main FAB button
      const fabButton = screen.getByRole("button", { name: /buka menu aksi cepat presensi/i });
      expect(fabButton).toBeDefined();

      // Initially, speed dial child options are not visible
      expect(screen.queryByRole("button", { name: /pindai banyak surat dengan ai atau kamera hp/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /catat ketidakhadiran baru secara manual/i })).toBeNull();

      // Tap FAB button to open Speed Dial
      fireEvent.click(fabButton);

      // Speed dial child options should now be rendered
      const scanButton = screen.getByRole("button", { name: /pindai banyak surat dengan ai atau kamera hp/i });
      const recordButton = screen.getByRole("button", { name: /catat ketidakhadiran baru secara manual/i });

      expect(scanButton).toBeDefined();
      expect(recordButton).toBeDefined();

      // Clicking 'Pindai Surat AI' opens the BatchLetterScannerModal
      fireEvent.click(scanButton);

      await waitFor(() => {
        expect(screen.getByText(/pilih banyak file/i)).toBeDefined();
      });
    });
  });
});
