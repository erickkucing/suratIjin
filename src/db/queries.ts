import { db } from "./index";
import { classes, students, attendanceRecords, users, Student, AttendanceRecord } from "./schema";
import { eq, and, gte, lte, sql, inArray, desc, asc } from "drizzle-orm";

export interface DashboardFilters {
  dateStart?: string;
  dateEnd?: string;
  studentId?: number;
  status?: string;
  letterStatus?: string;
}

export interface AttendanceRecordWithStudent extends AttendanceRecord {
  studentName: string;
}

export interface MonthlyChartData {
  month: string;
  label: string;
  izin: number;
  sakit: number;
  alpa: number;
  total: number;
}

export interface DashboardData {
  classInfo: typeof classes.$inferSelect;
  studentsList: Student[];
  allStudentsList: Student[];
  records: AttendanceRecordWithStudent[];
  summary: {
    totalAlpa: number;
    totalIzin: number;
    totalSakit: number;
    totalSuratBelum: number;
    totalRecords: number;
  };
  monthlyChart: MonthlyChartData[];
  students100Percent: Student[];
  totalClassStudents: number;
}

export async function getClassDashboardData(
  classId: number,
  filters: DashboardFilters = {}
): Promise<DashboardData> {
  const classItem = await db.query.classes.findFirst({
    where: eq(classes.id, classId),
  });

  if (!classItem) {
    throw new Error(`Class with ID ${classId} not found.`);
  }

  const conditions = [eq(attendanceRecords.classId, classId)];

  if (filters.dateStart) {
    conditions.push(gte(attendanceRecords.attendanceDate, filters.dateStart));
  }
  if (filters.dateEnd) {
    conditions.push(lte(attendanceRecords.attendanceDate, filters.dateEnd));
  }
  if (filters.studentId && filters.studentId > 0) {
    conditions.push(eq(attendanceRecords.studentId, filters.studentId));
  }
  if (filters.status && filters.status !== "Semua") {
    conditions.push(
      eq(attendanceRecords.status, filters.status as "Izin" | "Sakit" | "Alpa")
    );
  }

  if (filters.letterStatus) {
    if (filters.letterStatus === "Belum_Izin_Sakit") {
      conditions.push(
        and(
          inArray(attendanceRecords.status, ["Izin", "Sakit"]),
          eq(attendanceRecords.letterStatus, "Belum")
        )!
      );
    } else if (filters.letterStatus === "Sudah" || filters.letterStatus === "Belum") {
      conditions.push(eq(attendanceRecords.letterStatus, filters.letterStatus));
    }
  }

  const summaryConditions = [eq(attendanceRecords.classId, classId)];
  if (filters.dateStart) {
    summaryConditions.push(gte(attendanceRecords.attendanceDate, filters.dateStart));
  }
  if (filters.dateEnd) {
    summaryConditions.push(lte(attendanceRecords.attendanceDate, filters.dateEnd));
  }

  const antiJoinConditions = [
    eq(attendanceRecords.studentId, students.id),
    eq(attendanceRecords.classId, classId),
  ];
  if (filters.dateStart) {
    antiJoinConditions.push(gte(attendanceRecords.attendanceDate, filters.dateStart));
  }
  if (filters.dateEnd) {
    antiJoinConditions.push(lte(attendanceRecords.attendanceDate, filters.dateEnd));
  }

  const [
    allStudentsList,
    recordsWithStudent,
    [summaryRow],
    monthlyRows,
    students100Percent,
  ] = await Promise.all([
    db
      .select()
      .from(students)
      .where(eq(students.classId, classId))
      .orderBy(desc(students.isActive), asc(students.name)),
    db
      .select({
        id: attendanceRecords.id,
        classId: attendanceRecords.classId,
        studentId: attendanceRecords.studentId,
        attendanceDate: attendanceRecords.attendanceDate,
        status: attendanceRecords.status,
        infoSource: attendanceRecords.infoSource,
        description: attendanceRecords.description,
        letterFilePath: attendanceRecords.letterFilePath,
        letterMimeType: attendanceRecords.letterMimeType,
        letterStatus: attendanceRecords.letterStatus,
        createdById: attendanceRecords.createdById,
        createdAt: attendanceRecords.createdAt,
        updatedAt: attendanceRecords.updatedAt,
        studentName: students.name,
      })
      .from(attendanceRecords)
      .innerJoin(students, eq(attendanceRecords.studentId, students.id))
      .where(and(...conditions))
      .orderBy(desc(attendanceRecords.attendanceDate), desc(attendanceRecords.id)),
    db
      .select({
        totalAlpa: sql<number>`COALESCE(SUM(CASE WHEN ${attendanceRecords.status} = 'Alpa' THEN 1 ELSE 0 END), 0)`,
        totalIzin: sql<number>`COALESCE(SUM(CASE WHEN ${attendanceRecords.status} = 'Izin' THEN 1 ELSE 0 END), 0)`,
        totalSakit: sql<number>`COALESCE(SUM(CASE WHEN ${attendanceRecords.status} = 'Sakit' THEN 1 ELSE 0 END), 0)`,
        totalSuratBelum: sql<number>`COALESCE(SUM(CASE WHEN ${attendanceRecords.status} IN ('Izin', 'Sakit') AND ${attendanceRecords.letterStatus} = 'Belum' THEN 1 ELSE 0 END), 0)`,
        totalRecords: sql<number>`COUNT(*)`,
      })
      .from(attendanceRecords)
      .where(and(...summaryConditions)),
    db
      .select({
        monthYear: sql<string>`DATE_FORMAT(${attendanceRecords.attendanceDate}, '%Y-%m')`,
        izin: sql<number>`COALESCE(SUM(CASE WHEN ${attendanceRecords.status} = 'Izin' THEN 1 ELSE 0 END), 0)`,
        sakit: sql<number>`COALESCE(SUM(CASE WHEN ${attendanceRecords.status} = 'Sakit' THEN 1 ELSE 0 END), 0)`,
        alpa: sql<number>`COALESCE(SUM(CASE WHEN ${attendanceRecords.status} = 'Alpa' THEN 1 ELSE 0 END), 0)`,
        total: sql<number>`COUNT(*)`,
      })
      .from(attendanceRecords)
      .where(and(...summaryConditions))
      .groupBy(sql`DATE_FORMAT(${attendanceRecords.attendanceDate}, '%Y-%m')`)
      .orderBy(sql`DATE_FORMAT(${attendanceRecords.attendanceDate}, '%Y-%m') ASC`),
    db
      .select({
        id: students.id,
        classId: students.classId,
        nis: students.nis,
        name: students.name,
        isActive: students.isActive,
        createdAt: students.createdAt,
      })
      .from(students)
      .leftJoin(
        attendanceRecords,
        and(...antiJoinConditions)
      )
      .where(
        and(
          eq(students.classId, classId),
          eq(students.isActive, true),
          sql`${attendanceRecords.id} IS NULL`
        )
      )
      .orderBy(asc(students.name)),
  ]);

  const studentsList = allStudentsList.filter((s) => s.isActive);

  const monthNames = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];

  const monthlyChart: MonthlyChartData[] = monthlyRows.map((r) => {
    const [y, m] = r.monthYear.split("-");
    const mIdx = parseInt(m, 10) - 1;
    const label = `${monthNames[mIdx] || m} ${y}`;
    return {
      month: r.monthYear,
      label,
      izin: Number(r.izin),
      sakit: Number(r.sakit),
      alpa: Number(r.alpa),
      total: Number(r.total),
    };
  });

  return {
    classInfo: classItem,
    studentsList,
    allStudentsList,
    records: recordsWithStudent,
    summary: {
      totalAlpa: Number(summaryRow?.totalAlpa || 0),
      totalIzin: Number(summaryRow?.totalIzin || 0),
      totalSakit: Number(summaryRow?.totalSakit || 0),
      totalSuratBelum: Number(summaryRow?.totalSuratBelum || 0),
      totalRecords: Number(summaryRow?.totalRecords || 0),
    },
    monthlyChart,
    students100Percent,
    totalClassStudents: studentsList.length,
  };
}

