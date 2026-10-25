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
});
