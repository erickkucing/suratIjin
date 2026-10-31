import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { db } from "@/db";
import { classes, students, attendanceRecords } from "@/db/schema";
import { eq, and, gte, lte, asc } from "drizzle-orm";
import { checkRateLimit, recordFailedAttempt } from "@/lib/rate-limiter";
import { getCache, setCache } from "@/lib/redis";
import { getLocalDateString } from "@/lib/date-utils";
import { getAutoAcademicPeriod } from "@/lib/academic-year";
import {
  detectAttendanceAnomalies,
  detectAtRiskStudents,
  AtRiskStudent,
} from "@/lib/attendance-anomaly-detector";
import {
  generateAttendanceInsightsWithAi,
  generateFallbackAttendanceInsights,
  AttendanceInsightsAiResult,
  INSIGHTS_CACHE_TTL,
} from "@/lib/ai-router";
import { z } from "zod";

const INDONESIAN_MONTH_NAMES = [
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

const insightsQuerySchema = z.object({
  classId: z.coerce.number().positive("classId wajib diisi dan berupa angka positif."),
  period: z.enum(["month", "semester"]).optional().default("month"),
  targetMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Format targetMonth harus YYYY-MM.")
    .optional(),
  bypassAi: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((val) => val === true || val === "true" || val === "1"),
  forceRefresh: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((val) => val === true || val === "true" || val === "1"),
});

export type AttendanceInsightsPayload = z.infer<typeof insightsQuerySchema>;

export interface AttendanceInsightsApiResponse {
  success: boolean;
  period: "month" | "semester";
  periodTitle: string;
  summaryStats: {
    totalStudents: number;
    totalAbsences: number;
    totalAlpa: number;
    totalIzin: number;
    totalSakit: number;
    totalSuratBelum: number;
    dayOfWeekDistribution?: {
      senin: number;
      selasa: number;
      rabu: number;
      kamis: number;
      jumat: number;
      sabtu: number;
    };
    doctorNoteCompliancePercent?: number;
    peakAbsenceDay?: string | null;
  };
  atRiskStudents: AtRiskStudent[];
  narratives: {
    executiveSummary: string;
    principalReport: string;
    parentGroupMessage: string;
    bkRecommendations: Array<{
      studentName: string;
      riskLevel: "Kritis" | "Waspada" | "Perhatian";
      recommendation: string;
    }>;
  };
  cached: boolean;
  aiGenerated: boolean;
}

/**
 * Shared core handler for both POST and GET methods.
 */
async function handleAttendanceInsights(
  request: NextRequest,
  isPost: boolean
): Promise<NextResponse> {
  try {
    // 1. Authentication
    let user = await getCurrentUser();
    if (!user) {
      const cookieHeader = request.headers.get("cookie") || "";
      const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
      const token =
        request.cookies?.get?.(SESSION_COOKIE_NAME)?.value ||
        (match ? match[1] : null);
      if (token) {
        user = await verifySessionToken(token);
      }
    }

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Sesi tidak valid. Silakan login kembali." },
        { status: 401 }
      );
    }

    // 2. Rate Limiting: 10 requests per minute per user
    const rateLimitKey = `attendance-insights:${user.id}`;
    const rateCheck = await checkRateLimit(rateLimitKey, 10, 60_000);
    if (rateCheck.isBlocked) {
      return NextResponse.json(
        {
          success: false,
          error: "Terlalu banyak permintaan wawasan presensi AI. Silakan tunggu 1 menit.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateCheck.retryAfterSeconds || 60),
          },
        }
      );
    }
    await recordFailedAttempt(rateLimitKey, 10, 60_000);

    // 3. Extract and Validate Input Parameters
    let rawInput: Record<string, unknown> = {};

    if (isPost) {
      try {
        const body = await request.json();
        if (body && typeof body === "object") {
          rawInput = { ...body };
        }
      } catch {
        // Fallback to query parameters if body is empty or non-JSON
      }
    }

    // Safe URL parsing for both NextRequest and standard Request
    const url = new URL(request.url, "http://localhost:3000");
    const searchParams = url.searchParams;
    if (rawInput.classId === undefined && searchParams.has("classId")) {
      rawInput.classId = searchParams.get("classId");
    }
    if (rawInput.period === undefined && searchParams.has("period")) {
      rawInput.period = searchParams.get("period");
    }
    if (rawInput.targetMonth === undefined && searchParams.has("targetMonth")) {
      rawInput.targetMonth = searchParams.get("targetMonth");
    }
    if (rawInput.bypassAi === undefined && searchParams.has("bypassAi")) {
      rawInput.bypassAi = searchParams.get("bypassAi");
    }
    if (rawInput.forceRefresh === undefined && searchParams.has("forceRefresh")) {
      rawInput.forceRefresh = searchParams.get("forceRefresh");
    }

    const parsed = insightsQuerySchema.safeParse(rawInput);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message || "Parameter tidak valid.",
        },
        { status: 400 }
      );
    }

    const { classId, period, targetMonth, bypassAi, forceRefresh } = parsed.data;

    // 4. Authorization: Class Existence & Permission Check
    const cls = await db.query.classes.findFirst({
      where: eq(classes.id, classId),
    });

    if (!cls) {
      return NextResponse.json(
        { success: false, error: "Kelas tidak ditemukan." },
        { status: 404 }
      );
    }

    if (user.role !== "superadmin" && cls.waliKelasId !== user.id) {
      return NextResponse.json(
        { success: false, error: "Anda tidak memiliki izin mengakses wawasan AI kelas ini." },
        { status: 403 }
      );
    }

    // 5. Redis Cache Check
    const cacheKey = `cache:ai:insights:${classId}:${period}:${targetMonth || "all"}`;
    if (!forceRefresh && !bypassAi) {
      const cached = await getCache<AttendanceInsightsApiResponse>(cacheKey);
      if (cached) {
        return NextResponse.json({
          ...cached,
          cached: true,
        });
      }
    }

    // 6. Calculate Date Range Boundaries
    const now = new Date();
    let startDate: string;
    let endDate: string;
    let periodTitle: string;
    const effectiveMonth = targetMonth || getLocalDateString(now).slice(0, 7);

    if (period === "month") {
      const [yearStr, monthStr] = effectiveMonth.split("-");
      const y = parseInt(yearStr, 10);
      const m = parseInt(monthStr, 10);
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();

      startDate = `${effectiveMonth}-01`;
      endDate = `${effectiveMonth}-${String(lastDay).padStart(2, "0")}`;
      periodTitle = `Bulan ${INDONESIAN_MONTH_NAMES[m - 1] || monthStr} ${y}`;
    } else {
      // Semester
      const autoPeriod = getAutoAcademicPeriod(now);
      const isGanjil =
        cls.periodTitle?.toLowerCase().includes("ganjil") ||
        autoPeriod.semester === "ganjil";

      if (isGanjil) {
        startDate = `${autoPeriod.startYear}-07-01`;
        endDate = `${autoPeriod.startYear}-12-31`;
      } else {
        startDate = `${autoPeriod.endYear}-01-01`;
        endDate = `${autoPeriod.endYear}-06-30`;
      }

      periodTitle = `${cls.periodTitle || autoPeriod.periodTitle} T.A. ${
        cls.academicYear || autoPeriod.academicYear
      }`;
    }

    // 7. Fetch Database Records
    const activeStudents = await db.query.students.findMany({
      where: and(eq(students.classId, classId), eq(students.isActive, true)),
      orderBy: [asc(students.name)],
    });

    const records = await db.query.attendanceRecords.findMany({
      where: and(
        eq(attendanceRecords.classId, classId),
        gte(attendanceRecords.attendanceDate, startDate),
        lte(attendanceRecords.attendanceDate, endDate)
      ),
      orderBy: [asc(attendanceRecords.attendanceDate)],
    });

    // 8. Compute Exact Local Math & Anomaly Rules
    let totalAlpa = 0;
    let totalIzin = 0;
    let totalSakit = 0;
    let totalSuratBelum = 0;

    for (const r of records) {
      if (r.status === "Alpa") totalAlpa++;
      else if (r.status === "Izin") totalIzin++;
      else if (r.status === "Sakit") totalSakit++;

      if ((r.status === "Izin" || r.status === "Sakit") && r.letterStatus === "Belum") {
        totalSuratBelum++;
      }
    }

    const studentMap = new Map(activeStudents.map((s) => [s.id, s.name]));
    const recordsWithStudent = records.map((r) => ({
      ...r,
      studentName: studentMap.get(r.studentId) || "Siswa",
    }));

    const { summary: anomalySummary, atRiskStudents } = detectAttendanceAnomalies(activeStudents, recordsWithStudent, {
      period,
      targetMonth: period === "month" ? effectiveMonth : undefined,
      dateStart: startDate,
      dateEnd: endDate,
    });

    const summaryStats = {
      totalStudents: activeStudents.length,
      totalAbsences: records.length,
      totalAlpa,
      totalIzin,
      totalSakit,
      totalSuratBelum,
      dayOfWeekDistribution: anomalySummary.dayOfWeekDistribution,
      doctorNoteCompliancePercent: anomalySummary.doctorNoteCompliancePercent,
      peakAbsenceDay: anomalySummary.peakAbsenceDay,
    };

    // 9. Synthesis Narrative Generation (AI Router with Local Fallback)
    let aiResult: AttendanceInsightsAiResult;

    if (bypassAi) {
      const fallback = generateFallbackAttendanceInsights({
        className: cls.name,
        period,
        periodLabel: periodTitle,
        summaryStats,
        atRiskStudents,
      });
      aiResult = {
        ...fallback,
        aiGenerated: false,
      };
    } else {
      try {
        const rawAi = await generateAttendanceInsightsWithAi({
          className: cls.name,
          period,
          periodLabel: periodTitle,
          summaryStats,
          atRiskStudents,
        });
        if (rawAi && typeof rawAi === "object" && typeof rawAi.executiveSummary === "string") {
          aiResult = rawAi;
        } else {
          const fallback = generateFallbackAttendanceInsights({
            className: cls.name,
            period,
            periodLabel: periodTitle,
            summaryStats,
            atRiskStudents,
          });
          aiResult = {
            ...fallback,
            aiGenerated: false,
          };
        }
      } catch (err: unknown) {
        console.warn(
          "[Attendance Insights API] 9router AI synthesis failed, activating graceful degradation fallback:",
          err instanceof Error ? err.message : err
        );
        const fallback = generateFallbackAttendanceInsights({
          className: cls.name,
          period,
          periodLabel: periodTitle,
          summaryStats,
          atRiskStudents,
        });
        aiResult = {
          ...fallback,
          aiGenerated: false,
        };
      }
    }

    const responsePayload: AttendanceInsightsApiResponse = {
      success: true,
      period,
      periodTitle,
      summaryStats,
      atRiskStudents,
      narratives: {
        executiveSummary: aiResult.executiveSummary,
        principalReport: aiResult.principalReport,
        parentGroupMessage: aiResult.parentGroupMessage,
        bkRecommendations: aiResult.bkRecommendations,
      },
      cached: false,
      aiGenerated: aiResult.aiGenerated,
    };

    // 10. Cache in Redis on AI Generation Success (12h TTL)
    if (!bypassAi && aiResult.aiGenerated) {
      await setCache(cacheKey, responsePayload, INSIGHTS_CACHE_TTL);
    }

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (err: unknown) {
    console.error("[Attendance Insights API] Internal server error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Terjadi kesalahan server internal.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleAttendanceInsights(request, true);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleAttendanceInsights(request, false);
}
