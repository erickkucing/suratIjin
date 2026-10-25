import { describe, it, expect } from "vitest";
import { computeDynamicDashboardMetrics } from "../attendance-stats";
import { Student } from "@/db/schema";
import { AttendanceRecordWithStudent } from "@/db/queries";

const mockStudents: Student[] = [
  { id: 1, classId: 1, nis: "1001", name: "Andi Pratama", isActive: true, createdAt: new Date() },
  { id: 2, classId: 1, nis: "1002", name: "Budi Santoso", isActive: true, createdAt: new Date() },
  { id: 3, classId: 1, nis: "1003", name: "Citra Lestari", isActive: true, createdAt: new Date() },
  { id: 4, classId: 1, nis: "1004", name: "Siswa Diarsipkan", isActive: false, createdAt: new Date() },
];

const mockRecords: AttendanceRecordWithStudent[] = [
  {
    id: 101,
    classId: 1,
    studentId: 1,
    studentName: "Andi Pratama",
    attendanceDate: "2026-09-10",
    status: "Sakit",
    infoSource: "Orang tua",
    description: "Demam",
    letterFilePath: "1/2026-09/surat1.webp",
    letterMimeType: "image/webp",
    letterStatus: "Sudah",
    createdById: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 102,
    classId: 1,
    studentId: 1,
    studentName: "Andi Pratama",
    attendanceDate: "2026-10-05",
    status: "Izin",
    infoSource: "Orang tua",
    description: "Acara keluarga",
    letterFilePath: null,
    letterMimeType: null,
    letterStatus: "Belum",
    createdById: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 103,
    classId: 1,
    studentId: 2,
    studentName: "Budi Santoso",
    attendanceDate: "2026-10-12",
    status: "Alpa",
    infoSource: "Pengurus kelas",
    description: "Tanpa keterangan",
    letterFilePath: null,
    letterMimeType: null,
    letterStatus: "Belum",
    createdById: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

describe("Dynamic Attendance Metrics & Student Recap (Rapor)", () => {
  it("should compute full-period summary, 100% attendance, monthly chart, and per-student recap", () => {
    const metrics = computeDynamicDashboardMetrics({
      studentsList: mockStudents,
      records: mockRecords,
    });

    // Only active students (3) should be counted
    expect(metrics.activeStudents.length).toBe(3);
    expect(metrics.summary.totalSakit).toBe(1);
    expect(metrics.summary.totalIzin).toBe(1);
    expect(metrics.summary.totalAlpa).toBe(1);
    expect(metrics.summary.totalSuratBelum).toBe(1); // Only Izin/Sakit with Belum (Andi 2026-10-05)

    // Citra Lestari has 0 absences -> 100% attendance
    expect(metrics.students100Percent.map((s) => s.name)).toEqual(["Citra Lestari"]);

    // Per-student recap for Rapor
    expect(metrics.studentRecap.length).toBe(3);
    const andi = metrics.studentRecap.find((s) => s.studentId === 1);
    expect(andi).toMatchObject({
      sakit: 1,
      izin: 1,
      alpa: 0,
      totalAbsences: 2,
      suratBelum: 1,
    });

    const citra = metrics.studentRecap.find((s) => s.studentId === 3);
    expect(citra).toMatchObject({
      sakit: 0,
      izin: 0,
      alpa: 0,
      totalAbsences: 0,
      suratBelum: 0,
    });
  });

  it("should dynamically recalculate summary, 100% attendance, and chart when date range filter is applied", () => {
    // Filter only September 2026: only Andi was Sakit on 2026-09-10
    const septMetrics = computeDynamicDashboardMetrics({
      studentsList: mockStudents,
      records: mockRecords,
      dateStart: "2026-09-01",
      dateEnd: "2026-09-30",
    });

    expect(septMetrics.summary.totalSakit).toBe(1);
    expect(septMetrics.summary.totalIzin).toBe(0);
    expect(septMetrics.summary.totalAlpa).toBe(0);
    expect(septMetrics.summary.totalSuratBelum).toBe(0);

    // Both Budi Santoso and Citra Lestari had 100% attendance in September!
    expect(septMetrics.students100Percent.map((s) => s.name)).toEqual([
      "Budi Santoso",
      "Citra Lestari",
    ]);

    expect(septMetrics.monthlyChart.length).toBe(1);
    expect(septMetrics.monthlyChart[0].month).toBe("2026-09");
  });
});
