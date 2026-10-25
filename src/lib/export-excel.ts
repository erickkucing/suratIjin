"use client";

import { AttendanceRecordWithStudent } from "@/db/queries";
import { Student, ClassItem } from "@/db/schema";
import { StudentRecapItem } from "./attendance-stats";
import { resolveExportLogo, calculateProportionalDimensions } from "./export-logo";

export interface ExportExcelParams {
  classInfo: ClassItem;
  teacherName?: string;
  records: AttendanceRecordWithStudent[];
  students100Percent: Student[];
  studentRecap?: StudentRecapItem[];
  dateRangeLabel: string;
  logoUrl?: string | null;
}

export async function buildAttendanceExcelWorkbook({
  classInfo,
  teacherName = "Wali Kelas",
  records,
  students100Percent,
  studentRecap = [],
  dateRangeLabel,
  logoUrl,
}: ExportExcelParams) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sistem Surat Izin & Ketidakhadiran Siswa";
  workbook.created = new Date();

  const logoInfo = await resolveExportLogo(logoUrl);
  let logoImageId: number | null = null;
  let logoDims: { width: number; height: number } | null = null;

  if (logoInfo) {
    logoImageId = workbook.addImage({
      base64: logoInfo.base64,
      extension: logoInfo.extension,
    });
    logoDims = calculateProportionalDimensions(
      logoInfo.width,
      logoInfo.height,
      68,
      50
    );
  }

  const sheet1 = workbook.addWorksheet("Data Ketidakhadiran");

  sheet1.mergeCells("A1:G1");
  const titleCell = sheet1.getCell("A1");
  titleCell.value = `REKAPITULASI SURAT IZIN & KETIDAKHADIRAN SISWA - KELAS ${classInfo.name}`;
  titleCell.font = { name: "Arial", size: 14, bold: true, color: { argb: "FFB54826" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet1.getRow(1).height = 28;

  sheet1.mergeCells("A2:G2");
  const subCell = sheet1.getCell("A2");
  subCell.value = `Periode: ${dateRangeLabel} | Wali Kelas: ${teacherName} | Tahun Ajaran: ${classInfo.academicYear}`;
  subCell.font = { name: "Arial", size: 10, italic: true };
  subCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet1.getRow(2).height = 20;

  if (logoImageId !== null && logoDims) {
    sheet1.addImage(logoImageId, {
      tl: { col: 0.15, row: 0.15 },
      ext: { width: Math.round(logoDims.width), height: Math.round(logoDims.height) },
    });
  }

  sheet1.addRow([]);

  const headerRow = sheet1.addRow([
    "No",
    "Tanggal",
    "Nama Siswa",
    "Status Kehadiran",
    "Info Dari",
    "Keterangan",
    "Status Surat",
  ]);
  headerRow.height = 24;

  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFB54826" },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });

  records.forEach((r, idx) => {
    const row = sheet1.addRow([
      idx + 1,
      r.attendanceDate,
      r.studentName,
      r.status,
      r.infoSource,
      r.description || "-",
      r.letterStatus,
    ]);

    row.getCell(1).alignment = { horizontal: "center" };
    row.getCell(2).alignment = { horizontal: "center" };
    row.getCell(4).alignment = { horizontal: "center" };
    row.getCell(7).alignment = { horizontal: "center" };

    if (r.status === "Alpa") {
      row.getCell(4).font = { color: { argb: "FF962326" }, bold: true };
    }
    if (r.letterStatus === "Belum") {
      row.getCell(7).font = { color: { argb: "FFB54826" }, bold: true };
    }

    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE6DDD2" } },
        left: { style: "thin", color: { argb: "FFE6DDD2" } },
        bottom: { style: "thin", color: { argb: "FFE6DDD2" } },
        right: { style: "thin", color: { argb: "FFE6DDD2" } },
      };
    });
  });

  sheet1.columns = [
    { width: 8 },
    { width: 14 },
    { width: 34 },
    { width: 18 },
    { width: 18 },
    { width: 32 },
    { width: 14 },
  ];

  const sheetRecap = workbook.addWorksheet("Rekap Per Siswa (Rapor)");

  sheetRecap.mergeCells("A1:H1");
  const titleRecap = sheetRecap.getCell("A1");
  titleRecap.value = `REKAPITULASI KETIDAKHADIRAN PER SISWA (RAPOR) - KELAS ${classInfo.name}`;
  titleRecap.font = { name: "Arial", size: 14, bold: true, color: { argb: "FF264663" } };
  titleRecap.alignment = { horizontal: "center", vertical: "middle" };
  sheetRecap.getRow(1).height = 28;

  sheetRecap.mergeCells("A2:H2");
  const subRecap = sheetRecap.getCell("A2");
  subRecap.value = `Periode: ${dateRangeLabel} | Wali Kelas: ${teacherName} | Tahun Ajaran: ${classInfo.academicYear}`;
  subRecap.font = { name: "Arial", size: 10, italic: true };
  subRecap.alignment = { horizontal: "center", vertical: "middle" };
  sheetRecap.getRow(2).height = 20;

  if (logoImageId !== null && logoDims) {
    sheetRecap.addImage(logoImageId, {
      tl: { col: 0.15, row: 0.15 },
      ext: { width: Math.round(logoDims.width), height: Math.round(logoDims.height) },
    });
  }

  sheetRecap.addRow([]);

  const headerRecap = sheetRecap.addRow([
    "No",
    "NIS",
    "Nama Siswa",
    "Sakit",
    "Izin",
    "Alpa",
    "Total Ketidakhadiran",
    "Surat Belum",
  ]);
  headerRecap.height = 24;

  headerRecap.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF264663" },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });

  const firstDataRowIdx = 5;
  studentRecap.forEach((st, idx) => {
    const excelRowIdx = firstDataRowIdx + idx;
    const row = sheetRecap.addRow([
      idx + 1,
      st.nis || "-",
      st.name,
      st.sakit,
      st.izin,
      st.alpa,
      { formula: `SUM(D${excelRowIdx}:F${excelRowIdx})`, result: st.totalAbsences },
      st.suratBelum,
    ]);

    row.getCell(1).alignment = { horizontal: "center" };
    row.getCell(2).alignment = { horizontal: "center" };
    row.getCell(4).alignment = { horizontal: "center" };
    row.getCell(5).alignment = { horizontal: "center" };
    row.getCell(6).alignment = { horizontal: "center" };
    row.getCell(7).alignment = { horizontal: "center" };
    row.getCell(7).font = { bold: true };
    row.getCell(8).alignment = { horizontal: "center" };

    if (st.alpa > 0) {
      row.getCell(6).font = { color: { argb: "FF962326" }, bold: true };
    }
    if (st.suratBelum > 0) {
      row.getCell(8).font = { color: { argb: "FFB54826" }, bold: true };
    }

    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE6DDD2" } },
        left: { style: "thin", color: { argb: "FFE6DDD2" } },
        bottom: { style: "thin", color: { argb: "FFE6DDD2" } },
        right: { style: "thin", color: { argb: "FFE6DDD2" } },
      };
    });
  });

  if (studentRecap.length > 0) {
    const lastDataRowIdx = firstDataRowIdx + studentRecap.length - 1;
    const totalSakit = studentRecap.reduce((acc, s) => acc + s.sakit, 0);
    const totalIzin = studentRecap.reduce((acc, s) => acc + s.izin, 0);
    const totalAlpa = studentRecap.reduce((acc, s) => acc + s.alpa, 0);
    const totalAll = totalSakit + totalIzin + totalAlpa;
    const totalSuratBelum = studentRecap.reduce((acc, s) => acc + s.suratBelum, 0);

    const footerRow = sheetRecap.addRow([
      "",
      "",
      "TOTAL KELAS",
      { formula: `SUM(D${firstDataRowIdx}:D${lastDataRowIdx})`, result: totalSakit },
      { formula: `SUM(E${firstDataRowIdx}:E${lastDataRowIdx})`, result: totalIzin },
      { formula: `SUM(F${firstDataRowIdx}:F${lastDataRowIdx})`, result: totalAlpa },
      { formula: `SUM(G${firstDataRowIdx}:G${lastDataRowIdx})`, result: totalAll },
      { formula: `SUM(H${firstDataRowIdx}:H${lastDataRowIdx})`, result: totalSuratBelum },
    ]);
    footerRow.height = 22;
    footerRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF3ECE2" },
      };
      if (colNumber >= 4) {
        cell.alignment = { horizontal: "center", vertical: "middle" };
      }
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "double" },
        right: { style: "thin" },
      };
    });
  }

  sheetRecap.columns = [
    { width: 8 },
    { width: 16 },
    { width: 34 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 22 },
    { width: 14 },
  ];

  const sheet2 = workbook.addWorksheet("Apresiasi Hadir 100%");

  sheet2.mergeCells("A1:D1");
  const titleCell2 = sheet2.getCell("A1");
  titleCell2.value = `DAFTAR APRESIASI SISWA HADIR 100% - KELAS ${classInfo.name}`;
  titleCell2.font = { name: "Arial", size: 14, bold: true, color: { argb: "FF264663" } };
  titleCell2.alignment = { horizontal: "center", vertical: "middle" };
  sheet2.getRow(1).height = 28;

  sheet2.mergeCells("A2:D2");
  const subCell2 = sheet2.getCell("A2");
  subCell2.value = `Siswa dengan 0 ketidakhadiran (Izin, Sakit, Alpa) pada periode: ${dateRangeLabel}`;
  subCell2.font = { name: "Arial", size: 10, italic: true };
  subCell2.alignment = { horizontal: "center", vertical: "middle" };
  sheet2.getRow(2).height = 20;

  if (logoImageId !== null && logoDims) {
    sheet2.addImage(logoImageId, {
      tl: { col: 0.15, row: 0.15 },
      ext: { width: Math.round(logoDims.width), height: Math.round(logoDims.height) },
    });
  }

  sheet2.addRow([]);

  const headerRow2 = sheet2.addRow(["No", "NIS", "Nama Siswa", "Keterangan Kehadiran"]);
  headerRow2.height = 24;

  headerRow2.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF264663" },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });

  students100Percent.forEach((s, idx) => {
    const row = sheet2.addRow([idx + 1, s.nis || "-", s.name, "Hadir 100% (Tanpa Ketidakhadiran)"]);
    row.getCell(1).alignment = { horizontal: "center" };
    row.getCell(2).alignment = { horizontal: "center" };
    row.getCell(4).alignment = { horizontal: "center" };

    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE6DDD2" } },
        left: { style: "thin", color: { argb: "FFE6DDD2" } },
        bottom: { style: "thin", color: { argb: "FFE6DDD2" } },
        right: { style: "thin", color: { argb: "FFE6DDD2" } },
      };
    });
  });

  sheet2.columns = [
    { width: 8 },
    { width: 16 },
    { width: 36 },
    { width: 34 },
  ];

  return workbook;
}

