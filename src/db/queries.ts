import { db } from "./index";
import { classes, students, attendanceRecords, users, Student, AttendanceRecord } from "./schema";
import { eq, and, gte, lte, sql, inArray, desc, asc } from "drizzle-orm";

export interface DashboardFilters {
  dateStart?: string;
  dateEnd?: string;
  studentId?: number;
  status?: string; // "Semua" | "Izin" | "Sakit" | "Alpa"
  letterStatus?: string; // "Semua" | "Sudah" | "Belum" | "Belum_Izin_Sakit"
}

export interface AttendanceRecordWithStudent extends AttendanceRecord {
  studentName: string;
}

export interface MonthlyChartData {
  month: string; // "YYYY-MM"
  label: string; // e.g. "September 2026"
  izin: number;
  sakit: number;
  alpa: number;
  total: number;
}

export interface DashboardData {
  classInfo: typeof classes.$inferSelect;
  studentsList: Student[];
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

  // 1. Fetch all active students in class
  const studentsList = await db
    .select()
    .from(students)
    .where(and(eq(students.classId, classId), eq(students.isActive, true)))
    .orderBy(asc(students.name));

  // 2. Build where conditions for filtered attendance records
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

  // 3. Query filtered records
  const recordsWithStudent = await db
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
    .orderBy(desc(attendanceRecords.attendanceDate), desc(attendanceRecords.id));

  // 4. Compute summary statistics (within date range if provided)
  const summaryConditions = [eq(attendanceRecords.classId, classId)];
  if (filters.dateStart) {
    summaryConditions.push(gte(attendanceRecords.attendanceDate, filters.dateStart));
  }
  if (filters.dateEnd) {
    summaryConditions.push(lte(attendanceRecords.attendanceDate, filters.dateEnd));
  }

  const [summaryRow] = await db
    .select({
      totalAlpa: sql<number>`COALESCE(SUM(CASE WHEN ${attendanceRecords.status} = 'Alpa' THEN 1 ELSE 0 END), 0)`,
      totalIzin: sql<number>`COALESCE(SUM(CASE WHEN ${attendanceRecords.status} = 'Izin' THEN 1 ELSE 0 END), 0)`,
      totalSakit: sql<number>`COALESCE(SUM(CASE WHEN ${attendanceRecords.status} = 'Sakit' THEN 1 ELSE 0 END), 0)`,
      totalSuratBelum: sql<number>`COALESCE(SUM(CASE WHEN ${attendanceRecords.status} IN ('Izin', 'Sakit') AND ${attendanceRecords.letterStatus} = 'Belum' THEN 1 ELSE 0 END), 0)`,
      totalRecords: sql<number>`COUNT(*)`,
    })
    .from(attendanceRecords)
    .where(and(...summaryConditions));

  // 5. Monthly chart aggregation
  const monthlyRows = await db
    .select({
      monthYear: sql<string>`DATE_FORMAT(${attendanceRecords.attendanceDate}, '%Y-%m')`,
      izin: sql<number>`COALESCE(SUM(CASE WHEN ${attendanceRecords.status} = 'Izin' THEN 1 ELSE 0 END), 0)`,
      sakit: sql<number>`COALESCE(SUM(CASE WHEN ${attendanceRecords.status} = 'Sakit' THEN 1 ELSE 0 END), 0)`,
      alpa: sql<number>`COALESCE(SUM(CASE WHEN ${attendanceRecords.status} = 'Alpa' THEN 1 ELSE 0 END), 0)`,
      total: sql<number>`COUNT(*)`,
    })
    .from(attendanceRecords)
    .where(eq(attendanceRecords.classId, classId))
    .groupBy(sql`DATE_FORMAT(${attendanceRecords.attendanceDate}, '%Y-%m')`)
    .orderBy(sql`DATE_FORMAT(${attendanceRecords.attendanceDate}, '%Y-%m') ASC`);

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

  // 6. 100% Attendance Appreciation: Active students with zero absences within the period
  // We perform an anti-join (LEFT JOIN ... WHERE attendance_records.id IS NULL)
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

  const students100Percent = await db
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
    .orderBy(asc(students.name));

  return {
    classInfo: classItem,
    studentsList,
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
  const classesList = await db
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
      totalStudents: sql<number>`(SELECT COUNT(*) FROM students WHERE students.class_id = ${classes.id} AND students.is_active = 1)`,
      totalAbsences: sql<number>`(SELECT COUNT(*) FROM attendance_records WHERE attendance_records.class_id = ${classes.id})`,
    })
    .from(classes)
    .leftJoin(users, eq(classes.waliKelasId, users.id))
    .orderBy(asc(classes.name));

  const waliKelasUsers = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.role, "wali_kelas"))
    .orderBy(asc(users.displayName));

  return {
    classes: classesList,
    teachers: waliKelasUsers,
  };
}
