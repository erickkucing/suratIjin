import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST, GET } from "../attendance-insights/route";
import { INSIGHTS_CACHE_TTL } from "@/lib/ai-router";
import { db } from "@/db";
import { users, classes, students, attendanceRecords } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { _clearRateLimitStoreForTesting } from "@/lib/rate-limiter";
import * as redisModule from "@/lib/redis";
import * as aiRouterModule from "@/lib/ai-router";

// Mock AI router functions
vi.mock("@/lib/ai-router", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai-router")>("@/lib/ai-router");
  return {
    ...actual,
    getAiRouterConfig: vi.fn().mockResolvedValue({
      enabled: true,
      baseUrl: "http://127.0.0.1:20128/v1",
      apiKey: "test-key",
      model: "gemini/gemini-3.8-flash",
    }),
    generateAttendanceInsightsWithAi: vi.fn().mockResolvedValue({
      executiveSummary: "Ringkasan evaluasi kehadiran kelas XII TKJ 2...",
      principalReport: "Laporan formal Kepala Sekolah...",
      parentGroupMessage: "Pesan hangat untuk Paguyuban WhatsApp...",
      bkRecommendations: [
        {
          studentName: "Budi Santoso",
          riskLevel: "Kritis",
          recommendation: "Panggil orang tua dan lakukan konseling.",
        },
      ],
      aiGenerated: true,
    }),
  };
});

