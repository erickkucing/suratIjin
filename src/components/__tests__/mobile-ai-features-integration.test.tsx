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
  role: "wali_kelas",
};

const mockClass = {
  id: 1,
  name: "Kelas 7A",
  slug: "kelas-7a",
  academicYear: "2026/2027",
  periodTitle: "Semester Genap 2025/2026",
  waliKelasId: 1,
  parentPasswordHash: null,
  parentShowLetterFile: true,
  isActive: true,
  createdAt: new Date(),
};

const mockStudents = [
  { id: 101, name: "Ahmad Rizky", nis: "1001", classId: 1, isActive: true, createdAt: new Date() },
  { id: 102, name: "Bunga Citra", nis: "1002", classId: 1, isActive: true, createdAt: new Date() },
  { id: 103, name: "Dimas Anggara", nis: "1003", classId: 1, isActive: true, createdAt: new Date() },
];

const mockData: DashboardData = {
  classInfo: mockClass,
  totalClassStudents: 3,
  studentsList: mockStudents,
  allStudentsList: mockStudents,
  records: [
    {
      id: 1,
      studentId: 101,
      classId: 1,
      attendanceDate: "2026-10-30",
      status: "Alpa",
      infoSource: "Orang tua",
      description: "Alpa beruntun tanpa kabar",
      letterFilePath: null,
      letterMimeType: null,
      letterStatus: "Belum",
      createdById: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      studentName: "Ahmad Rizky",
    },
    {
      id: 2,
      studentId: 101,
      classId: 1,
      attendanceDate: "2026-10-29",
      status: "Alpa",
      infoSource: "Orang tua",
      description: "Alpa beruntun tanpa kabar",
      letterFilePath: null,
      letterMimeType: null,
      letterStatus: "Belum",
      createdById: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      studentName: "Ahmad Rizky",
    },
    {
      id: 3,
      studentId: 101,
      classId: 1,
      attendanceDate: "2026-10-28",
      status: "Alpa",
      infoSource: "Orang tua",
      description: "Alpa beruntun tanpa kabar",
      letterFilePath: null,
      letterMimeType: null,
      letterStatus: "Belum",
      createdById: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      studentName: "Ahmad Rizky",
    },
  ],
  summary: {
    totalAlpa: 3,
    totalIzin: 0,
    totalSakit: 0,
    totalSuratBelum: 3,
    totalRecords: 3,
  },
  monthlyChart: [],
  students100Percent: [],
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
    it("renders both 'Jepret Kamera' and 'Pilih dari Berkas / Galeri' buttons in Unified Scanner", () => {
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
    it("renders Bell notification button in the header with badge when at-risk students are detected", () => {
      render(
        <ConfirmDialogProvider>
          <DashboardClient
            initialData={mockData}
            user={mockUser}
            classesList={[mockClass]}
            currentClassId={1}
          />
        </ConfirmDialogProvider>
      );

      const bellHeaderButton = screen.getByRole("button", { name: /buka notifikasi & wawasan presensi/i });
      expect(bellHeaderButton).toBeDefined();

      // At-risk student Ahmad Rizky has 3 Alpas -> badge with count should be displayed
      const badge = screen.getByLabelText(/siswa berisiko terdeteksi/i);
      expect(badge).toBeDefined();
      expect(badge.textContent).toBe("1");
    });

    it("toggles mobile speed dial and displays 'Pindai Surat' (without AI word) and 'Tambah Catatan'", async () => {
      render(
        <ConfirmDialogProvider>
          <DashboardClient
            initialData={mockData}
            user={mockUser}
            classesList={[mockClass]}
            currentClassId={1}
          />
        </ConfirmDialogProvider>
      );

      // Find the main FAB button
      const fabButton = screen.getByRole("button", { name: /buka menu aksi cepat presensi/i });
      expect(fabButton).toBeDefined();

      // Initially, speed dial child options are not visible
      expect(screen.queryByRole("button", { name: /pindai surat presensi/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /tambah catatan ketidakhadiran baru/i })).toBeNull();

      // Tap FAB button to open Speed Dial
      fireEvent.click(fabButton);

      // Speed dial child options should now be rendered
      const scanButton = screen.getByRole("button", { name: /pindai surat presensi/i });
      const recordButton = screen.getByRole("button", { name: /tambah catatan ketidakhadiran baru/i });

      expect(scanButton).toBeDefined();
      expect(recordButton).toBeDefined();
      expect(scanButton.textContent).toContain("Pindai Surat");
      expect(scanButton.textContent).not.toContain("AI");
      expect(recordButton.textContent).toContain("Tambah Catatan");

      // Clicking 'Pindai Surat' opens the BatchLetterScannerModal
      fireEvent.click(scanButton);

      await waitFor(() => {
        expect(screen.getByText(/pindai lembar surat izin siswa/i)).toBeDefined();
      });
    });

    it("opens AiAttendanceInsightsModal from header bell without 'Tutup' button in footer", async () => {
      render(
        <ConfirmDialogProvider>
          <DashboardClient
            initialData={mockData}
            user={mockUser}
            classesList={[mockClass]}
            currentClassId={1}
          />
        </ConfirmDialogProvider>
      );

      const bellHeaderButton = screen.getByRole("button", { name: /buka notifikasi & wawasan presensi/i });
      fireEvent.click(bellHeaderButton);

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeDefined();
      });

      const dialog = screen.getByRole("dialog");
      // Check for mobile bottom sheet handles
      expect(dialog.querySelector("[data-drag-handle]")).toBeDefined();
      expect(dialog.querySelector("[data-sheet-header]")).toBeDefined();

      // Check footer: should NOT have 'Tutup' button
      const closeButtons = screen.getAllByRole("button", { name: /tutup/i });
      // Should only have the top header close button ('Tutup modal wawasan')
      expect(closeButtons.length).toBe(1);
      expect(closeButtons[0].getAttribute("aria-label")).toBe("Tutup modal wawasan");
    });
  });

  describe("BatchLetterScannerModal Photo Collection Tray & Submission", () => {
    it("updates tray to show photo item and green submit button when files are selected", async () => {
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

      const fileInput = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
      expect(fileInput).toBeDefined();

      const testFile = new File(["dummy content"], "surat_dokter.jpg", { type: "image/jpeg" });

      fireEvent.change(fileInput, { target: { files: [testFile] } });

      await waitFor(() => {
        expect(screen.getByText(/kumpulan foto & berkas/i)).toBeDefined();
      });

      expect(screen.getByText(/surat_dokter\.jpg/i)).toBeDefined();
      expect(screen.getByText(/\+ jepret foto lagi/i)).toBeDefined();
      expect(screen.getByText(/\+ tambah berkas/i)).toBeDefined();

      const submitBtn = screen.getByRole("button", { name: /proses dan pindai 1 berkas/i });
      expect(submitBtn).toBeDefined();
      expect(submitBtn.className).toContain("bg-emerald-600");
    });
  });
});
