"use client";

import ExcelJS from "exceljs";
import { AttendanceRecordWithStudent } from "@/db/queries";
import { Student, ClassItem } from "@/db/schema";

export interface ExportExcelParams {
  classInfo: ClassItem;
  teacherName?: string;
  records: AttendanceRecordWithStudent[];
  students100Percent: Student[];
  dateRangeLabel: string;
}

export async function exportAttendanceExcel({
  classInfo,
  teacherName = "Wali Kelas",
  records,
  students100Percent,
  dateRangeLabel,
}: ExportExcelParams) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sistem Surat Izin & Ketidakhadiran Siswa";
  workbook.created = new Date();

  // --- SHEET 1: REKAP KETIDAKHADIRAN ---
  const sheet1 = workbook.addWorksheet("Data Ketidakhadiran");

  // Title block
  sheet1.mergeCells("A1:G1");
  const titleCell = sheet1.getCell("A1");
  titleCell.value = `REKAPITULASI SURAT IZIN & KETIDAKHADIRAN SISWA - KELAS ${classInfo.name}`;
  titleCell.font = { name: "Arial", size: 14, bold: true, color: { argb: "FF1F6F54" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet1.getRow(1).height = 25;

  sheet1.mergeCells("A2:G2");
  const subCell = sheet1.getCell("A2");
  subCell.value = `Periode: ${dateRangeLabel} | Wali Kelas: ${teacherName} | Tahun Ajaran: ${classInfo.academicYear}`;
  subCell.font = { name: "Arial", size: 10, italic: true };
  subCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet1.getRow(2).height = 18;

  sheet1.addRow([]); // Blank row

  // Table Headers
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
      fgColor: { argb: "FF1F6F54" },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });

  // Table Data
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
      row.getCell(4).font = { color: { argb: "FF982613" }, bold: true };
    }
    if (r.letterStatus === "Belum") {
      row.getCell(7).font = { color: { argb: "FFB83B14" }, bold: true };
    }

    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5DDCB" } },
        left: { style: "thin", color: { argb: "FFE5DDCB" } },
        bottom: { style: "thin", color: { argb: "FFE5DDCB" } },
        right: { style: "thin", color: { argb: "FFE5DDCB" } },
      };
    });
  });

  sheet1.columns = [
    { width: 8 },  // No
    { width: 14 }, // Tanggal
    { width: 34 }, // Nama Siswa
    { width: 18 }, // Status
    { width: 18 }, // Info Dari
    { width: 32 }, // Keterangan
    { width: 14 }, // Status Surat
  ];

  // --- SHEET 2: APRESIASI HADIR 100% ---
  const sheet2 = workbook.addWorksheet("Apresiasi Hadir 100%");

  sheet2.mergeCells("A1:D1");
  const titleCell2 = sheet2.getCell("A1");
  titleCell2.value = `DAFTAR APRESIASI SISWA HADIR 100% - KELAS ${classInfo.name}`;
  titleCell2.font = { name: "Arial", size: 14, bold: true, color: { argb: "FF1F6F54" } };
  titleCell2.alignment = { horizontal: "center", vertical: "middle" };
  sheet2.getRow(1).height = 25;

  sheet2.mergeCells("A2:D2");
  const subCell2 = sheet2.getCell("A2");
  subCell2.value = `Siswa dengan 0 ketidakhadiran (Izin, Sakit, Alpa) pada periode: ${dateRangeLabel}`;
  subCell2.font = { name: "Arial", size: 10, italic: true };
  subCell2.alignment = { horizontal: "center", vertical: "middle" };
  sheet2.getRow(2).height = 18;

  sheet2.addRow([]);

  const headerRow2 = sheet2.addRow(["No", "NIS", "Nama Siswa", "Keterangan Kehadiran"]);
  headerRow2.height = 24;

  headerRow2.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2B8A6B" },
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
        top: { style: "thin", color: { argb: "FFE5DDCB" } },
        left: { style: "thin", color: { argb: "FFE5DDCB" } },
        bottom: { style: "thin", color: { argb: "FFE5DDCB" } },
        right: { style: "thin", color: { argb: "FFE5DDCB" } },
      };
    });
  });

  sheet2.columns = [
    { width: 8 },  // No
    { width: 16 }, // NIS
    { width: 36 }, // Nama Siswa
    { width: 34 }, // Keterangan
  ];

  // Write buffer and initiate download in browser
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Rekap_Kehadiran_${classInfo.slug}_${Date.now()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
