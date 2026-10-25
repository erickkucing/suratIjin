import { describe, it, expect, vi, beforeEach } from "vitest";

describe("PDF Export", () => {
  beforeEach(() => {
    // Mock browser window / save if needed
    if (typeof globalThis.URL.createObjectURL !== "function") {
      globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-url");
    }
  });

  it("should generate attendance PDF and call save without throwing", async () => {
    const { exportAttendancePdf } = await import("../export-pdf");

    // We can spy on jsPDF or run it directly
    await expect(
      exportAttendancePdf({
        classInfo: {
          id: 1,
          slug: "xii-tkj-2",
          name: "XII TKJ 2",
          academicYear: "2026/2027",
          periodTitle: "Semester Ganjil",
          waliKelasId: 1,
          parentPasswordHash: null,
          parentShowLetterFile: false,
          isActive: true,
          createdAt: new Date(),
        },
        teacherName: "Erick S.Kom",
        records: [
          {
            id: 1,
            classId: 1,
            studentId: 10,
            studentName: "Andi Pratama",
            attendanceDate: "2026-10-01",
            status: "Sakit",
            infoSource: "Orang tua",
            description: "Demam tinggi",
            letterFilePath: null,
            letterMimeType: null,
            letterStatus: "Sudah",
            createdById: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        students100Percent: [
          {
            id: 11,
            classId: 1,
            nis: "10292",
            name: "Budi Santoso",
            isActive: true,
            createdAt: new Date(),
          },
        ],
        studentRecap: [
          {
            studentId: 10,
            nis: "10291",
            name: "Andi Pratama",
            sakit: 1,
            izin: 0,
            alpa: 0,
            totalAbsences: 1,
            suratBelum: 0,
          },
        ],
        dateRangeLabel: "Semester Ganjil (2026/2027)",
        logoUrl: null,
      })
    ).resolves.not.toThrow();
  });
});
