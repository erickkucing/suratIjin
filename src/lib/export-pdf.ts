"use client";

import { AttendanceRecordWithStudent } from "@/db/queries";
import { Student, ClassItem } from "@/db/schema";
import { StudentRecapItem } from "./attendance-stats";
import { resolveExportLogo, calculateProportionalDimensions } from "./export-logo";

export interface ExportPdfParams {
  classInfo: ClassItem;
  teacherName?: string;
  records: AttendanceRecordWithStudent[];
  students100Percent: Student[];
  studentRecap?: StudentRecapItem[];
  dateRangeLabel: string;
  logoUrl?: string | null;
}

export async function exportAttendancePdf({
  classInfo,
  teacherName = "Wali Kelas",
  records,
  students100Percent,
  studentRecap = [],
  dateRangeLabel,
  logoUrl,
}: ExportPdfParams) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const terracottaColor = [181, 72, 38] as [number, number, number];
  const slateColor = [38, 70, 99] as [number, number, number];
  const charcoalColor = [35, 31, 30] as [number, number, number];
  const mutedColor = [87, 79, 74] as [number, number, number];

  const headerBannerHeight = 30;
  doc.setFillColor(...terracottaColor);
  doc.rect(0, 0, 210, headerBannerHeight, "F");

  // Logo rendering dengan ukuran proporsional
  const logoInfo = await resolveExportLogo(logoUrl);
  const { width: logoW, height: logoH } = calculateProportionalDimensions(
    logoInfo.width,
    logoInfo.height,
    24,
    22
  );
  const logoX = 14;
  const logoY = (headerBannerHeight - logoH) / 2;

  try {
    const format = logoInfo.extension === "jpeg" ? "JPEG" : "PNG";
    doc.addImage(logoInfo.base64, format, logoX, logoY, logoW, logoH, undefined, "FAST");
  } catch (err) {
    console.error("Gagal menambahkan logo ke PDF:", err);
  }

  const textStartX = logoX + logoW + 4;
  const textEndX = 196;
  const textCenterX = (textStartX + textEndX) / 2;

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13.5);
  doc.text("REKAPITULASI SURAT IZIN & KETIDAKHADIRAN SISWA", textCenterX, 13, { align: "center" });

  doc.setFontSize(9.5);
  doc.setFont("helvetica", "normal");
  doc.text(`KELAS: ${classInfo.name} | ${classInfo.academicYear} - ${classInfo.periodTitle}`, textCenterX, 20.5, {
    align: "center",
  });

  doc.setTextColor(...charcoalColor);
  doc.setFontSize(9);
  doc.text(`Periode Filter : ${dateRangeLabel}`, 14, 38);
  doc.text(`Wali Kelas     : ${teacherName}`, 14, 44);
  const printDate = new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  doc.text(`Dicetak Pada   : ${printDate}`, 14, 50);

  const alpaCount = records.filter((r) => r.status === "Alpa").length;
  const izinCount = records.filter((r) => r.status === "Izin").length;
  const sakitCount = records.filter((r) => r.status === "Sakit").length;

  doc.setFont("helvetica", "bold");
  doc.text(
    `Total: ${records.length} Catatan (Izin: ${izinCount}, Sakit: ${sakitCount}, Alpa: ${alpaCount})`,
    196,
    38,
    { align: "right" }
  );

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
    startY: 55,
    margin: { left: 14, right: 14 },
    head: [["No", "Tanggal", "Nama Siswa", "Status", "Info Dari", "Keterangan", "Surat"]],
    body: tableData.length > 0 ? tableData : [["-", "-", "Tidak ada data ketidakhadiran", "-", "-", "-", "-"]],
    theme: "grid",
    headStyles: {
      fillColor: terracottaColor,
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: "bold",
      halign: "center",
    },
    styles: {
      fontSize: 8,
      cellPadding: 2,
      textColor: charcoalColor,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 24, halign: "center" },
      2: { cellWidth: 48 },
      3: { cellWidth: 18, halign: "center" },
      4: { cellWidth: 26 },
      5: { cellWidth: 40 },
      6: { cellWidth: 16, halign: "center" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 3) {
        const val = data.cell.raw;
        if (val === "Alpa") {
          data.cell.styles.textColor = [150, 35, 38];
          data.cell.styles.fontStyle = "bold";
        }
      }
      if (data.section === "body" && data.column.index === 6) {
        const val = data.cell.raw;
        if (val === "Belum") {
          data.cell.styles.textColor = [181, 72, 38];
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
  });

  if (studentRecap.length > 0) {
    const afterTable1Y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 120;
    if (afterTable1Y > 210) {
      doc.addPage();
    }
    const startYRecap = afterTable1Y > 210 ? 20 : afterTable1Y + 12;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...slateColor);
    doc.text("REKAPITULASI KETIDAKHADIRAN PER SISWA (KEBUTUHAN RAPOR)", 14, startYRecap);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...mutedColor);
    doc.text(
      `Ringkasan jumlah hari Sakit, Izin, dan Alpa tiap siswa aktif (${studentRecap.length} siswa).`,
      14,
      startYRecap + 5
    );

    const recapBody = studentRecap.map((st, idx) => [
      idx + 1,
      st.nis || "-",
      st.name,
      st.sakit,
      st.izin,
      st.alpa,
      st.totalAbsences,
    ]);

    autoTable(doc, {
      startY: startYRecap + 8,
      margin: { left: 14, right: 14 },
      head: [["No", "NIS", "Nama Siswa", "Sakit", "Izin", "Alpa", "Total"]],
      body: recapBody,
      theme: "grid",
      headStyles: {
        fillColor: slateColor,
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: "bold",
        halign: "center",
      },
      styles: {
        fontSize: 8,
        cellPadding: 2,
        textColor: charcoalColor,
      },
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        1: { cellWidth: 26, halign: "center" },
        2: { cellWidth: 74 },
        3: { cellWidth: 18, halign: "center" },
        4: { cellWidth: 18, halign: "center" },
        5: { cellWidth: 18, halign: "center" },
        6: { cellWidth: 18, halign: "center", fontStyle: "bold" },
      },
    });
  }

  const currentY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 180;

  if (currentY > 210) {
    doc.addPage();
  }

  const startYAppreciation = currentY > 210 ? 20 : currentY + 12;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...slateColor);
  doc.text(
    `DAFTAR APRESIASI SISWA HADIR 100% (TANPA KETIDAKHADIRAN)`,
    14,
    startYAppreciation
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...mutedColor);
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
    margin: { left: 14, right: 14 },
    head: [["No", "NIS", "Nama Siswa", "Keterangan Kehadiran"]],
    body: appreciationData.length > 0 ? appreciationData : [["-", "-", "Tidak ada siswa dengan hadir 100%", "-"]],
    theme: "striped",
    headStyles: {
      fillColor: slateColor,
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

  let sigY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 220) + 14;
  if (sigY > 250) {
    doc.addPage();
    sigY = 25;
  }

  doc.setTextColor(...charcoalColor);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Dicetak tanggal: ${printDate}`, 140, sigY);
  doc.text(`Wali Kelas ${classInfo.name},`, 140, sigY + 5);
  doc.setFont("helvetica", "bold");
  doc.text(teacherName, 140, sigY + 26);

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...mutedColor);
    doc.text(
      `Rekap Presensi Kelas ${classInfo.name} (${classInfo.academicYear})`,
      14,
      290
    );
    doc.text(`Halaman ${i} dari ${totalPages}`, 196, 290, { align: "right" });
  }

  const fileName = `Rekap_Kehadiran_${classInfo.slug}_${Date.now()}.pdf`;
  doc.save(fileName);
}
