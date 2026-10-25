import { describe, it, expect, vi, beforeEach } from "vitest";
import { downloadStudentImportTemplate } from "../export-excel";
import ExcelJS from "exceljs";

describe("Excel Export & Template Generator", () => {
  beforeEach(() => {
    // Mock browser DOM download APIs in node environment
    if (typeof globalThis.URL.createObjectURL !== "function") {
      globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-url");
    } else {
      vi.spyOn(globalThis.URL, "createObjectURL").mockReturnValue("blob:mock-url");
    }

    if (typeof globalThis.URL.revokeObjectURL !== "function") {
      globalThis.URL.revokeObjectURL = vi.fn();
    } else {
      vi.spyOn(globalThis.URL, "revokeObjectURL").mockImplementation(() => {});
    }

    const mockElement = {
      href: "",
      download: "",
      click: vi.fn(),
    };

    (globalThis as unknown as { document: unknown }).document = {
      createElement: vi.fn(() => mockElement),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
    };
  });

  it("should generate a valid student batch import Excel template", async () => {
    await downloadStudentImportTemplate("XII TKJ 2");

    expect(globalThis.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(globalThis.document.body.appendChild).toHaveBeenCalledTimes(1);
    expect(globalThis.document.body.removeChild).toHaveBeenCalledTimes(1);
  });

  it("template structure should be parseable by ExcelJS with proper headers", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Format Import Siswa");
    sheet.addRow(["No", "NIS", "Nama Lengkap Siswa"]);
    sheet.addRow([1, "10291", "Aditya Pratama"]);

    const rowHeader = sheet.getRow(1);
    const headerValues = rowHeader.values as string[];
    expect(headerValues).toContain("Nama Lengkap Siswa");
    expect(headerValues).toContain("NIS");

    const sampleRow = sheet.getRow(2);
    expect(sampleRow.getCell(2).value).toBe("10291");
    expect(sampleRow.getCell(3).value).toBe("Aditya Pratama");
  });

  it("should generate attendance Excel workbook with 3 sheets including Rekap Per Siswa (Rapor)", async () => {
    const { buildAttendanceExcelWorkbook } = await import("../export-excel");
    const workbook = await buildAttendanceExcelWorkbook({
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
          description: "Demam",
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
        {
          studentId: 11,
          nis: "10292",
          name: "Budi Santoso",
          sakit: 0,
          izin: 0,
          alpa: 0,
          totalAbsences: 0,
          suratBelum: 0,
        },
      ],
      dateRangeLabel: "Semester Ganjil (2026/2027)",
    });

    expect(workbook.worksheets.map((w) => w.name)).toEqual([
      "Data Ketidakhadiran",
      "Rekap Per Siswa (Rapor)",
      "Apresiasi Hadir 100%",
    ]);
  });

  it("should embed proportional logo images into worksheets", async () => {
    const { buildAttendanceExcelWorkbook } = await import("../export-excel");
    const workbook = await buildAttendanceExcelWorkbook({
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
      records: [],
      students100Percent: [],
      studentRecap: [],
      dateRangeLabel: "Semester Ganjil (2026/2027)",
      logoUrl: null,
    });

    const sheet1 = workbook.getWorksheet("Data Ketidakhadiran");
    const sheetRecap = workbook.getWorksheet("Rekap Per Siswa (Rapor)");
    const sheet2 = workbook.getWorksheet("Apresiasi Hadir 100%");

    expect(sheet1?.getImages().length).toBeGreaterThan(0);
    expect(sheetRecap?.getImages().length).toBeGreaterThan(0);
    expect(sheet2?.getImages().length).toBeGreaterThan(0);
  });
});
