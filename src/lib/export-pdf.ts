"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { AttendanceRecordWithStudent } from "@/db/queries";
import { Student, ClassItem } from "@/db/schema";

export interface ExportPdfParams {
  classInfo: ClassItem;
  teacherName?: string;
  records: AttendanceRecordWithStudent[];
  students100Percent: Student[];
  dateRangeLabel: string;
}

export function exportAttendancePdf({
  classInfo,
  teacherName = "Wali Kelas",
  records,
  students100Percent,
  dateRangeLabel,
}: ExportPdfParams) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const primaryColor = [31, 111, 84] as [number, number, number]; // Chalkboard green

  // 1. Header Banner
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, 210, 26, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("REKAPITULASI SURAT IZIN & KETIDAKHADIRAN SISWA", 105, 11, { align: "center" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`KELAS: ${classInfo.name} | ${classInfo.academicYear} - ${classInfo.periodTitle}`, 105, 18, {
    align: "center",
  });

  // 2. Metadata Box
  doc.setTextColor(30, 42, 38);
  doc.setFontSize(9);
  doc.text(`Periode Filter : ${dateRangeLabel}`, 14, 34);
  doc.text(`Wali Kelas     : ${teacherName}`, 14, 40);
  doc.text(`Dicetak Pada   : ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`, 14, 46);

  // Summary counts
  const alpaCount = records.filter((r) => r.status === "Alpa").length;
  const izinCount = records.filter((r) => r.status === "Izin").length;
  const sakitCount = records.filter((r) => r.status === "Sakit").length;

  doc.setFont("helvetica", "bold");
  doc.text(
    `Total: ${records.length} Catatan (Izin: ${izinCount}, Sakit: ${sakitCount}, Alpa: ${alpaCount})`,
    196,
    34,
    { align: "right" }
  );

  // 3. Attendance Table
  const tableData = records.map((r, idx) => [
    idx + 1,
    r.attendanceDate,
    r.studentName,
    r.status,
    r.infoSource,
    r.description || "-",
    r.letterStatus,
  ]);

  autoTable(doc, {
    startY: 50,
    head: [["No", "Tanggal", "Nama Siswa", "Status", "Info Dari", "Keterangan", "Surat"]],
    body: tableData.length > 0 ? tableData : [["-", "-", "Tidak ada data ketidakhadiran", "-", "-", "-", "-"]],
    theme: "grid",
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: "bold",
      halign: "center",
    },
    styles: {
      fontSize: 8,
      cellPadding: 2,
      textColor: [30, 42, 38],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 24, halign: "center" },
      2: { cellWidth: 50 },
      3: { cellWidth: 18, halign: "center" },
      4: { cellWidth: 26 },
      5: { cellWidth: 42 },
      6: { cellWidth: 16, halign: "center" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 3) {
        const val = data.cell.raw;
        if (val === "Alpa") {
          data.cell.styles.textColor = [152, 38, 19];
          data.cell.styles.fontStyle = "bold";
        }
      }
      if (data.section === "body" && data.column.index === 6) {
        const val = data.cell.raw;
        if (val === "Belum") {
          data.cell.styles.textColor = [184, 59, 20];
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
  });

  // 4. Section 2: 100% Attendance Appreciation Table on Next Page or after table
  const currentY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 180;
  
  if (currentY > 210) {
    doc.addPage();
  }

  const startYAppreciation = currentY > 210 ? 20 : currentY + 12;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...primaryColor);
  doc.text(
    `DAFTAR APRESIASI SISWA HADIR 100% (TANPA KETIDAKHADIRAN)`,
    14,
    startYAppreciation
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(74, 86, 81);
  doc.text(
    `Siswa berikut memiliki rekor kehadiran sempurna selama periode yang dipilih (${students100Percent.length} siswa).`,
    14,
    startYAppreciation + 5
  );

  const appreciationData = students100Percent.map((s, idx) => [
    idx + 1,
    s.nis || "-",
    s.name,
    "Hadir 100%",
  ]);

  autoTable(doc, {
    startY: startYAppreciation + 8,
    head: [["No", "NIS", "Nama Siswa", "Keterangan Kehadiran"]],
    body: appreciationData.length > 0 ? appreciationData : [["-", "-", "Tidak ada siswa dengan hadir 100%", "-"]],
    theme: "striped",
    headStyles: {
      fillColor: [43, 138, 107],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: "bold",
    },
    styles: {
      fontSize: 8,
      cellPadding: 2,
    },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      1: { cellWidth: 30, halign: "center" },
      2: { cellWidth: 90 },
      3: { cellWidth: 50, halign: "center" },
    },
  });

  const fileName = `Rekap_Kehadiran_${classInfo.slug}_${Date.now()}.pdf`;
  doc.save(fileName);
}
