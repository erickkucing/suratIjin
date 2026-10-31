/**
 * Attendance Anomaly Detector & Early Warning Rule Engine
 *
 * Pure local mathematical calculation engine evaluated in <= 5ms with zero external network dependencies.
 * Runs identically in Node.js server routes and browser client state (0ms alert banner).
 *
 * Rules:
 * 1. MON_FRI_PATTERN: >= 50% absences on Mon/Fri (min 3 total absences, min 2 Mon/Fri)
 * 2. UNEXCUSED_ALPA: >= 3 days Alpa (Waspada: 3-4, Kritis: >= 5)
 * 3. PENDING_DOCTOR_NOTE: >= 3 consecutive sick days with pending doctor note (letterStatus == "Belum"),
 *    bridging Fri->Mon (3 days diff) and Sat->Mon (2 days diff)
 * 4. CHRONIC_ABSENCE: >= 5 total days in a single month (Waspada: 5-7, Kritis: >= 8)
 *
 * Urgency Hierarchy: Kritis > Waspada > Perhatian
 */

export type AnomalyUrgency = "Kritis" | "Waspada" | "Perhatian";

export type AnomalyType =
  | "MON_FRI_PATTERN"
  | "UNEXCUSED_ALPA"
  | "PENDING_DOCTOR_NOTE"
  | "CHRONIC_ABSENCE";

export interface AnomalyStudentInput {
  id: number;
  name: string;
  nis?: string | null;
  isActive?: boolean;
}

export interface AnomalyRecordInput {
  id?: number;
  studentId: number;
  attendanceDate: string; // "YYYY-MM-DD"
  status: "Izin" | "Sakit" | "Alpa" | string;
  letterStatus?: "Sudah" | "Belum" | string | null;
  description?: string | null;
}

export interface AnomalyDetectionOptions {
  period?: "month" | "semester" | "custom" | string;
  targetMonth?: string; // "YYYY-MM"
  dateStart?: string; // "YYYY-MM-DD"
  dateEnd?: string; // "YYYY-MM-DD"
  includeInactive?: boolean;
}

export interface AtRiskStudent {
  studentId: number;
  studentName: string;
  nis: string | null;
  urgency: AnomalyUrgency;
  anomalyTypes: AnomalyType[];
  ruleDescriptions: string[];
  stats: {
    alpa: number;
    izin: number;
    sakit: number;
    total: number;
    pendingLetters: number;
    mondayFridayRatio: number;
    consecutiveSickDays: number;
    maxMonthlyAbsence: number;
  };
}

export type StudentAnomalyItem = AtRiskStudent;

export interface DayOfWeekDistribution {
  senin: number;
  selasa: number;
  rabu: number;
  kamis: number;
  jumat: number;
  sabtu: number;
}

export interface AnomalySummary {
  totalActiveStudents: number;
  totalAtRiskStudents: number;
  kritisCount: number;
  waspadaCount: number;
  perhatianCount: number;
  ruleBreakdown: {
    mondayFridayPattern: number;
    unexcusedAlpa: number;
    pendingDoctorNote: number;
    chronicAbsence: number;
  };
  dayOfWeekDistribution?: DayOfWeekDistribution;
  doctorNoteCompliancePercent?: number;
  peakAbsenceDay?: string | null;
}

export interface AnomalyDetectionResult {
  summary: AnomalySummary;
  atRiskStudents: AtRiskStudent[];
}

const URGENCY_PRIORITY: Record<AnomalyUrgency, number> = {
  Kritis: 3,
  Waspada: 2,
  Perhatian: 1,
};

const INDONESIAN_MONTHS = [
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

function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-");
  const idx = parseInt(m, 10) - 1;
  return `${INDONESIAN_MONTHS[idx] || m} ${y}`;
}

// Fast zero-allocation day of week (0=Sunday, 1=Monday, ..., 6=Saturday) via Sakamoto's algorithm
function getFastDayOfWeek(y: number, m: number, d: number): number {
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  let year = y;
  if (m < 3) year -= 1;
  return (year + Math.floor(year / 4) - Math.floor(year / 100) + Math.floor(year / 400) + t[m - 1] + d) % 7;
}

