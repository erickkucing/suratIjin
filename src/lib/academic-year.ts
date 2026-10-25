/**
 * Logika perhitungan otomatis Kalender Akademik Sekolah:
 * - Semester Ganjil: Bulan Juli (7) s/d Desember (12)
 * - Semester Genap: Bulan Januari (1) s/d Juni (6)
 * - Tahun Ajaran: Dimulai bulan Juli (semester ganjil) sampai Juni tahun berikutnya (semester genap)
 *   Contoh:
 *     - 25 Oktober 2026 -> Semester Ganjil, Tahun Ajaran 2026/2027
 *     - 15 Februari 2027 -> Semester Genap, Tahun Ajaran 2026/2027
 *     - 10 Juli 2027     -> Semester Ganjil, Tahun Ajaran 2027/2028
 */

export interface AcademicPeriodInfo {
  periodTitle: "Semester Ganjil" | "Semester Genap" | string;
  academicYear: string;
  semester: "ganjil" | "genap";
  startYear: number;
  endYear: number;
}

export function getAutoAcademicPeriod(date: Date = new Date()): AcademicPeriodInfo {
  const month = date.getMonth() + 1; // 1 (Januari) - 12 (Desember)
  const year = date.getFullYear();

  const isGanjil = month >= 7 && month <= 12;

  if (isGanjil) {
    const startYear = year;
    const endYear = year + 1;
    return {
      periodTitle: "Semester Ganjil",
      academicYear: `${startYear}/${endYear}`,
      semester: "ganjil",
      startYear,
      endYear,
    };
  } else {
    const startYear = year - 1;
    const endYear = year;
    return {
      periodTitle: "Semester Genap",
      academicYear: `${startYear}/${endYear}`,
      semester: "genap",
      startYear,
      endYear,
    };
  }
}

export function isAutoPeriod(
  periodTitle: string,
  academicYear: string,
  date: Date = new Date()
): boolean {
  const auto = getAutoAcademicPeriod(date);
  return (
    periodTitle.trim().toLowerCase() === auto.periodTitle.toLowerCase() &&
    academicYear.trim() === auto.academicYear
  );
}
