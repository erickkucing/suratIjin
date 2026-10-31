// @vitest-environment happy-dom
import React from "react";
(globalThis as any).React = React;
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AiAttendanceInsightsModal } from "../ai-attendance-insights-modal";
import { Student } from "@/db/schema";
import { AttendanceRecordWithStudent } from "@/db/queries";

const mockStudents: Student[] = [
  {
    id: 101,
    name: "Ahmad Rizky Pratama",
    nis: "1001",
    classId: 1,
    isActive: true,
    createdAt: new Date(),
  },
  {
    id: 102,
    name: "Bunga Citra Lestari",
    nis: "1002",
    classId: 1,
    isActive: true,
    createdAt: new Date(),
  },
];

const mockRecords: AttendanceRecordWithStudent[] = [
  // Ahmad: 3 consecutive sick days without doctor note (PENDING_DOCTOR_NOTE)
  {
    id: 1,
    classId: 1,
    studentId: 101,
    studentName: "Ahmad Rizky Pratama",
    attendanceDate: "2026-10-26",
    status: "Sakit",
    infoSource: "Orang tua",
    description: "Demam",
    letterFilePath: null,
    letterMimeType: null,
    letterStatus: "Belum",
    createdById: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 2,
    classId: 1,
    studentId: 101,
    studentName: "Ahmad Rizky Pratama",
    attendanceDate: "2026-10-27",
    status: "Sakit",
    infoSource: "Orang tua",
    description: "Demam tinggi",
    letterFilePath: null,
    letterMimeType: null,
    letterStatus: "Belum",
    createdById: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 3,
    classId: 1,
    studentId: 101,
    studentName: "Ahmad Rizky Pratama",
    attendanceDate: "2026-10-28",
    status: "Sakit",
    infoSource: "Orang tua",
    description: "Masih lemas",
    letterFilePath: null,
    letterMimeType: null,
    letterStatus: "Belum",
    createdById: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

describe("AiAttendanceInsightsModal", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("should not render when isOpen is false", () => {
    const { container } = render(
      <AiAttendanceInsightsModal
        isOpen={false}
        onClose={vi.fn()}
        classId={1}
        classNameTitle="Kelas XII TKJ 2"
        studentsList={mockStudents}
        records={mockRecords}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("should render header, tabs, and local anomaly calculation instantly when isOpen is true", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        period: "month",
        periodTitle: "Bulan Oktober 2026",
        summaryStats: {
          totalStudents: 2,
          totalAbsences: 3,
          totalAlpa: 0,
          totalIzin: 0,
          totalSakit: 3,
          totalSuratBelum: 3,
        },
        atRiskStudents: [
          {
            studentId: 101,
            studentName: "Ahmad Rizky Pratama",
            nis: "1001",
            urgency: "Waspada",
            anomalyTypes: ["PENDING_DOCTOR_NOTE"],
            ruleDescriptions: ["Sakit beruntun 3 hari tanpa surat dokter resmi"],
            stats: {
              alpa: 0,
              izin: 0,
              sakit: 3,
              total: 3,
              pendingLetters: 3,
              mondayFridayRatio: 0.33,
              consecutiveSickDays: 3,
              maxMonthlyAbsence: 3,
            },
          },
        ],
        narratives: {
          executiveSummary: "Ringkasan eksekutif tes",
          principalReport: "Laporan kepala sekolah tes",
          parentGroupMessage: "Pesan paguyuban tes",
          bkRecommendations: [
            {
              studentName: "Ahmad Rizky Pratama",
              riskLevel: "Waspada",
              recommendation: "Lakukan konfirmasi surat dokter ke wali murid.",
            },
          ],
        },
        cached: false,
        aiGenerated: true,
      }),
    });

    render(
      <AiAttendanceInsightsModal
        isOpen={true}
        onClose={vi.fn()}
        classId={1}
        classNameTitle="Kelas XII TKJ 2"
        studentsList={mockStudents}
        records={mockRecords}
      />
    );

    expect(screen.getByText("Wawasan Presensi & Deteksi Dini")).toBeDefined();
    expect(screen.getByText("Deteksi Siswa Berisiko")).toBeDefined();
    expect(screen.getByText("Narasi Laporan & WhatsApp")).toBeDefined();

    // Verify student anomaly is rendered
    await waitFor(() => {
      expect(screen.getByText("Ahmad Rizky Pratama")).toBeDefined();
      expect(screen.getByText(/3 surat dokter tertunda/i)).toBeDefined();
      expect(screen.getByText(/Lakukan konfirmasi surat dokter/i)).toBeDefined();
    });
  });

  it("should switch tabs to narratives and allow copying text to clipboard", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        period: "month",
        periodTitle: "Bulan Oktober 2026",
        summaryStats: {
          totalStudents: 2,
          totalAbsences: 3,
          totalAlpa: 0,
          totalIzin: 0,
          totalSakit: 3,
          totalSuratBelum: 3,
        },
        atRiskStudents: [],
        narratives: {
          executiveSummary: "Ringkasan eksekutif kehadiran kelas prima.",
          principalReport: "Laporan resmi pimpinan sekolah lengkap.",
          parentGroupMessage: "Pesan santun grup WhatsApp orang tua.",
          bkRecommendations: [],
        },
        cached: true,
        aiGenerated: true,
      }),
    });

    const mockToast = vi.fn();

    render(
      <AiAttendanceInsightsModal
        isOpen={true}
        onClose={vi.fn()}
        classId={1}
        classNameTitle="Kelas XII TKJ 2"
        studentsList={mockStudents}
        records={mockRecords}
        onShowToast={mockToast}
      />
    );

    // Switch to Narratives tab
    const narrativeTabBtn = screen.getByText("Narasi Laporan & WhatsApp");
    fireEvent.click(narrativeTabBtn);

    await waitFor(() => {
      expect(screen.getByText("Ringkasan eksekutif kehadiran kelas prima.")).toBeDefined();
      expect(screen.getByText("Laporan resmi pimpinan sekolah lengkap.")).toBeDefined();
      expect(screen.getByText("Pesan santun grup WhatsApp orang tua.")).toBeDefined();
    });

    // Click Salin Format WA
    const copyWaBtn = screen.getByText("Salin Format WA");
    fireEvent.click(copyWaBtn);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Pesan santun grup WhatsApp orang tua.");
      expect(mockToast).toHaveBeenCalledWith("Pesan WhatsApp berhasil disalin ke clipboard!", "success");
    });
  });
});