export async function exportAttendanceExcel(params: ExportExcelParams) {
  const workbook = await buildAttendanceExcelWorkbook(params);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Rekap_Kehadiran_${params.classInfo.slug}_${Date.now()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface ExportRosterParams {
  classNameTitle: string;
  academicYear?: string;
  studentsList: Student[];
  logoUrl?: string | null;
}

export async function exportStudentRosterExcel({
  classNameTitle,
  academicYear = "2026/2027",
  studentsList,
  logoUrl,
}: ExportRosterParams) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sistem Surat Izin & Ketidakhadiran Siswa";
  workbook.created = new Date();

  const logoInfo = await resolveExportLogo(logoUrl);

  const sheet = workbook.addWorksheet("Daftar Siswa");

  sheet.mergeCells("A1:D1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = `DAFTAR SISWA KELAS ${classNameTitle.toUpperCase()}`;
  titleCell.font = { name: "Arial", size: 14, bold: true, color: { argb: "FF264663" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 28;

  sheet.mergeCells("A2:D2");
  const subCell = sheet.getCell("A2");
  subCell.value = `Tahun Ajaran: ${academicYear} | Total: ${studentsList.length} Siswa`;
  subCell.font = { name: "Arial", size: 10, italic: true };
  subCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(2).height = 20;

  if (logoInfo) {
    const logoImageId = workbook.addImage({
      base64: logoInfo.base64,
      extension: logoInfo.extension,
    });
    const logoDims = calculateProportionalDimensions(
      logoInfo.width,
      logoInfo.height,
      68,
      50
    );
    sheet.addImage(logoImageId, {
      tl: { col: 0.15, row: 0.15 },
      ext: { width: Math.round(logoDims.width), height: Math.round(logoDims.height) },
    });
  }

  sheet.addRow([]);

  const headerRow = sheet.addRow(["No", "NIS", "Nama Lengkap Siswa", "Status"]);
  headerRow.height = 24;

  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF264663" },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });

  studentsList.forEach((st, idx) => {
    const row = sheet.addRow([
      idx + 1,
      st.nis || "-",
      st.name,
      st.isActive ? "Aktif" : "Diarsipkan",
    ]);

    row.getCell(1).alignment = { horizontal: "center" };
    row.getCell(2).alignment = { horizontal: "center" };
    row.getCell(4).alignment = { horizontal: "center" };

    if (!st.isActive) {
      row.getCell(4).font = { color: { argb: "FF962326" }, italic: true };
    }

    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE6DDD2" } },
        left: { style: "thin", color: { argb: "FFE6DDD2" } },
        bottom: { style: "thin", color: { argb: "FFE6DDD2" } },
        right: { style: "thin", color: { argb: "FFE6DDD2" } },
      };
    });
  });

  sheet.columns = [
    { width: 8 },
    { width: 16 },
    { width: 38 },
    { width: 16 },
  ];

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Daftar_Siswa_${classNameTitle.replace(/\s+/g, "_")}_${Date.now()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function downloadStudentImportTemplate(classNameTitle = "Kelas") {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sistem Surat Izin & Ketidakhadiran Siswa";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Format Import Siswa");

  sheet.mergeCells("A1:C1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = `FORMAT IMPOR SISWA - ${classNameTitle.toUpperCase()}`;
  titleCell.font = { name: "Arial", size: 13, bold: true, color: { argb: "FF264663" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 24;

  sheet.mergeCells("A2:C2");
  const subCell = sheet.getCell("A2");
  subCell.value =
    "Petunjuk: Isi kolom NIS (opsional) dan Nama Lengkap Siswa (wajib). Baris contoh di bawah dapat dihapus atau diganti.";
  subCell.font = { name: "Arial", size: 9, italic: true, color: { argb: "FF555555" } };
  subCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(2).height = 18;

  sheet.addRow([]);

  const headerRow = sheet.addRow(["No", "NIS", "Nama Lengkap Siswa"]);
  headerRow.height = 24;

  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF264663" },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });

  const sampleRows = [
    [1, "10291", "Aditya Pratama"],
    [2, "10292", "Bunga Citra Lestari"],
    [3, "10293", "Christian Felix Sutanto"],
    [4, "10294", "Davin Immanuel Abraham"],
    [5, "", "Erika Putri (Contoh Tanpa NIS)"],
  ];

  sampleRows.forEach((rowValues) => {
    const row = sheet.addRow(rowValues);
    row.height = 20;
    row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(3).alignment = { horizontal: "left", vertical: "middle" };

    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE6DDD2" } },
        left: { style: "thin", color: { argb: "FFE6DDD2" } },
        bottom: { style: "thin", color: { argb: "FFE6DDD2" } },
        right: { style: "thin", color: { argb: "FFE6DDD2" } },
      };
    });
  });

  sheet.columns = [
    { width: 8 },
    { width: 18 },
    { width: 38 },
  ];

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Format_Import_Siswa_${classNameTitle.replace(/\s+/g, "_")}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