export function detectAttendanceAnomalies(
  students: AnomalyStudentInput[],
  records: AnomalyRecordInput[],
  options: AnomalyDetectionOptions = {}
): AnomalyDetectionResult {
  const activeStudents = options.includeInactive
    ? students
    : students.filter((s) => s.isActive !== false);

  // 1. Date range filtering and fast input sanitization
  const filteredRecords = records.filter((r) => {
    if (!r.attendanceDate || r.attendanceDate.length !== 10) return false;
    if (options.targetMonth && !r.attendanceDate.startsWith(options.targetMonth)) return false;
    if (options.dateStart && r.attendanceDate < options.dateStart) return false;
    if (options.dateEnd && r.attendanceDate > options.dateEnd) return false;
    return true;
  });

  // 2. Map student records and deduplicate same-day records
  const studentRecordsMap = new Map<number, AnomalyRecordInput[]>();
  for (const st of activeStudents) {
    studentRecordsMap.set(st.id, []);
  }

  // Deduplication resolution: Alpa (3) > Sakit (2) > Izin (1)
  const severityWeight = (st: string) => (st === "Alpa" ? 3 : st === "Sakit" ? 2 : 1);
  const dedupMap = new Map<string, AnomalyRecordInput>();

  for (const r of filteredRecords) {
    if (!studentRecordsMap.has(r.studentId)) continue;
    const key = `${r.studentId}:${r.attendanceDate}`;
    const existing = dedupMap.get(key);
    if (!existing) {
      dedupMap.set(key, { ...r });
    } else {
      const existingWeight = severityWeight(existing.status);
      const incomingWeight = severityWeight(r.status);
      const higherStatus = incomingWeight > existingWeight ? r.status : existing.status;
      const preservedLetterStatus =
        existing.letterStatus === "Belum" || r.letterStatus === "Belum" ? "Belum" : existing.letterStatus;
      dedupMap.set(key, {
        ...existing,
        status: higherStatus,
        letterStatus: preservedLetterStatus,
      });
    }
  }

  // Class-wide day of week distribution & compliance stats (Single pass for high-volume benchmark < 50ms)
  const dayOfWeekDistribution: DayOfWeekDistribution = {
    senin: 0,
    selasa: 0,
    rabu: 0,
    kamis: 0,
    jumat: 0,
    sabtu: 0,
  };
  let totalSakitAll = 0;
  let totalSuratBelumAll = 0;

  for (const r of dedupMap.values()) {
    studentRecordsMap.get(r.studentId)?.push(r);

    const y = parseInt(r.attendanceDate.slice(0, 4), 10);
    const m = parseInt(r.attendanceDate.slice(5, 7), 10);
    const d = parseInt(r.attendanceDate.slice(8, 10), 10);
    const dow = getFastDayOfWeek(y, m, d);
    if (dow === 1) dayOfWeekDistribution.senin++;
    else if (dow === 2) dayOfWeekDistribution.selasa++;
    else if (dow === 3) dayOfWeekDistribution.rabu++;
    else if (dow === 4) dayOfWeekDistribution.kamis++;
    else if (dow === 5) dayOfWeekDistribution.jumat++;
    else if (dow === 6) dayOfWeekDistribution.sabtu++;

    if (r.status === "Sakit") {
      totalSakitAll++;
      if (r.letterStatus === "Belum") {
        totalSuratBelumAll++;
      }
    }
  }

  const daysRanking = [
    { name: "Senin", count: dayOfWeekDistribution.senin },
    { name: "Selasa", count: dayOfWeekDistribution.selasa },
    { name: "Rabu", count: dayOfWeekDistribution.rabu },
    { name: "Kamis", count: dayOfWeekDistribution.kamis },
    { name: "Jumat", count: dayOfWeekDistribution.jumat },
    { name: "Sabtu", count: dayOfWeekDistribution.sabtu },
  ];
  daysRanking.sort((a, b) => b.count - a.count);
  const peakAbsenceDay = daysRanking[0].count > 0 ? `${daysRanking[0].name} (${daysRanking[0].count} kejadian)` : null;
  const doctorNoteCompliancePercent =
    totalSakitAll > 0
      ? Math.round(((totalSakitAll - totalSuratBelumAll) / totalSakitAll) * 100)
      : 100;

  const atRiskStudents: AtRiskStudent[] = [];
  const ruleBreakdown = {
    mondayFridayPattern: 0,
    unexcusedAlpa: 0,
    pendingDoctorNote: 0,
    chronicAbsence: 0,
  };

  // 3. Evaluate each student against the 4 anomaly rules
  for (const st of activeStudents) {
    const sRecords = (studentRecordsMap.get(st.id) || []).sort((a, b) =>
      a.attendanceDate.localeCompare(b.attendanceDate)
    );

    let alpa = 0;
    let izin = 0;
    let sakit = 0;
    let pendingLetters = 0;
    let monFriCount = 0;

    const monthlyMap = new Map<string, number>();

    for (const r of sRecords) {
      if (r.status === "Alpa") alpa++;
      else if (r.status === "Izin") izin++;
      else if (r.status === "Sakit") sakit++;

      if ((r.status === "Izin" || r.status === "Sakit") && r.letterStatus === "Belum") {
        pendingLetters++;
      }

      // Monday/Friday calculation in UTC
      const y = parseInt(r.attendanceDate.slice(0, 4), 10);
      const m = parseInt(r.attendanceDate.slice(5, 7), 10);
      const d = parseInt(r.attendanceDate.slice(8, 10), 10);
      const dayOfWeek = getFastDayOfWeek(y, m, d);
      if (dayOfWeek === 1 || dayOfWeek === 5) {
        monFriCount++;
      }

      // Monthly aggregation
      const mKey = r.attendanceDate.slice(0, 7);
      monthlyMap.set(mKey, (monthlyMap.get(mKey) || 0) + 1);
    }

    const total = alpa + izin + sakit;
    const mondayFridayRatio = total > 0 ? monFriCount / total : 0;

    // Consecutive sick days with pending doctor note (letterStatus == "Belum")
    const pendingSickRecords = sRecords.filter(
      (r) => r.status === "Sakit" && r.letterStatus === "Belum"
    );

    let maxConsecutiveSickDays = 0;
    if (pendingSickRecords.length > 0) {
      let currentStreak = 1;
      maxConsecutiveSickDays = 1;
      for (let i = 1; i < pendingSickRecords.length; i++) {
        const prev = pendingSickRecords[i - 1].attendanceDate;
        const curr = pendingSickRecords[i].attendanceDate;
        const [y1, m1, d1] = prev.split("-").map(Number);
        const [y2, m2, d2] = curr.split("-").map(Number);
        const utc1 = Date.UTC(y1, m1 - 1, d1);
        const utc2 = Date.UTC(y2, m2 - 1, d2);
        const diffDays = Math.round((utc2 - utc1) / 86400000);

        const dow1 = new Date(utc1).getUTCDay();
        const dow2 = new Date(utc2).getUTCDay();

        const isConsecutive =
          diffDays === 1 ||
          (diffDays === 3 && dow1 === 5 && dow2 === 1) || // Friday -> Monday
          (diffDays === 2 && dow1 === 6 && dow2 === 1); // Saturday -> Monday

        if (isConsecutive) {
          currentStreak++;
          if (currentStreak > maxConsecutiveSickDays) {
            maxConsecutiveSickDays = currentStreak;
          }
        } else if (diffDays > 0) {
          currentStreak = 1;
        }
      }
    }

    // Monthly max
    let maxMonthlyAbsence = 0;
    let worstMonthKey = "";
    for (const [mKey, count] of monthlyMap.entries()) {
      if (count > maxMonthlyAbsence) {
        maxMonthlyAbsence = count;
        worstMonthKey = mKey;
      }
    }

    // Rule Trigger Evaluation
    const triggeredTypes: AnomalyType[] = [];
    const triggeredDescriptions: string[] = [];
    const triggeredUrgencies: AnomalyUrgency[] = [];

    // Rule 1: Mon/Fri Pattern (min 3 total absences, min 2 Mon/Fri, >= 50%)
    if (total >= 3 && monFriCount >= 2 && mondayFridayRatio >= 0.5) {
      triggeredTypes.push("MON_FRI_PATTERN");
      const pct = Math.round(mondayFridayRatio * 100);
      triggeredDescriptions.push(
        `Pola ketidakhadiran berulang pada hari Senin/Jumat (${monFriCount} dari ${total} hari, ${pct}%).`
      );
      triggeredUrgencies.push(monFriCount >= 4 && mondayFridayRatio >= 0.65 ? "Waspada" : "Perhatian");
      ruleBreakdown.mondayFridayPattern++;
    }

    // Rule 2: Unexcused Alpa (>= 3 Waspada, >= 5 Kritis)
    if (alpa >= 3) {
      triggeredTypes.push("UNEXCUSED_ALPA");
      const isCritical = alpa >= 5;
      triggeredDescriptions.push(
        `Akumulasi ${alpa} hari Alpa (tanpa keterangan) - ${
          isCritical
            ? "Memerlukan penanganan darurat dan koordinasi pihak sekolah/BK."
            : "Memerlukan tindak lanjut dan konfirmasi wali kelas."
        }`
      );
      triggeredUrgencies.push(isCritical ? "Kritis" : "Waspada");
      ruleBreakdown.unexcusedAlpa++;
    }

    // Rule 3: Pending Doctor Note (Consecutive Sick Days >= 3)
    if (maxConsecutiveSickDays >= 3) {
      triggeredTypes.push("PENDING_DOCTOR_NOTE");
      const isCritical = maxConsecutiveSickDays >= 5;
      triggeredDescriptions.push(
        `Sakit berturut-turut ${maxConsecutiveSickDays} hari dengan surat keterangan dokter masih tertunda (status Belum).`
      );
      triggeredUrgencies.push(isCritical ? "Kritis" : "Waspada");
      ruleBreakdown.pendingDoctorNote++;
    }

    // Rule 4: Chronic Absence (>= 5 in single month)
    if (maxMonthlyAbsence >= 5) {
      triggeredTypes.push("CHRONIC_ABSENCE");
      const isCritical = maxMonthlyAbsence >= 8;
      const monthLabel = worstMonthKey ? formatMonthLabel(worstMonthKey) : "bulan ini";
      triggeredDescriptions.push(
        `Total ${maxMonthlyAbsence} hari tidak hadir pada ${monthLabel} (ambang batas: 5 hari/bulan).`
      );
      triggeredUrgencies.push(isCritical ? "Kritis" : "Waspada");
      ruleBreakdown.chronicAbsence++;
    }

    if (triggeredTypes.length > 0) {
      // Determine highest urgency
      let highestUrgency: AnomalyUrgency = "Perhatian";
      let highestPriority = 0;
      for (const urg of triggeredUrgencies) {
        const p = URGENCY_PRIORITY[urg];
        if (p > highestPriority) {
          highestPriority = p;
          highestUrgency = urg;
        }
      }

      // Hardening: Multi-Factor Risk Scoring Escalation
      // When multiple distinct risk rules trigger simultaneously
      if (triggeredTypes.length >= 2 && highestUrgency === "Perhatian") {
        highestUrgency = "Waspada";
      }

      atRiskStudents.push({
        studentId: st.id,
        studentName: st.name,
        nis: st.nis || null,
        urgency: highestUrgency,
        anomalyTypes: triggeredTypes,
        ruleDescriptions: triggeredDescriptions,
        stats: {
          alpa,
          izin,
          sakit,
          total,
          pendingLetters,
          mondayFridayRatio,
          consecutiveSickDays: maxConsecutiveSickDays,
          maxMonthlyAbsence,
        },
      });
    }
  }

  // 4. Sort at-risk students: Urgency descending > total absences descending > name ascending
  atRiskStudents.sort((a, b) => {
    const diffUrgency = URGENCY_PRIORITY[b.urgency] - URGENCY_PRIORITY[a.urgency];
    if (diffUrgency !== 0) return diffUrgency;
    const diffTotal = b.stats.total - a.stats.total;
    if (diffTotal !== 0) return diffTotal;
    return a.studentName.localeCompare(b.studentName, "id");
  });

  const summary: AnomalySummary = {
    totalActiveStudents: activeStudents.length,
    totalAtRiskStudents: atRiskStudents.length,
    kritisCount: atRiskStudents.filter((s) => s.urgency === "Kritis").length,
    waspadaCount: atRiskStudents.filter((s) => s.urgency === "Waspada").length,
    perhatianCount: atRiskStudents.filter((s) => s.urgency === "Perhatian").length,
    ruleBreakdown,
    dayOfWeekDistribution,
    doctorNoteCompliancePercent,
    peakAbsenceDay,
  };

  return { summary, atRiskStudents };
}

export function detectAtRiskStudents(
  students: AnomalyStudentInput[],
  records: AnomalyRecordInput[],
  options?: AnomalyDetectionOptions
): AtRiskStudent[] {
  return detectAttendanceAnomalies(students, records, options).atRiskStudents;
}
