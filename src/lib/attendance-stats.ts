import { Student } from "@/db/schema";
import { AttendanceRecordWithStudent, MonthlyChartData } from "@/db/queries";

export interface StudentRecapItem {
  studentId: number;
  nis: string | null;
  name: string;
  sakit: number;
  izin: number;
  alpa: number;
  totalAbsences: number;
  suratBelum: number;
}

export interface DynamicDashboardMetricsInput {
  studentsList: Student[];
  records: AttendanceRecordWithStudent[];
  dateStart?: string;
  dateEnd?: string;
}

export interface DynamicDashboardMetricsResult {
  activeStudents: Student[];
  recordsInDateRange: AttendanceRecordWithStudent[];
  summary: {
    totalAlpa: number;
    totalIzin: number;
    totalSakit: number;
    totalSuratBelum: number;
    totalRecords: number;
  };
  monthlyChart: MonthlyChartData[];
  students100Percent: Student[];
  studentRecap: StudentRecapItem[];
}

const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export function computeDynamicDashboardMetrics({
  studentsList,
  records,
  dateStart,
  dateEnd,
}: DynamicDashboardMetricsInput): DynamicDashboardMetricsResult {
  const activeStudents = studentsList
    .filter((s) => s.isActive)
    .sort((a, b) => a.name.localeCompare(b.name, "id"));

  const recordsInDateRange = records.filter((r) => {
    if (dateStart && r.attendanceDate < dateStart) return false;
    if (dateEnd && r.attendanceDate > dateEnd) return false;
    return true;
  });

  let totalAlpa = 0;
  let totalIzin = 0;
  let totalSakit = 0;
  let totalSuratBelum = 0;

  const monthlyMap = new Map<
    string,
    { izin: number; sakit: number; alpa: number; total: number }
  >();
  const studentStatsMap = new Map<
    number,
    { sakit: number; izin: number; alpa: number; suratBelum: number }
  >();

  for (const r of recordsInDateRange) {
    if (r.status === "Alpa") totalAlpa++;
    else if (r.status === "Izin") totalIzin++;
    else if (r.status === "Sakit") totalSakit++;

    if (
      (r.status === "Izin" || r.status === "Sakit") &&
      r.letterStatus === "Belum"
    ) {
      totalSuratBelum++;
    }

    const monthKey = r.attendanceDate.slice(0, 7);
    const monthAcc = monthlyMap.get(monthKey) || {
      izin: 0,
      sakit: 0,
      alpa: 0,
      total: 0,
    };
    if (r.status === "Izin") monthAcc.izin++;
    else if (r.status === "Sakit") monthAcc.sakit++;
    else if (r.status === "Alpa") monthAcc.alpa++;
    monthAcc.total++;
    monthlyMap.set(monthKey, monthAcc);

    const stAcc = studentStatsMap.get(r.studentId) || {
      sakit: 0,
      izin: 0,
      alpa: 0,
      suratBelum: 0,
    };
    if (r.status === "Sakit") stAcc.sakit++;
    else if (r.status === "Izin") stAcc.izin++;
    else if (r.status === "Alpa") stAcc.alpa++;
    if (
      (r.status === "Izin" || r.status === "Sakit") &&
      r.letterStatus === "Belum"
    ) {
      stAcc.suratBelum++;
    }
    studentStatsMap.set(r.studentId, stAcc);
  }

  const monthlyChart: MonthlyChartData[] = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthYear, counts]) => {
      const [y, m] = monthYear.split("-");
      const mIdx = parseInt(m, 10) - 1;
      const label = `${MONTH_NAMES[mIdx] || m} ${y}`;
      return {
        month: monthYear,
        label,
        izin: counts.izin,
        sakit: counts.sakit,
        alpa: counts.alpa,
        total: counts.total,
      };
    });

  const studentRecap: StudentRecapItem[] = activeStudents.map((st) => {
    const counts = studentStatsMap.get(st.id) || {
      sakit: 0,
      izin: 0,
      alpa: 0,
      suratBelum: 0,
    };
    return {
      studentId: st.id,
      nis: st.nis,
      name: st.name,
      sakit: counts.sakit,
      izin: counts.izin,
      alpa: counts.alpa,
      totalAbsences: counts.sakit + counts.izin + counts.alpa,
      suratBelum: counts.suratBelum,
    };
  });

  const students100Percent = activeStudents.filter((st) => {
    const counts = studentStatsMap.get(st.id);
    if (!counts) return true;
    return counts.sakit + counts.izin + counts.alpa === 0;
  });

  return {
    activeStudents,
    recordsInDateRange,
    summary: {
      totalAlpa,
      totalIzin,
      totalSakit,
      totalSuratBelum,
      totalRecords: recordsInDateRange.length,
    },
    monthlyChart,
    students100Percent,
    studentRecap,
  };
}