describe("Attendance Insights API Route (/api/ai/attendance-insights)", () => {
  beforeEach(() => {
    _clearRateLimitStoreForTesting();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Authentication & Authorization", () => {
    it("should return 401 when request is unauthenticated", async () => {
      const req = new Request("http://localhost:3000/api/ai/attendance-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId: 1 }),
      });

      const res = await POST(req as any);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Sesi tidak valid");
    });

    it("should return 404 when target class does not exist", async () => {
      const admin = await db.query.users.findFirst({ where: eq(users.role, "superadmin") });
      if (!admin) throw new Error("Superadmin not found");

      const token = await createSessionToken({
        id: admin.id,
        username: admin.username,
        displayName: admin.displayName,
        role: admin.role,
      });

      const req = new Request("http://localhost:3000/api/ai/attendance-insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
        body: JSON.stringify({ classId: 999999 }),
      });

      const res = await POST(req as any);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Kelas tidak ditemukan");
    });

    it("should return 403 when teacher is not assigned to target class", async () => {
      // Find teacher
      const teacher = await db.query.users.findFirst({ where: eq(users.role, "wali_kelas") });
      if (!teacher) throw new Error("Teacher user not found");

      // Find class
      const targetClass = await db.query.classes.findFirst({
        where: and(eq(classes.isActive, true)),
      });
      if (!targetClass) throw new Error("Class not found");

      const targetClassId = targetClass.id;
      const originalWaliId = targetClass.waliKelasId;

      try {
        // Temporarily set waliKelasId to null so teacher does not match
        await db
          .update(classes)
          .set({ waliKelasId: null })
          .where(eq(classes.id, targetClassId));

        const token = await createSessionToken({
          id: teacher.id,
          username: teacher.username,
          displayName: teacher.displayName,
          role: teacher.role,
        });

        const req = new Request("http://localhost:3000/api/ai/attendance-insights", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: `${SESSION_COOKIE_NAME}=${token}`,
          },
          body: JSON.stringify({ classId: targetClassId }),
        });

        const res = await POST(req as any);
        expect(res.status).toBe(403);
        const json = await res.json();
        expect(json.success).toBe(false);
        expect(json.error).toContain("tidak memiliki izin");
      } finally {
        // Restore original waliKelasId
        await db
          .update(classes)
          .set({ waliKelasId: originalWaliId })
          .where(eq(classes.id, targetClassId));
      }
    });
  });

  describe("2. Parameter Validation", () => {
    it("should return 400 when classId is missing or non-positive", async () => {
      const admin = await db.query.users.findFirst({ where: eq(users.role, "superadmin") });
      if (!admin) throw new Error("Superadmin not found");

      const token = await createSessionToken({
        id: admin.id,
        username: admin.username,
        displayName: admin.displayName,
        role: admin.role,
      });

      const req = new Request("http://localhost:3000/api/ai/attendance-insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
        body: JSON.stringify({ classId: -5 }),
      });

      const res = await POST(req as any);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("classId");
    });

    it("should return 400 when targetMonth format is invalid", async () => {
      const admin = await db.query.users.findFirst({ where: eq(users.role, "superadmin") });
      if (!admin) throw new Error("Superadmin not found");

      const token = await createSessionToken({
        id: admin.id,
        username: admin.username,
        displayName: admin.displayName,
        role: admin.role,
      });

      const req = new Request("http://localhost:3000/api/ai/attendance-insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
        body: JSON.stringify({ classId: 1, targetMonth: "invalid-month" }),
      });

      const res = await POST(req as any);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("YYYY-MM");
    });
  });

  describe("3. Rate Limiting", () => {
    it("should block request with 429 when rate limit is exceeded (> 10 req/min)", async () => {
      const admin = await db.query.users.findFirst({ where: eq(users.role, "superadmin") });
      if (!admin) throw new Error("Superadmin not found");

      const token = await createSessionToken({
        id: admin.id,
        username: admin.username,
        displayName: admin.displayName,
        role: admin.role,
      });

      const makeRequest = () =>
        new Request("http://localhost:3000/api/ai/attendance-insights", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: `${SESSION_COOKIE_NAME}=${token}`,
          },
          body: JSON.stringify({ classId: 1, bypassAi: true }),
        });

      // Execute 10 requests
      for (let i = 0; i < 10; i++) {
        const res = await POST(makeRequest() as any);
        expect(res.status).not.toBe(429);
      }

      // 11th request should be blocked
      const blockedRes = await POST(makeRequest() as any);
      expect(blockedRes.status).toBe(429);
      expect(blockedRes.headers.get("Retry-After")).toBeDefined();
      const json = await blockedRes.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Terlalu banyak permintaan");
    });
  });

  describe("4. Caching & Redis Integration", () => {
    it("should return cached data immediately when cache hit occurs", async () => {
      const admin = await db.query.users.findFirst({ where: eq(users.role, "superadmin") });
      if (!admin) throw new Error("Superadmin not found");
      const targetClass = await db.query.classes.findFirst({ where: eq(classes.isActive, true) });
      const testClassId = targetClass ? targetClass.id : 1;

      const token = await createSessionToken({
        id: admin.id,
        username: admin.username,
        displayName: admin.displayName,
        role: admin.role,
      });

      const cachedPayload = {
        success: true,
        period: "month" as const,
        periodTitle: "Bulan Oktober 2026",
        summaryStats: {
          totalStudents: 30,
          totalAbsences: 5,
          totalAlpa: 1,
          totalIzin: 2,
          totalSakit: 2,
          totalSuratBelum: 1,
        },
        atRiskStudents: [],
        narratives: {
          executiveSummary: "From cache executive summary",
          principalReport: "From cache principal report",
          parentGroupMessage: "From cache parent message",
          bkRecommendations: [],
        },
        cached: true,
        aiGenerated: true,
      };

      vi.spyOn(redisModule, "getCache").mockResolvedValue(cachedPayload);

      const req = new Request("http://localhost:3000/api/ai/attendance-insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
        body: JSON.stringify({ classId: testClassId, period: "month", targetMonth: "2026-10" }),
      });

      const res = await POST(req as any);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.cached).toBe(true);
      expect(json.narratives.executiveSummary).toBe("From cache executive summary");
      // AI router should not have been called
      expect(aiRouterModule.generateAttendanceInsightsWithAi).not.toHaveBeenCalled();
    });

    it("should bypass cache when forceRefresh is true", async () => {
      const admin = await db.query.users.findFirst({ where: eq(users.role, "superadmin") });
      if (!admin) throw new Error("Superadmin not found");
      const targetClass = await db.query.classes.findFirst({ where: eq(classes.isActive, true) });
      const testClassId = targetClass ? targetClass.id : 1;

      const token = await createSessionToken({
        id: admin.id,
        username: admin.username,
        displayName: admin.displayName,
        role: admin.role,
      });

      vi.spyOn(redisModule, "getCache").mockResolvedValue({ cached: true });
      const setCacheSpy = vi.spyOn(redisModule, "setCache").mockResolvedValue(true);
      vi.spyOn(aiRouterModule, "generateAttendanceInsightsWithAi").mockResolvedValue({
        executiveSummary: "Generated summary",
        principalReport: "Generated report",
        parentGroupMessage: "Generated parent message",
        bkRecommendations: [],
        aiGenerated: true,
      });

      const req = new Request("http://localhost:3000/api/ai/attendance-insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
        body: JSON.stringify({ classId: testClassId, period: "month", forceRefresh: true }),
      });

      const res = await POST(req as any);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.cached).toBe(false);
      expect(aiRouterModule.generateAttendanceInsightsWithAi).toHaveBeenCalled();
      expect(setCacheSpy).toHaveBeenCalledWith(
        expect.stringContaining(`cache:ai:insights:${testClassId}:month:`),
        expect.anything(),
        INSIGHTS_CACHE_TTL
      );
    });
  });

  describe("5. AI Synthesis & Graceful Degradation", () => {
    it("should use local fallback narratives when bypassAi is true without calling AI", async () => {
      const admin = await db.query.users.findFirst({ where: eq(users.role, "superadmin") });
      if (!admin) throw new Error("Superadmin not found");
      const targetClass = await db.query.classes.findFirst({ where: eq(classes.isActive, true) });
      const testClassId = targetClass ? targetClass.id : 1;

      const token = await createSessionToken({
        id: admin.id,
        username: admin.username,
        displayName: admin.displayName,
        role: admin.role,
      });

      const aiSpy = vi.spyOn(aiRouterModule, "generateAttendanceInsightsWithAi");

      const req = new Request("http://localhost:3000/api/ai/attendance-insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
        body: JSON.stringify({ classId: testClassId, period: "month", bypassAi: true }),
      });

      const res = await POST(req as any);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.aiGenerated).toBe(false);
      expect(json.narratives.executiveSummary).toBeDefined();
      expect(json.narratives.principalReport).toBeDefined();
      expect(json.narratives.parentGroupMessage).toBeDefined();
      expect(aiSpy).not.toHaveBeenCalled();
    });

    it("should gracefully degrade to local fallback narrative when AI router throws an error", async () => {
      const admin = await db.query.users.findFirst({ where: eq(users.role, "superadmin") });
      if (!admin) throw new Error("Superadmin not found");
      const targetClass = await db.query.classes.findFirst({ where: eq(classes.isActive, true) });
      const testClassId = targetClass ? targetClass.id : 1;

      const token = await createSessionToken({
        id: admin.id,
        username: admin.username,
        displayName: admin.displayName,
        role: admin.role,
      });

      vi.spyOn(aiRouterModule, "generateAttendanceInsightsWithAi").mockRejectedValue(
        new Error("9router AI timeout after 15s")
      );

      const req = new Request("http://localhost:3000/api/ai/attendance-insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
        body: JSON.stringify({ classId: testClassId, period: "month" }),
      });

      const res = await POST(req as any);
      expect(res.status).toBe(200); // Must be 200, not 500
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.aiGenerated).toBe(false);
      expect(json.narratives.principalReport).toContain("Pimpinan Sekolah");
    });
  });

  describe("6. GET Method Support", () => {
    it("should process query searchParams correctly via GET request", async () => {
      const admin = await db.query.users.findFirst({ where: eq(users.role, "superadmin") });
      if (!admin) throw new Error("Superadmin not found");
      const targetClass = await db.query.classes.findFirst({ where: eq(classes.isActive, true) });
      const testClassId = targetClass ? targetClass.id : 1;

      const token = await createSessionToken({
        id: admin.id,
        username: admin.username,
        displayName: admin.displayName,
        role: admin.role,
      });

      const req = new Request(
        `http://localhost:3000/api/ai/attendance-insights?classId=${testClassId}&period=month&targetMonth=2026-10&bypassAi=true`,
        {
          method: "GET",
          headers: {
            cookie: `${SESSION_COOKIE_NAME}=${token}`,
          },
        }
      );

      const res = await GET(req as any);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.period).toBe("month");
      expect(json.periodTitle).toContain("Oktober 2026");
      expect(json.summaryStats).toBeDefined();
      expect(json.atRiskStudents).toBeDefined();
    });
  });
});
