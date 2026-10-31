import { describe, it, expect } from "vitest";
import {
  detectAttendanceAnomalies,
  detectAtRiskStudents,
  AnomalyStudentInput,
  AnomalyRecordInput,
} from "../attendance-anomaly-detector";

describe("attendance-anomaly-detector", () => {
  const defaultStudent: AnomalyStudentInput = {
    id: 1,
    name: "Budi Santoso",
    nis: "1001",
    isActive: true,
  };

  describe("Rule 1: Monday/Friday Pattern (MON_FRI_PATTERN)", () => {
    it("should trigger when >= 50% absences are on Monday/Friday with min 3 total and min 2 MF", () => {
      // 2026-10-02 (Friday), 2026-10-05 (Monday), 2026-10-09 (Friday) -> 3/3 = 100%
      const records: AnomalyRecordInput[] = [
        { studentId: 1, attendanceDate: "2026-10-02", status: "Izin", letterStatus: "Sudah" },
        { studentId: 1, attendanceDate: "2026-10-05", status: "Izin", letterStatus: "Sudah" },
        { studentId: 1, attendanceDate: "2026-10-09", status: "Izin", letterStatus: "Sudah" },
      ];

      const result = detectAttendanceAnomalies([defaultStudent], records);
      expect(result.atRiskStudents.length).toBe(1);
      const student = result.atRiskStudents[0];
      expect(student.anomalyTypes).toContain("MON_FRI_PATTERN");
      expect(student.stats.mondayFridayRatio).toBe(1);
      expect(student.urgency).toBe("Perhatian");
    });

    it("should trigger Waspada urgency when MF count >= 4 and ratio >= 0.65", () => {
      // 2026-10-02 (Fri), 2026-10-05 (Mon), 2026-10-09 (Fri), 2026-10-12 (Mon), 2026-10-14 (Wed) -> 4/5 = 80%
      const records: AnomalyRecordInput[] = [
        { studentId: 1, attendanceDate: "2026-10-02", status: "Izin" },
        { studentId: 1, attendanceDate: "2026-10-05", status: "Izin" },
        { studentId: 1, attendanceDate: "2026-10-09", status: "Izin" },
        { studentId: 1, attendanceDate: "2026-10-12", status: "Izin" },
        { studentId: 1, attendanceDate: "2026-10-14", status: "Izin" }, // Wednesday
      ];

      const result = detectAttendanceAnomalies([defaultStudent], records);
      expect(result.atRiskStudents.length).toBe(1);
      expect(result.atRiskStudents[0].urgency).toBe("Waspada");
    });

    it("should NOT trigger when ratio is less than 50%", () => {
      // 2026-10-05 (Mon), 2026-10-06 (Tue), 2026-10-07 (Wed), 2026-10-08 (Thu) -> 1/4 = 25%
      const records: AnomalyRecordInput[] = [
        { studentId: 1, attendanceDate: "2026-10-05", status: "Izin" },
        { studentId: 1, attendanceDate: "2026-10-06", status: "Izin" },
        { studentId: 1, attendanceDate: "2026-10-07", status: "Izin" },
        { studentId: 1, attendanceDate: "2026-10-08", status: "Izin" },
      ];

      const result = detectAttendanceAnomalies([defaultStudent], records);
      expect(result.atRiskStudents.length).toBe(0);
    });

    it("should NOT trigger when total absences < 3 even if 100% on Monday/Friday", () => {
      // 2 absences: Friday 2026-10-02 and Monday 2026-10-05 -> 2/2 = 100% but total < 3
      const records: AnomalyRecordInput[] = [
        { studentId: 1, attendanceDate: "2026-10-02", status: "Izin" },
        { studentId: 1, attendanceDate: "2026-10-05", status: "Izin" },
      ];

      const result = detectAttendanceAnomalies([defaultStudent], records);
      expect(result.atRiskStudents.length).toBe(0);
    });
  });

  describe("Rule 2: Unexcused Absence / Alpa (UNEXCUSED_ALPA)", () => {
    it("should trigger Waspada urgency for 3 to 4 Alpa days", () => {
      const records: AnomalyRecordInput[] = [
        { studentId: 1, attendanceDate: "2026-10-01", status: "Alpa" },
        { studentId: 1, attendanceDate: "2026-10-06", status: "Alpa" },
        { studentId: 1, attendanceDate: "2026-10-15", status: "Alpa" },
      ];

      const result = detectAttendanceAnomalies([defaultStudent], records);
      expect(result.atRiskStudents.length).toBe(1);
      const student = result.atRiskStudents[0];
      expect(student.anomalyTypes).toContain("UNEXCUSED_ALPA");
      expect(student.urgency).toBe("Waspada");
      expect(student.stats.alpa).toBe(3);
    });

    it("should trigger Kritis urgency for >= 5 Alpa days", () => {
      const records: AnomalyRecordInput[] = [
        { studentId: 1, attendanceDate: "2026-10-01", status: "Alpa" },
        { studentId: 1, attendanceDate: "2026-10-06", status: "Alpa" },
        { studentId: 1, attendanceDate: "2026-10-15", status: "Alpa" },
        { studentId: 1, attendanceDate: "2026-10-20", status: "Alpa" },
        { studentId: 1, attendanceDate: "2026-10-22", status: "Alpa" },
      ];

      const result = detectAttendanceAnomalies([defaultStudent], records);
      expect(result.atRiskStudents.length).toBe(1);
      const student = result.atRiskStudents[0];
      expect(student.anomalyTypes).toContain("UNEXCUSED_ALPA");
      expect(student.urgency).toBe("Kritis");
      expect(student.stats.alpa).toBe(5);
    });

    it("should NOT trigger for 1 or 2 Alpa days", () => {
      const records: AnomalyRecordInput[] = [
        { studentId: 1, attendanceDate: "2026-10-01", status: "Alpa" },
        { studentId: 1, attendanceDate: "2026-10-06", status: "Alpa" },
      ];

      const result = detectAttendanceAnomalies([defaultStudent], records);
      expect(result.atRiskStudents.length).toBe(0);
    });
  });

  describe("Rule 3: Pending Doctor Note (PENDING_DOCTOR_NOTE)", () => {
    it("should trigger Waspada for 3 consecutive sick days with letterStatus 'Belum'", () => {
      const records: AnomalyRecordInput[] = [
        { studentId: 1, attendanceDate: "2026-10-01", status: "Sakit", letterStatus: "Belum" },
        { studentId: 1, attendanceDate: "2026-10-02", status: "Sakit", letterStatus: "Belum" },
        { studentId: 1, attendanceDate: "2026-10-03", status: "Sakit", letterStatus: "Belum" },
      ];

      const result = detectAttendanceAnomalies([defaultStudent], records);
      expect(result.atRiskStudents.length).toBe(1);
      const student = result.atRiskStudents[0];
      expect(student.anomalyTypes).toContain("PENDING_DOCTOR_NOTE");
      expect(student.urgency).toBe("Waspada");
      expect(student.stats.consecutiveSickDays).toBe(3);
    });

    it("should bridge Friday to Monday weekend gap as consecutive days", () => {
      // 2026-10-02 is Friday, 2026-10-05 is Monday, 2026-10-06 is Tuesday
      const records: AnomalyRecordInput[] = [
        { studentId: 1, attendanceDate: "2026-10-02", status: "Sakit", letterStatus: "Belum" },
        { studentId: 1, attendanceDate: "2026-10-05", status: "Sakit", letterStatus: "Belum" },
        { studentId: 1, attendanceDate: "2026-10-06", status: "Sakit", letterStatus: "Belum" },
      ];

      const result = detectAttendanceAnomalies([defaultStudent], records);
      expect(result.atRiskStudents.length).toBe(1);
      const student = result.atRiskStudents[0];
      expect(student.anomalyTypes).toContain("PENDING_DOCTOR_NOTE");
      expect(student.stats.consecutiveSickDays).toBe(3);
    });

    it("should trigger Kritis urgency for >= 5 consecutive sick days with Belum", () => {
      // 5 consecutive days: 2026-10-01 to 2026-10-05
      const records: AnomalyRecordInput[] = [
        { studentId: 1, attendanceDate: "2026-10-01", status: "Sakit", letterStatus: "Belum" },
        { studentId: 1, attendanceDate: "2026-10-02", status: "Sakit", letterStatus: "Belum" },
        { studentId: 1, attendanceDate: "2026-10-03", status: "Sakit", letterStatus: "Belum" },
        { studentId: 1, attendanceDate: "2026-10-04", status: "Sakit", letterStatus: "Belum" },
        { studentId: 1, attendanceDate: "2026-10-05", status: "Sakit", letterStatus: "Belum" },
      ];

      const result = detectAttendanceAnomalies([defaultStudent], records);
      expect(result.atRiskStudents.length).toBe(1);
      expect(result.atRiskStudents[0].urgency).toBe("Kritis");
    });

    it("should NOT trigger if sick days have letterStatus 'Sudah'", () => {
      const records: AnomalyRecordInput[] = [
        { studentId: 1, attendanceDate: "2026-10-01", status: "Sakit", letterStatus: "Sudah" },
        { studentId: 1, attendanceDate: "2026-10-02", status: "Sakit", letterStatus: "Sudah" },
        { studentId: 1, attendanceDate: "2026-10-03", status: "Sakit", letterStatus: "Sudah" },
      ];

      const result = detectAttendanceAnomalies([defaultStudent], records);
      expect(result.atRiskStudents.length).toBe(0);
    });

    it("should NOT trigger if sick days are separated by non-consecutive gaps", () => {
      // 2026-10-06 (Tue), 2026-10-13 (Tue), 2026-10-20 (Tue) -> non-consecutive, no Mon/Fri
      const records: AnomalyRecordInput[] = [
        { studentId: 1, attendanceDate: "2026-10-06", status: "Sakit", letterStatus: "Belum" },
        { studentId: 1, attendanceDate: "2026-10-13", status: "Sakit", letterStatus: "Belum" },
        { studentId: 1, attendanceDate: "2026-10-20", status: "Sakit", letterStatus: "Belum" },
      ];

      const result = detectAttendanceAnomalies([defaultStudent], records);
      expect(result.atRiskStudents.length).toBe(0);
    });
  });

  describe("Rule 4: Chronic Absence (CHRONIC_ABSENCE)", () => {
    it("should trigger Waspada for >= 5 absences in a single month", () => {
      const records: AnomalyRecordInput[] = [
        { studentId: 1, attendanceDate: "2026-10-01", status: "Izin" },
        { studentId: 1, attendanceDate: "2026-10-06", status: "Sakit", letterStatus: "Sudah" },
        { studentId: 1, attendanceDate: "2026-10-12", status: "Izin" },
        { studentId: 1, attendanceDate: "2026-10-19", status: "Sakit", letterStatus: "Sudah" },
        { studentId: 1, attendanceDate: "2026-10-27", status: "Izin" },
      ];

      const result = detectAttendanceAnomalies([defaultStudent], records);
      expect(result.atRiskStudents.length).toBe(1);
      const student = result.atRiskStudents[0];
      expect(student.anomalyTypes).toContain("CHRONIC_ABSENCE");
      expect(student.urgency).toBe("Waspada");
      expect(student.stats.maxMonthlyAbsence).toBe(5);
    });

    it("should trigger Kritis for >= 8 absences in a single month", () => {
      const records: AnomalyRecordInput[] = Array.from({ length: 8 }, (_, i) => ({
        studentId: 1,
        attendanceDate: `2026-10-${String(i + 1).padStart(2, "0")}`,
        status: "Izin",
      }));

      const result = detectAttendanceAnomalies([defaultStudent], records);
      expect(result.atRiskStudents.length).toBe(1);
      expect(result.atRiskStudents[0].urgency).toBe("Kritis");
    });

    it("should NOT trigger if 4 absences are in September and 4 are in October", () => {
      const records: AnomalyRecordInput[] = [
        { studentId: 1, attendanceDate: "2026-09-01", status: "Izin" },
        { studentId: 1, attendanceDate: "2026-09-02", status: "Izin" },
        { studentId: 1, attendanceDate: "2026-09-03", status: "Izin" },
        { studentId: 1, attendanceDate: "2026-09-04", status: "Izin" },
        { studentId: 1, attendanceDate: "2026-10-01", status: "Izin" },
        { studentId: 1, attendanceDate: "2026-10-02", status: "Izin" },
        { studentId: 1, attendanceDate: "2026-10-03", status: "Izin" },
        { studentId: 1, attendanceDate: "2026-10-04", status: "Izin" },
      ];

      const result = detectAttendanceAnomalies([defaultStudent], records);
      expect(result.atRiskStudents.length).toBe(0);
    });
  });

  describe("Edge cases & Multi-student sorting", () => {
    it("should handle leap year consecutive days correctly (Feb 28, Feb 29, Mar 1, 2024)", () => {
      const records: AnomalyRecordInput[] = [
        { studentId: 1, attendanceDate: "2024-02-28", status: "Sakit", letterStatus: "Belum" },
        { studentId: 1, attendanceDate: "2024-02-29", status: "Sakit", letterStatus: "Belum" },
        { studentId: 1, attendanceDate: "2024-03-01", status: "Sakit", letterStatus: "Belum" },
      ];

      const result = detectAttendanceAnomalies([defaultStudent], records);
      expect(result.atRiskStudents.length).toBe(1);
      expect(result.atRiskStudents[0].anomalyTypes).toContain("PENDING_DOCTOR_NOTE");
      expect(result.atRiskStudents[0].stats.consecutiveSickDays).toBe(3);
    });

    it("should properly sort unsorted input dates before evaluating streaks", () => {
      const records: AnomalyRecordInput[] = [
        { studentId: 1, attendanceDate: "2026-10-03", status: "Sakit", letterStatus: "Belum" },
        { studentId: 1, attendanceDate: "2026-10-01", status: "Sakit", letterStatus: "Belum" },
        { studentId: 1, attendanceDate: "2026-10-02", status: "Sakit", letterStatus: "Belum" },
      ];

      const result = detectAttendanceAnomalies([defaultStudent], records);
      expect(result.atRiskStudents.length).toBe(1);
      expect(result.atRiskStudents[0].stats.consecutiveSickDays).toBe(3);
    });

    it("should deduplicate multiple records on the same day without inflating count or streak", () => {
      const records: AnomalyRecordInput[] = [
        { studentId: 1, attendanceDate: "2026-10-01", status: "Izin", letterStatus: "Sudah" },
        { studentId: 1, attendanceDate: "2026-10-01", status: "Alpa", letterStatus: "Belum" },
        { studentId: 1, attendanceDate: "2026-10-02", status: "Alpa", letterStatus: "Belum" },
        { studentId: 1, attendanceDate: "2026-10-03", status: "Alpa", letterStatus: "Belum" },
      ];

      const result = detectAttendanceAnomalies([defaultStudent], records);
      expect(result.atRiskStudents.length).toBe(1);
      const student = result.atRiskStudents[0];
      // 3 distinct days of Alpa
      expect(student.stats.alpa).toBe(3);
      expect(student.stats.total).toBe(3);
    });

    it("should ignore inactive students unless includeInactive option is true", () => {
      const inactiveStudent: AnomalyStudentInput = {
        id: 2,
        name: "Siswa Tidak Aktif",
        isActive: false,
      };

      const records: AnomalyRecordInput[] = [
        { studentId: 2, attendanceDate: "2026-10-01", status: "Alpa" },
        { studentId: 2, attendanceDate: "2026-10-02", status: "Alpa" },
        { studentId: 2, attendanceDate: "2026-10-03", status: "Alpa" },
      ];

      const resultDefault = detectAttendanceAnomalies([inactiveStudent], records);
      expect(resultDefault.atRiskStudents.length).toBe(0);

      const resultInclude = detectAttendanceAnomalies([inactiveStudent], records, {
        includeInactive: true,
      });
      expect(resultInclude.atRiskStudents.length).toBe(1);
    });

    it("should sort at-risk students by Urgency (Kritis > Waspada > Perhatian), then total absences, then name", () => {
      const s1: AnomalyStudentInput = { id: 1, name: "Zulfa", isActive: true };
      const s2: AnomalyStudentInput = { id: 2, name: "Andi", isActive: true };
      const s3: AnomalyStudentInput = { id: 3, name: "Beni", isActive: true };

      const records: AnomalyRecordInput[] = [
        // s1: Perhatian (Mon/Fri 3/3)
        { studentId: 1, attendanceDate: "2026-10-02", status: "Izin" },
        { studentId: 1, attendanceDate: "2026-10-05", status: "Izin" },
        { studentId: 1, attendanceDate: "2026-10-09", status: "Izin" },

        // s2: Kritis (5 Alpa)
        { studentId: 2, attendanceDate: "2026-10-01", status: "Alpa" },
        { studentId: 2, attendanceDate: "2026-10-02", status: "Alpa" },
        { studentId: 2, attendanceDate: "2026-10-03", status: "Alpa" },
        { studentId: 2, attendanceDate: "2026-10-04", status: "Alpa" },
        { studentId: 2, attendanceDate: "2026-10-05", status: "Alpa" },

        // s3: Waspada (3 Alpa)
        { studentId: 3, attendanceDate: "2026-10-01", status: "Alpa" },
        { studentId: 3, attendanceDate: "2026-10-02", status: "Alpa" },
        { studentId: 3, attendanceDate: "2026-10-03", status: "Alpa" },
      ];

      const atRisk = detectAtRiskStudents([s1, s2, s3], records);
      expect(atRisk.length).toBe(3);
      expect(atRisk[0].studentName).toBe("Andi"); // Kritis
      expect(atRisk[0].urgency).toBe("Kritis");
      expect(atRisk[1].studentName).toBe("Beni"); // Waspada
      expect(atRisk[1].urgency).toBe("Waspada");
      expect(atRisk[2].studentName).toBe("Zulfa"); // Perhatian
      expect(atRisk[2].urgency).toBe("Perhatian");
    });
  });
});
