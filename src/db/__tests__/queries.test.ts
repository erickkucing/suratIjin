import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../index";
import { classes, users } from "../schema";
import { getClassDashboardData, getAdminOverviewData } from "../queries";
import { eq } from "drizzle-orm";

describe("Database Queries and Data Integrity", () => {
  let classId: number;

  beforeAll(async () => {
    const cls = await db.query.classes.findFirst({
      where: eq(classes.slug, "xii-tkj-2"),
    });
    if (!cls) {
      throw new Error("Class xii-tkj-2 not found. Ensure db:seed has been run.");
    }
    classId = cls.id;
  });

  it("should retrieve dashboard data with exact legacy counts", async () => {
    const data = await getClassDashboardData(classId);

    expect(data.classInfo.name).toBe("XII TKJ 2");
    expect(data.totalClassStudents).toBe(34);
    expect(data.records.length).toBe(12);

    // Summary assertions
    expect(data.summary.totalAlpa).toBe(0);
    expect(data.summary.totalIzin).toBe(5);
    expect(data.summary.totalSakit).toBe(7);
    expect(data.summary.totalSuratBelum).toBe(1); // ID 318 has status Sakit and Belum
  });

  it("should aggregate monthly chart data properly", async () => {
    const data = await getClassDashboardData(classId);

    // Monthly chart should contain September and October 2026
    const sept = data.monthlyChart.find((m) => m.month === "2026-09");
    const oct = data.monthlyChart.find((m) => m.month === "2026-10");

    expect(sept).toBeDefined();
    expect(sept?.izin).toBe(5);
    expect(sept?.sakit).toBe(5);

    expect(oct).toBeDefined();
    expect(oct?.sakit).toBe(2);
  });

  it("should compute 100% attendance students using anti-join", async () => {
    const data = await getClassDashboardData(classId);

    // Students with absences:
    // Widhiarto Sanjaya, Elia Eka Pranata, Rizky Akbar, Jovian Alexa, Wisnu Putra, Imanuel Hariadi, Revaldo Benyamin (7 students)
    // 34 total students - 7 students with absence = 27 students with 100% attendance!
    expect(data.students100Percent.length).toBe(27);

    // None of the 100% attendance students should be in the absence list
    const absentStudentNames = new Set(data.records.map((r) => r.studentName));
    for (const student of data.students100Percent) {
      expect(absentStudentNames.has(student.name)).toBe(false);
    }
  });

  it("should filter attendance records by status", async () => {
    const izinOnly = await getClassDashboardData(classId, { status: "Izin" });
    expect(izinOnly.records.length).toBe(5);
    izinOnly.records.forEach((r) => expect(r.status).toBe("Izin"));

    const sakitOnly = await getClassDashboardData(classId, { status: "Sakit" });
    expect(sakitOnly.records.length).toBe(7);
    sakitOnly.records.forEach((r) => expect(r.status).toBe("Sakit"));
  });

  it("should filter missing letters using Belum_Izin_Sakit", async () => {
    const missing = await getClassDashboardData(classId, { letterStatus: "Belum_Izin_Sakit" });
    expect(missing.records.length).toBe(1);
    expect(missing.records[0].letterStatus).toBe("Belum");
    expect(missing.records[0].studentName).toBe("Revaldo Benyamin Tano");
  });

  it("should return admin overview data with class and teacher aggregates", async () => {
    const adminData = await getAdminOverviewData();
    expect(adminData.classes.length).toBeGreaterThanOrEqual(1);
    expect(adminData.teachers.length).toBeGreaterThanOrEqual(1);

    const tkj = adminData.classes.find((c) => c.slug === "xii-tkj-2");
    expect(tkj).toBeDefined();
    expect(tkj?.totalStudents).toBe(34);
    expect(tkj?.totalAbsences).toBe(12);
  });
});
