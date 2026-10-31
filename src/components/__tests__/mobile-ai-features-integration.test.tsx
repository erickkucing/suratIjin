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
    it("renders Bell notification button in the header with badge when at-risk students are detected and aiEnabled is true", () => {
      render(
        <ConfirmDialogProvider>
          <DashboardClient
            initialData={mockData}
            user={mockUser}
            classesList={[mockClass]}
            currentClassId={1}
            aiEnabled={true}
          />
        </ConfirmDialogProvider>
      );

      const bellHeaderButton = screen.getByRole("button", { name: /buka insight presensi/i });
      expect(bellHeaderButton).toBeDefined();

      // At-risk student Ahmad Rizky has 3 Alpas -> badge with count should be displayed
      const badge = screen.getByLabelText(/siswa berisiko terdeteksi/i);
      expect(badge).toBeDefined();
      expect(badge.textContent).toBe("1");
    });

    it("completely hides AI bell, insight toolbar button, and risk banner when aiEnabled is false, while Speed Dial camera scan remains fully available", () => {
      render(
        <ConfirmDialogProvider>
          <DashboardClient
            initialData={mockData}
            user={mockUser}
            classesList={[mockClass]}
            currentClassId={1}
            aiEnabled={false}
          />
        </ConfirmDialogProvider>
      );

      // AI elements must NOT be present
      expect(screen.queryByRole("button", { name: /buka notifikasi & wawasan presensi/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /wawasan presensi & deteksi siswa berisiko/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /buka dialog insight presensi/i })).toBeNull();

      // Speed dial and Camera scan MUST remain available
      const fabButton = screen.getByRole("button", { name: /buka menu aksi cepat presensi/i });
      expect(fabButton).toBeDefined();
      fireEvent.click(fabButton);

      const scanButton = screen.getByRole("button", { name: /pindai surat presensi/i });
      expect(scanButton).toBeDefined();
    });

    it("toggles mobile speed dial without text labels and uses clean floating buttons with PenLine and Camera", async () => {
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

      // Check backdrop has NO blur
      const backdrop = document.querySelector(".bg-black\\/45");
      expect(backdrop).toBeDefined();
      expect(backdrop?.className).not.toContain("backdrop-blur");

      // Speed dial child options should now be rendered as clean circular buttons without text labels
      const scanButton = screen.getByRole("button", { name: /pindai surat presensi/i });
      const recordButton = screen.getByRole("button", { name: /tambah catatan ketidakhadiran baru/i });

      expect(scanButton).toBeDefined();
      expect(recordButton).toBeDefined();
      // User directive: "hapus saja label teks pada anak button +"
      expect(scanButton.textContent?.trim()).toBe("");
      expect(recordButton.textContent?.trim()).toBe("");
      expect(scanButton.getAttribute("title")).toBe("Pindai Surat Presensi");
      expect(recordButton.getAttribute("title")).toBe("Tambah Catatan Ketidakhadiran");

      // Verify buttons have SVG icons
      expect(scanButton.querySelector("svg")).toBeDefined();
      expect(recordButton.querySelector("svg")).toBeDefined();

      // Clicking 'Pindai Surat' opens the BatchLetterScannerModal
      fireEvent.click(scanButton);

      await waitFor(() => {
        expect(screen.getByText(/pindai surat izin: kelas 7a/i)).toBeDefined();
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
            aiEnabled={true}
          />
        </ConfirmDialogProvider>
      );

      const bellHeaderButton = screen.getByRole("button", { name: /buka insight presensi/i });
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

  describe("Bottom Sheet 2-Step Snap Gesture (Swipe Up Expand & Swipe Down Collapse)", () => {
    it("supports drag handle gestures on mobile viewports", () => {
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

      const dragHandle = document.querySelector("[data-drag-handle]") as HTMLElement;
      expect(dragHandle).toBeDefined();
      const modalSheet = document.querySelector(".modal-bottom-sheet") as HTMLElement;
      expect(modalSheet).toBeDefined();
      expect(modalSheet.className).toContain("max-h-[68dvh]");

      // Simulate touch drag
      fireEvent.touchStart(dragHandle, { touches: [{ clientY: 300 }] });
      fireEvent.touchMove(dragHandle, { touches: [{ clientY: 250 }] }); // swipe up
      fireEvent.touchEnd(dragHandle);

      // Check that drag handle has appropriate touch-none styling
      expect(dragHandle.className).toContain("touch-none");
    });
  });
});