export async function getAdminOverviewData() {
  const [rawClasses, studentCounts, absenceCounts, waliKelasUsers] = await Promise.all([
    db
      .select({
        id: classes.id,
        slug: classes.slug,
        name: classes.name,
        academicYear: classes.academicYear,
        periodTitle: classes.periodTitle,
        waliKelasId: classes.waliKelasId,
        parentShowLetterFile: classes.parentShowLetterFile,
        hasParentPassword: sql<boolean>`CASE WHEN ${classes.parentPasswordHash} IS NOT NULL THEN 1 ELSE 0 END`,
        isActive: classes.isActive,
        createdAt: classes.createdAt,
        waliKelasName: users.displayName,
        waliKelasUsername: users.username,
      })
      .from(classes)
      .leftJoin(users, eq(classes.waliKelasId, users.id))
      .orderBy(asc(classes.name)),
    db
      .select({
        classId: students.classId,
        count: sql<number>`COUNT(*)`,
      })
      .from(students)
      .where(eq(students.isActive, true))
      .groupBy(students.classId),
    db
      .select({
        classId: attendanceRecords.classId,
        count: sql<number>`COUNT(*)`,
      })
      .from(attendanceRecords)
      .groupBy(attendanceRecords.classId),
    db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
        assignedClassId: classes.id,
        assignedClassName: classes.name,
        assignedClassSlug: classes.slug,
      })
      .from(users)
      .leftJoin(classes, eq(classes.waliKelasId, users.id))
      .where(eq(users.role, "wali_kelas"))
      .orderBy(asc(users.displayName)),
  ]);

  const studentMap = new Map(studentCounts.map((r) => [r.classId, Number(r.count)]));
  const absenceMap = new Map(absenceCounts.map((r) => [r.classId, Number(r.count)]));

  const classesList = rawClasses.map((c) => ({
    ...c,
    totalStudents: studentMap.get(c.id) || 0,
    totalAbsences: absenceMap.get(c.id) || 0,
  }));

  return {
    classes: classesList,
    teachers: waliKelasUsers,
  };
}
