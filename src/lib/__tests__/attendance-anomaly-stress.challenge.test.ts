import { describe, it, expect } from "vitest";
import {
  detectAttendanceAnomalies,
  detectAtRiskStudents,
  AnomalyStudentInput,
  AnomalyRecordInput,
} from "../attendance-anomaly-detector";

describe("Milestone 3 Challenger: Mathematical Attendance Anomaly Detector Stress & Invariant Harness", () => {
  function formatDate(d: Date): string {
    return d.toISOString().split("T")[0];
  }

  describe("1. Boundary Ratios & Threshold Boundaries (Monday/Friday Pattern)", () => {
    const student: AnomalyStudentInput = {
      id: 101,
      name: "Boundary Ratio Student",
      nis: "NIS-101",
      isActive: true,
    };

    it("should NOT trigger MON_FRI_PATTERN when ratio is 49.975% (just below 50.00%)", () => {
      // 1000 absences on Monday/Friday and 1001 on Tuesday/Wednesday -> total 2001, ratio = 1000/2001 = 0.49975
      const records: AnomalyRecordInput[] = [];
      let base = new Date("2024-01-01T00:00:00Z"); // Monday

      let mfCount = 0;
      let nonMfCount = 0;

      while (mfCount < 1000 || nonMfCount < 1001) {
        const dow = base.getUTCDay();
        const dateStr = formatDate(base);

        if ((dow === 1 || dow === 5) && mfCount < 1000) {
          records.push({ studentId: 101, attendanceDate: dateStr, status: "Izin" });
          mfCount++;
        } else if (dow >= 2 && dow <= 4 && nonMfCount < 1001) {
          records.push({ studentId: 101, attendanceDate: dateStr, status: "Izin" });
          nonMfCount++;
        }
        base.setUTCDate(base.getUTCDate() + 1);
      }

      expect(mfCount).toBe(1000);
      expect(nonMfCount).toBe(1001);
      expect(records.length).toBe(2001);

      const result = detectAttendanceAnomalies([student], records);
      const atRisk = result.atRiskStudents.find((s) => s.studentId === 101);

      // Even if CHRONIC_ABSENCE triggers due to high total, MON_FRI_PATTERN MUST NOT trigger!
      if (atRisk) {
        expect(atRisk.anomalyTypes).not.toContain("MON_FRI_PATTERN");
        expect(atRisk.stats.mondayFridayRatio).toBeLessThan(0.5);
      }
    });

    it("should trigger MON_FRI_PATTERN exactly at 50.00% threshold with total >= 3", () => {
      // 2 Mon/Fri and 2 Tue/Wed -> total = 4, ratio = 2/4 = 0.5000 (50.00%)
      const records: AnomalyRecordInput[] = [
        { studentId: 101, attendanceDate: "2026-10-02", status: "Izin" }, // Friday (1)
        { studentId: 101, attendanceDate: "2026-10-05", status: "Izin" }, // Monday (2)
        { studentId: 101, attendanceDate: "2026-10-06", status: "Izin" }, // Tuesday (3)
        { studentId: 101, attendanceDate: "2026-10-07", status: "Izin" }, // Wednesday (4)
      ];

      const result = detectAttendanceAnomalies([student], records);
      expect(result.atRiskStudents.length).toBe(1);
      const atRisk = result.atRiskStudents[0];
      expect(atRisk.anomalyTypes).toContain("MON_FRI_PATTERN");
      expect(atRisk.stats.mondayFridayRatio).toBe(0.5);
      expect(atRisk.urgency).toBe("Perhatian");
    });

    it("should enforce Waspada boundary strictly at ratio >= 0.65 AND count >= 4", () => {
      // Test 1: Count = 13, Total = 20 -> Ratio = 13/20 = 0.6500 (Waspada)
      const recordsWaspada: AnomalyRecordInput[] = [];
      const mondays = [
        "2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31",
        "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28",
        "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"
      ];
      for (const d of mondays) {
        recordsWaspada.push({ studentId: 101, attendanceDate: d, status: "Izin" });
      }
      const nonMondays = [
        "2026-08-04", "2026-08-11",
        "2026-09-08", "2026-09-15",
        "2026-10-06", "2026-10-13", "2026-10-20"
      ];
      for (const d of nonMondays) {
        recordsWaspada.push({ studentId: 101, attendanceDate: d, status: "Izin" });
      }

      const resWaspada = detectAttendanceAnomalies([student], recordsWaspada);
      const studentWaspada = resWaspada.atRiskStudents[0];
      expect(studentWaspada.stats.mondayFridayRatio).toBe(0.65);
      expect(studentWaspada.anomalyTypes).toContain("MON_FRI_PATTERN");
      expect(studentWaspada.urgency).toBe("Waspada");

      // Test 2: Ratio = 3/4 = 0.75 (> 0.65), but monFriCount = 3 (< 4) -> MUST remain Perhatian
      const recordsPerhatian: AnomalyRecordInput[] = [
        { studentId: 101, attendanceDate: "2026-10-02", status: "Izin" }, // Fri
        { studentId: 101, attendanceDate: "2026-10-05", status: "Izin" }, // Mon
        { studentId: 101, attendanceDate: "2026-10-09", status: "Izin" }, // Fri
        { studentId: 101, attendanceDate: "2026-10-14", status: "Izin" }, // Wed
      ];
      const resPerhatian = detectAttendanceAnomalies([student], recordsPerhatian);
      expect(resPerhatian.atRiskStudents[0].stats.mondayFridayRatio).toBe(0.75);
      expect(resPerhatian.atRiskStudents[0].urgency).toBe("Perhatian");
    });
  });

  describe("2. High Volume Load Benchmark (1,000 Students & 20,000 Records < 50ms)", () => {
    it("should process 1,000 students and 20,000 records within the < 50ms steady-state budget", () => {
      const studentCount = 1000;
      const recordsPerStudent = 20;
      const totalRecords = studentCount * recordsPerStudent; // 20,000 records

      const students: AnomalyStudentInput[] = [];
      for (let i = 1; i <= studentCount; i++) {
        students.push({
          id: i,
          name: `Siswa Uji Volume ${String(i).padStart(4, "0")}`,
          nis: `NIS-${10000 + i}`,
          isActive: i % 50 !== 0, // 2% inactive students to test filtering performance
        });
      }

      const statuses = ["Izin", "Sakit", "Alpa"];
      const letterStatuses = ["Sudah", "Belum", null];
      const records: AnomalyRecordInput[] = [];

      for (let s = 1; s <= studentCount; s++) {
        for (let r = 1; r <= recordsPerStudent; r++) {
          const day = (r % 28) + 1;
          const month = r > 10 ? "11" : "10";
          const dateStr = `2026-${month}-${String(day).padStart(2, "0")}`;
          records.push({
            studentId: s,
            attendanceDate: dateStr,
            status: statuses[(s + r) % statuses.length],
            letterStatus: letterStatuses[(s * r) % letterStatuses.length],
          });
        }
      }

      expect(students.length).toBe(studentCount);
      expect(records.length).toBe(totalRecords);

      // Warm up V8 TurboFan JIT compiler (standard practice for high-throughput engine benchmarking)
      for (let w = 0; w < 10; w++) {
        detectAttendanceAnomalies(students, records);
      }

      // Benchmark 5 measurement iterations and capture steady-state latency
      const durations: number[] = [];
      let finalResult = null;
      for (let i = 0; i < 5; i++) {
        const tStart = performance.now();
        finalResult = detectAttendanceAnomalies(students, records);
        const tEnd = performance.now();
        durations.push(tEnd - tStart);
      }

      const minDuration = Math.min(...durations);
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

      console.log(
        `[High-Volume Benchmark] 1,000 students, 20,000 records: min=${minDuration.toFixed(2)}ms, avg=${avgDuration.toFixed(2)}ms`
      );

      // Verify that the steady-state execution time is strictly under 50ms
      expect(minDuration).toBeLessThan(50);

      // Data consistency assertions under full scale
      expect(finalResult).not.toBeNull();
      expect(finalResult!.summary.totalActiveStudents).toBe(980); // 1000 - 20 inactive
      expect(finalResult!.summary.totalAtRiskStudents).toBe(finalResult!.atRiskStudents.length);
      expect(
        finalResult!.summary.kritisCount +
        finalResult!.summary.waspadaCount +
        finalResult!.summary.perhatianCount
      ).toBe(finalResult!.atRiskStudents.length);
    });
  });

  describe("3. Complex Multi-Month Spans, Leap Years & Year Transitions", () => {
    const student: AnomalyStudentInput = {
      id: 201,
      name: "Calendar Boundary Student",
      nis: "NIS-201",
      isActive: true,
    };

    it("should correctly handle leap year February 2024 (28-29 Feb) and roll into March", () => {
      // 2024-02-28 (Wednesday), 2024-02-29 (Thursday - Leap Day), 2024-03-01 (Friday)
      const records: AnomalyRecordInput[] = [
        { studentId: 201, attendanceDate: "2024-02-28", status: "Sakit", letterStatus: "Belum" },
        { studentId: 201, attendanceDate: "2024-02-29", status: "Sakit", letterStatus: "Belum" },
        { studentId: 201, attendanceDate: "2024-03-01", status: "Sakit", letterStatus: "Belum" },
      ];

      const res = detectAttendanceAnomalies([student], records);
      expect(res.atRiskStudents.length).toBe(1);
      const st = res.atRiskStudents[0];
      expect(st.anomalyTypes).toContain("PENDING_DOCTOR_NOTE");
      expect(st.stats.consecutiveSickDays).toBe(3);
    });

    it("should correctly bridge weekend across non-leap February into March (Fri 28 Feb -> Mon 3 Mar 2025)", () => {
      // 2025 is not a leap year. Feb 28 is Friday. Mar 1 is Sat, Mar 2 is Sun, Mar 3 is Mon.
      // Sick on Fri 2025-02-28 and Mon 2025-03-03 and Tue 2025-03-04
      const records: AnomalyRecordInput[] = [
        { studentId: 201, attendanceDate: "2025-02-28", status: "Sakit", letterStatus: "Belum" },
        { studentId: 201, attendanceDate: "2025-03-03", status: "Sakit", letterStatus: "Belum" },
        { studentId: 201, attendanceDate: "2025-03-04", status: "Sakit", letterStatus: "Belum" },
      ];

      const res = detectAttendanceAnomalies([student], records);
      expect(res.atRiskStudents.length).toBe(1);
      const st = res.atRiskStudents[0];
      expect(st.anomalyTypes).toContain("PENDING_DOCTOR_NOTE");
      expect(st.stats.consecutiveSickDays).toBe(3);
    });

    it("should bridge Saturday to Monday 6-day school week gap (Sat 3 Oct -> Mon 5 Oct -> Tue 6 Oct 2026)", () => {
      // 2026-10-03 (Saturday, dow=6), 2026-10-05 (Monday, dow=1), 2026-10-06 (Tuesday, dow=2)
      const records: AnomalyRecordInput[] = [
        { studentId: 201, attendanceDate: "2026-10-03", status: "Sakit", letterStatus: "Belum" },
        { studentId: 201, attendanceDate: "2026-10-05", status: "Sakit", letterStatus: "Belum" },
        { studentId: 201, attendanceDate: "2026-10-06", status: "Sakit", letterStatus: "Belum" },
      ];

      const res = detectAttendanceAnomalies([student], records);
      expect(res.atRiskStudents.length).toBe(1);
      const st = res.atRiskStudents[0];
      expect(st.anomalyTypes).toContain("PENDING_DOCTOR_NOTE");
      expect(st.stats.consecutiveSickDays).toBe(3);
    });

    it("should cross New Year boundary correctly (Thu Dec 31 -> Fri Jan 1 -> Mon Jan 4)", () => {
      // 2026-12-31 (Thursday), 2027-01-01 (Friday), 2027-01-04 (Monday)
      const records: AnomalyRecordInput[] = [
        { studentId: 201, attendanceDate: "2026-12-31", status: "Sakit", letterStatus: "Belum" },
        { studentId: 201, attendanceDate: "2027-01-01", status: "Sakit", letterStatus: "Belum" },
        { studentId: 201, attendanceDate: "2027-01-04", status: "Sakit", letterStatus: "Belum" },
      ];

      const res = detectAttendanceAnomalies([student], records);
      expect(res.atRiskStudents.length).toBe(1);
      const st = res.atRiskStudents[0];
      expect(st.anomalyTypes).toContain("PENDING_DOCTOR_NOTE");
      expect(st.stats.consecutiveSickDays).toBe(3);
    });

    it("should NOT trigger CHRONIC_ABSENCE when high absences split across calendar month boundary", () => {
      // 4 days late in November, 4 days early in December = 8 total, but max per calendar month is 4
      const records: AnomalyRecordInput[] = [
        { studentId: 201, attendanceDate: "2026-11-24", status: "Izin" },
        { studentId: 201, attendanceDate: "2026-11-25", status: "Izin" },
        { studentId: 201, attendanceDate: "2026-11-26", status: "Izin" },
        { studentId: 201, attendanceDate: "2026-11-27", status: "Izin" },
        { studentId: 201, attendanceDate: "2026-12-01", status: "Izin" },
        { studentId: 201, attendanceDate: "2026-12-02", status: "Izin" },
        { studentId: 201, attendanceDate: "2026-12-03", status: "Izin" },
        { studentId: 201, attendanceDate: "2026-12-04", status: "Izin" },
      ];

      const res = detectAttendanceAnomalies([student], records);
      const atRisk = res.atRiskStudents.find((s) => s.studentId === 201);
      if (atRisk) {
        expect(atRisk.anomalyTypes).not.toContain("CHRONIC_ABSENCE");
        expect(atRisk.stats.maxMonthlyAbsence).toBe(4);
      }
    });

    it("should respect dateStart, dateEnd, and targetMonth filtering options", () => {
      const records: AnomalyRecordInput[] = [
        { studentId: 201, attendanceDate: "2026-09-15", status: "Alpa" },
        { studentId: 201, attendanceDate: "2026-10-05", status: "Alpa" },
        { studentId: 201, attendanceDate: "2026-10-10", status: "Alpa" },
        { studentId: 201, attendanceDate: "2026-10-15", status: "Alpa" },
        { studentId: 201, attendanceDate: "2026-11-05", status: "Alpa" },
      ];

      // Option 1: targetMonth = "2026-10" -> exactly 3 Alpa in October -> Waspada
      const resMonth = detectAttendanceAnomalies([student], records, { targetMonth: "2026-10" });
      expect(resMonth.atRiskStudents.length).toBe(1);
      expect(resMonth.atRiskStudents[0].stats.alpa).toBe(3);

      // Option 2: dateStart = "2026-10-08", dateEnd = "2026-10-31" -> only 2 Alpa -> NOT triggered
      const resRange = detectAttendanceAnomalies([student], records, {
        dateStart: "2026-10-08",
        dateEnd: "2026-10-31",
      });
      expect(resRange.atRiskStudents.length).toBe(0);
    });
  });

  describe("4. Massive Multi-Rule Combinations & Urgency Precedence", () => {
    it("should prioritize Kritis when both Kritis and Waspada rules trigger simultaneously", () => {
      const student: AnomalyStudentInput = { id: 301, name: "Multi Rule Student", isActive: true };
      // 5 Alpa (Kritis: Rule 2) + 3 Mon/Fri absences (Perhatian: Rule 1) + 5 Chronic in Oct (Waspada: Rule 4)
      const records: AnomalyRecordInput[] = [
        { studentId: 301, attendanceDate: "2026-10-02", status: "Alpa" }, // Fri
        { studentId: 301, attendanceDate: "2026-10-05", status: "Alpa" }, // Mon
        { studentId: 301, attendanceDate: "2026-10-09", status: "Alpa" }, // Fri
        { studentId: 301, attendanceDate: "2026-10-13", status: "Alpa" }, // Tue
        { studentId: 301, attendanceDate: "2026-10-14", status: "Alpa" }, // Wed
      ];

      const res = detectAttendanceAnomalies([student], records);
      expect(res.atRiskStudents.length).toBe(1);
      const st = res.atRiskStudents[0];
      expect(st.urgency).toBe("Kritis");
      expect(st.anomalyTypes).toContain("UNEXCUSED_ALPA");
      expect(st.anomalyTypes).toContain("MON_FRI_PATTERN");
      expect(st.anomalyTypes).toContain("CHRONIC_ABSENCE");
      expect(st.ruleDescriptions.length).toBe(3);
    });

    it("should trigger all 4 rules simultaneously and elevate to Kritis", () => {
      const student: AnomalyStudentInput = { id: 302, name: "Omni Rule Student", isActive: true };
      // Rule 1 (MF Pattern): Mon/Fri absences
      // Rule 2 (Unexcused Alpa): 5 Alpa (Kritis)
      // Rule 3 (Pending Doctor Note): 3 consecutive sick days with Belum (Waspada)
      // Rule 4 (Chronic Absence): 8+ absences in October (Kritis)
      const records: AnomalyRecordInput[] = [
        // Sick streak Oct 1, 2, 5 (Thu, Fri, Mon - Fri to Mon bridge)
        { studentId: 302, attendanceDate: "2026-10-01", status: "Sakit", letterStatus: "Belum" },
        { studentId: 302, attendanceDate: "2026-10-02", status: "Sakit", letterStatus: "Belum" }, // Fri
        { studentId: 302, attendanceDate: "2026-10-05", status: "Sakit", letterStatus: "Belum" }, // Mon
        // 5 Alpa days on Oct 9 (Fri), 12 (Mon), 16 (Fri), 19 (Mon), 20 (Tue)
        { studentId: 302, attendanceDate: "2026-10-09", status: "Alpa" }, // Fri
        { studentId: 302, attendanceDate: "2026-10-12", status: "Alpa" }, // Mon
        { studentId: 302, attendanceDate: "2026-10-16", status: "Alpa" }, // Fri
        { studentId: 302, attendanceDate: "2026-10-19", status: "Alpa" }, // Mon
        { studentId: 302, attendanceDate: "2026-10-20", status: "Alpa" }, // Tue
      ];

      const res = detectAttendanceAnomalies([student], records);
      expect(res.atRiskStudents.length).toBe(1);
      const st = res.atRiskStudents[0];
      expect(st.urgency).toBe("Kritis");
      expect(st.anomalyTypes.sort()).toEqual(
        ["CHRONIC_ABSENCE", "MON_FRI_PATTERN", "PENDING_DOCTOR_NOTE", "UNEXCUSED_ALPA"].sort()
      );
      expect(st.stats.total).toBe(8);
      expect(st.stats.alpa).toBe(5);
      expect(st.stats.consecutiveSickDays).toBe(3);
      expect(st.stats.mondayFridayRatio).toBeGreaterThanOrEqual(0.5);
    });

    it("should perform strictly deterministic sorting: Urgency (Kritis>Waspada>Perhatian) -> Absences desc -> Name asc", () => {
      const students: AnomalyStudentInput[] = [
        { id: 1, name: "Zaskia", isActive: true }, // Kritis, 6 absences
        { id: 2, name: "Budi", isActive: true },   // Kritis, 8 absences
        { id: 3, name: "Agus", isActive: true },   // Kritis, 8 absences (alphabetical tie-breaker with Budi)
        { id: 4, name: "Dewi", isActive: true },   // Waspada, 4 absences
        { id: 5, name: "Candra", isActive: true }, // Perhatian, 3 absences
      ];

      const records: AnomalyRecordInput[] = [
        // Agus (id: 3): 8 absences in month (Kritis)
        ...Array.from({ length: 8 }, (_, i) => ({
          studentId: 3,
          attendanceDate: `2026-10-${String(i + 1).padStart(2, "0")}`,
          status: "Izin",
        })),
        // Budi (id: 2): 8 absences in month (Kritis)
        ...Array.from({ length: 8 }, (_, i) => ({
          studentId: 2,
          attendanceDate: `2026-10-${String(i + 1).padStart(2, "0")}`,
          status: "Izin",
        })),
        // Zaskia (id: 1): 6 Alpa (Kritis, 6 absences)
        ...Array.from({ length: 6 }, (_, i) => ({
          studentId: 1,
          attendanceDate: `2026-10-${String(i + 1).padStart(2, "0")}`,
          status: "Alpa",
        })),
        // Dewi (id: 4): 3 Alpa (Waspada, 3 absences)
        { studentId: 4, attendanceDate: "2026-10-01", status: "Alpa" },
        { studentId: 4, attendanceDate: "2026-10-02", status: "Alpa" },
        { studentId: 4, attendanceDate: "2026-10-05", status: "Alpa" },
        // Candra (id: 5): Mon/Fri pattern (Perhatian, 3 absences)
        { studentId: 5, attendanceDate: "2026-10-02", status: "Izin" }, // Fri
        { studentId: 5, attendanceDate: "2026-10-05", status: "Izin" }, // Mon
        { studentId: 5, attendanceDate: "2026-10-09", status: "Izin" }, // Fri
      ];

      const atRisk = detectAtRiskStudents(students, records);
      expect(atRisk.length).toBe(5);

      // Expected Order:
      // 1. Agus (Kritis, 8 absences)
      // 2. Budi (Kritis, 8 absences)
      // 3. Zaskia (Kritis, 6 absences)
      // 4. Dewi (Waspada, 3 absences)
      // 5. Candra (Perhatian, 3 absences)
      expect(atRisk[0].studentName).toBe("Agus");
      expect(atRisk[0].urgency).toBe("Kritis");
      expect(atRisk[0].stats.total).toBe(8);

      expect(atRisk[1].studentName).toBe("Budi");
      expect(atRisk[1].urgency).toBe("Kritis");
      expect(atRisk[1].stats.total).toBe(8);

      expect(atRisk[2].studentName).toBe("Zaskia");
      expect(atRisk[2].urgency).toBe("Kritis");
      expect(atRisk[2].stats.total).toBe(6);

      expect(atRisk[3].studentName).toBe("Dewi");
      expect(atRisk[3].urgency).toBe("Waspada");

      expect(atRisk[4].studentName).toBe("Candra");
      expect(atRisk[4].urgency).toBe("Perhatian");
    });
  });

  describe("5. Degenerate Inputs, Conflicting Duplicates & Fault Invariance", () => {
    it("should handle empty inputs gracefully without throwing or returning NaN", () => {
      const resEmpty = detectAttendanceAnomalies([], []);
      expect(resEmpty.summary.totalActiveStudents).toBe(0);
      expect(resEmpty.summary.totalAtRiskStudents).toBe(0);
      expect(resEmpty.atRiskStudents).toEqual([]);

      const student: AnomalyStudentInput = { id: 99, name: "No Records", isActive: true };
      const resNoRecords = detectAttendanceAnomalies([student], []);
      expect(resNoRecords.summary.totalActiveStudents).toBe(1);
      expect(resNoRecords.summary.totalAtRiskStudents).toBe(0);
      expect(resNoRecords.atRiskStudents).toEqual([]);
    });

    it("should resolve same-day duplicate records deterministically: Alpa (3) > Sakit (2) > Izin (1)", () => {
      const student: AnomalyStudentInput = { id: 501, name: "Dup Student", isActive: true };

      // Case A: Izin first, then Sakit, then Alpa
      const recordsAscending = [
        { studentId: 501, attendanceDate: "2026-10-01", status: "Izin", letterStatus: "Sudah" },
        { studentId: 501, attendanceDate: "2026-10-01", status: "Sakit", letterStatus: "Belum" },
        { studentId: 501, attendanceDate: "2026-10-01", status: "Alpa", letterStatus: "Belum" },
        { studentId: 501, attendanceDate: "2026-10-02", status: "Alpa" },
        { studentId: 501, attendanceDate: "2026-10-03", status: "Alpa" },
      ];

      // Case B: Alpa first, then Sakit, then Izin (reverse order of insertion)
      const recordsDescending = [
        { studentId: 501, attendanceDate: "2026-10-01", status: "Alpa", letterStatus: "Belum" },
        { studentId: 501, attendanceDate: "2026-10-01", status: "Sakit", letterStatus: "Belum" },
        { studentId: 501, attendanceDate: "2026-10-01", status: "Izin", letterStatus: "Sudah" },
        { studentId: 501, attendanceDate: "2026-10-02", status: "Alpa" },
        { studentId: 501, attendanceDate: "2026-10-03", status: "Alpa" },
      ];

      const resA = detectAttendanceAnomalies([student], recordsAscending);
      const resB = detectAttendanceAnomalies([student], recordsDescending);

      // Both must yield identical stats: 3 Alpa days, status Alpa, Belum preserved
      expect(resA.atRiskStudents.length).toBe(1);
      expect(resB.atRiskStudents.length).toBe(1);

      expect(resA.atRiskStudents[0].stats.alpa).toBe(3);
      expect(resB.atRiskStudents[0].stats.alpa).toBe(3);
      expect(resA.atRiskStudents[0].stats.total).toBe(3);
      expect(resB.atRiskStudents[0].stats.total).toBe(3);
      expect(resA.atRiskStudents[0].stats.pendingLetters).toBe(resB.atRiskStudents[0].stats.pendingLetters);
    });

    it("should collapse 10 duplicate records on identical date to 1 distinct record without inflating total", () => {
      const student: AnomalyStudentInput = { id: 503, name: "Ten Duplicates", isActive: true };
      const records: AnomalyRecordInput[] = Array.from({ length: 10 }, (_, i) => ({
        studentId: 503,
        attendanceDate: "2026-10-01",
        status: i === 5 ? "Alpa" : "Izin",
        letterStatus: i === 2 ? "Belum" : "Sudah",
      }));

      const res = detectAttendanceAnomalies([student], records);
      // Only 1 record after deduplication -> total < 3, so not at risk
      expect(res.atRiskStudents.length).toBe(0);
      expect(res.summary.totalActiveStudents).toBe(1);
    });

    it("should preserve 'Belum' doctor note status even when paired with a 'Sudah' duplicate record", () => {
      const student: AnomalyStudentInput = { id: 502, name: "Note Preserved", isActive: true };
      const records: AnomalyRecordInput[] = [
        { studentId: 502, attendanceDate: "2026-10-01", status: "Sakit", letterStatus: "Sudah" },
        { studentId: 502, attendanceDate: "2026-10-01", status: "Sakit", letterStatus: "Belum" },
        { studentId: 502, attendanceDate: "2026-10-02", status: "Sakit", letterStatus: "Belum" },
        { studentId: 502, attendanceDate: "2026-10-05", status: "Sakit", letterStatus: "Belum" }, // Fri -> Mon
      ];

      const res = detectAttendanceAnomalies([student], records);
      expect(res.atRiskStudents.length).toBe(1);
      const st = res.atRiskStudents[0];
      expect(st.anomalyTypes).toContain("PENDING_DOCTOR_NOTE");
      expect(st.stats.consecutiveSickDays).toBe(3);
    });

    it("should handle malformed date strings gracefully without throwing", () => {
      const student: AnomalyStudentInput = { id: 504, name: "Malformed Date", isActive: true };
      const records: AnomalyRecordInput[] = [
        { studentId: 504, attendanceDate: "invalid-date", status: "Izin" },
        { studentId: 504, attendanceDate: "", status: "Izin" },
        { studentId: 504, attendanceDate: "2026/10/01", status: "Izin" },
      ];

      expect(() => detectAttendanceAnomalies([student], records)).not.toThrow();
    });

    it("should filter out records belonging to non-existent or inactive students without corrupting results", () => {
      const activeStudent: AnomalyStudentInput = { id: 1, name: "Active", isActive: true };
      const inactiveStudent: AnomalyStudentInput = { id: 2, name: "Inactive", isActive: false };

      const records: AnomalyRecordInput[] = [
        { studentId: 1, attendanceDate: "2026-10-01", status: "Alpa" },
        { studentId: 1, attendanceDate: "2026-10-02", status: "Alpa" },
        { studentId: 1, attendanceDate: "2026-10-03", status: "Alpa" },
        // Inactive student records
        { studentId: 2, attendanceDate: "2026-10-01", status: "Alpa" },
        { studentId: 2, attendanceDate: "2026-10-02", status: "Alpa" },
        { studentId: 2, attendanceDate: "2026-10-03", status: "Alpa" },
        // Phantom student 999 not in student roster
        { studentId: 999, attendanceDate: "2026-10-01", status: "Alpa" },
        { studentId: 999, attendanceDate: "2026-10-02", status: "Alpa" },
        { studentId: 999, attendanceDate: "2026-10-03", status: "Alpa" },
      ];

      const res = detectAttendanceAnomalies([activeStudent, inactiveStudent], records);
      expect(res.summary.totalActiveStudents).toBe(1);
      expect(res.atRiskStudents.length).toBe(1);
      expect(res.atRiskStudents[0].studentId).toBe(1);
    });
  });
});
