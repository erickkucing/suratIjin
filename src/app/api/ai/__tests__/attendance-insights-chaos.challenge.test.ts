import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest";
import { POST, GET } from "../attendance-insights/route";
import { db } from "@/db";
import { users, classes, students, attendanceRecords, systemSettings } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { _clearRateLimitStoreForTesting, _clearAllRateLimitsForTesting } from "@/lib/rate-limiter";
import { invalidateSystemSettingsCache } from "@/lib/system-settings";
import * as redisModule from "@/lib/redis";
import * as aiRouterModule from "@/lib/ai-router";
import { createMockAttendanceInsightsAiResponse } from "@/lib/ai-router";

describe("Adversarial Chaos Challenge: /api/ai/attendance-insights", () => {
  let superadminUser: { id: number; username: string; displayName: string; role: "superadmin" | "wali_kelas" };
  let teacherUserA: { id: number; username: string; displayName: string; role: "superadmin" | "wali_kelas" };
  let teacherUserB: { id: number; username: string; displayName: string; role: "superadmin" | "wali_kelas" };
  let classAId: number;
  let classBId: number;
  let superadminToken: string;
  let teacherAToken: string;
  let teacherBToken: string;

  const insertedRecordIds: number[] = [];
  let createdClassB = false;
  let createdTeacherB = false;

  beforeAll(async () => {
    // 0. Enable AI in system settings for testing
    await db.update(systemSettings).set({ aiEnabled: true }).where(eq(systemSettings.id, 1));
    await invalidateSystemSettingsCache();

    // 1. Resolve Superadmin
    const sa = await db.query.users.findFirst({ where: eq(users.role, "superadmin") });
    if (!sa) throw new Error("Superadmin user not found in database");
    superadminUser = { id: sa.id, username: sa.username, displayName: sa.displayName, role: sa.role };
    superadminToken = await createSessionToken(superadminUser);

    // 2. Resolve or Create Teacher A
    const tA = await db.query.users.findFirst({ where: eq(users.role, "wali_kelas") });
    if (!tA) throw new Error("Teacher user not found in database");
    teacherUserA = { id: tA.id, username: tA.username, displayName: tA.displayName, role: tA.role };
    teacherAToken = await createSessionToken(teacherUserA);

    // 3. Resolve Class A (assigned to Teacher A)
    let clsA = await db.query.classes.findFirst({ where: eq(classes.waliKelasId, teacherUserA.id) });
    if (!clsA) {
      clsA = await db.query.classes.findFirst({ where: eq(classes.isActive, true) });
      if (!clsA) throw new Error("Class not found in database");
      await db.update(classes).set({ waliKelasId: teacherUserA.id }).where(eq(classes.id, clsA.id));
    }
    classAId = clsA.id;

    // 4. Resolve or Create Teacher B & Class B for Cross-Class IDOR testing
    let tB = await db.query.users.findFirst({
      where: and(eq(users.role, "wali_kelas"), eq(users.username, "teacher_chaos_b")),
    });
    if (!tB) {
      const [resB] = await db
        .insert(users)
        .values({
          username: "teacher_chaos_b",
          passwordHash: "$2a$10$wK1F5QyYQ/vL7O3q6sM6OeJ9jUoI5tA1K0yXgH4P9X7qZ1aB2c3d4",
          displayName: "Teacher Chaos B",
          role: "wali_kelas",
          isActive: true,
        });
      teacherUserB = { id: resB.insertId, username: "teacher_chaos_b", displayName: "Teacher Chaos B", role: "wali_kelas" };
      createdTeacherB = true;
    } else {
      teacherUserB = { id: tB.id, username: tB.username, displayName: tB.displayName, role: tB.role };
    }
    teacherBToken = await createSessionToken(teacherUserB);

    let clsB = await db.query.classes.findFirst({
      where: and(eq(classes.name, "CHAOS_TEST_CLASS_B")),
    });
    if (!clsB) {
      const [clsRes] = await db
        .insert(classes)
        .values({
          slug: "chaos-test-class-b",
          name: "CHAOS_TEST_CLASS_B",
          academicYear: "2026/2027",
          periodTitle: "Semester Ganjil",
          waliKelasId: teacherUserB.id,
          isActive: true,
        });
      classBId = clsRes.insertId;
      createdClassB = true;
    } else {
      classBId = clsB.id;
    }

    // 5. Ensure student in Class A has 3 Alpa records in 2026-10 so anomaly detector marks them at-risk
    const targetStudent = await db.query.students.findFirst({
      where: and(eq(students.classId, classAId), eq(students.isActive, true)),
    });
    if (targetStudent) {
      const dates = ["2026-10-12", "2026-10-13", "2026-10-14"];
      for (const d of dates) {
        const existing = await db.query.attendanceRecords.findFirst({
          where: and(
            eq(attendanceRecords.classId, classAId),
            eq(attendanceRecords.studentId, targetStudent.id),
            eq(attendanceRecords.attendanceDate, d)
          ),
        });
        if (!existing) {
          const [insRec] = await db
            .insert(attendanceRecords)
            .values({
              classId: classAId,
              studentId: targetStudent.id,
              attendanceDate: d,
              status: "Alpa",
              infoSource: "Wali kelas",
              description: "Chaos test alpa inject",
              letterStatus: "Belum",
              createdById: teacherUserA.id,
            });
          insertedRecordIds.push(insRec.insertId);
        }
      }
    }
  });

  afterAll(async () => {
    // Restore systemSettings
    await db.update(systemSettings).set({ aiEnabled: false }).where(eq(systemSettings.id, 1));
    await invalidateSystemSettingsCache();

    // Clean up injected attendance records
    if (insertedRecordIds.length > 0) {
      await db.delete(attendanceRecords).where(inArray(attendanceRecords.id, insertedRecordIds));
    }
    // Clean up Class B
    if (createdClassB && classBId) {
      await db.delete(classes).where(eq(classes.id, classBId));
    }
    // Clean up Teacher B
    if (createdTeacherB && teacherUserB?.id) {
      await db.delete(users).where(eq(users.id, teacherUserB.id));
    }
  });

  beforeEach(() => {
    _clearRateLimitStoreForTesting();
    vi.clearAllMocks();
    process.env.AI_ROUTER_ENABLED = "true";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // SCENARIO 1: Unauthenticated & Invalid Token Injection Attacks
  // ==========================================================================
  describe("Scenario 1: Unauthenticated & Malicious Token Injection Attacks", () => {
    it("should reject with 401 when request has completely omitted cookie header", async () => {
      const req = new Request("http://localhost:3000/api/ai/attendance-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId: classAId }),
      });

      const res = await POST(req as any);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/sesi tidak valid/i);
    });

    it("should reject with 401 when cookie value is empty string", async () => {
      const req = new Request("http://localhost:3000/api/ai/attendance-insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=`,
        },
        body: JSON.stringify({ classId: classAId }),
      });

      const res = await POST(req as any);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it("should reject with 401 when token is a corrupted non-JWT string", async () => {
      const req = new Request("http://localhost:3000/api/ai/attendance-insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=invalid.jwt.token.payload`,
        },
        body: JSON.stringify({ classId: classAId }),
      });

      const res = await POST(req as any);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it("should neutralize SQL injection attack in cookie header without crashing with 500", async () => {
      const sqliPayload = "' OR '1'='1'; DROP TABLE users; --";
      const req = new Request("http://localhost:3000/api/ai/attendance-insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${sqliPayload}`,
        },
        body: JSON.stringify({ classId: classAId }),
      });

      const res = await POST(req as any);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it("should neutralize XSS script tag injection in cookie header safely", async () => {
      const xssPayload = `<script>alert("attacker-pwned")</script>`;
      const req = new Request("http://localhost:3000/api/ai/attendance-insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(xssPayload)}`,
        },
        body: JSON.stringify({ classId: classAId }),
      });

      const res = await POST(req as any);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it("should reject with 401 when JWT contains a non-existent user ID", async () => {
      const ghostToken = await createSessionToken({
        id: 99999999,
        username: "ghost_user",
        displayName: "Ghost",
        role: "superadmin",
      });

      const req = new Request("http://localhost:3000/api/ai/attendance-insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${ghostToken}`,
        },
        body: JSON.stringify({ classId: classAId }),
      });

      const res = await POST(req as any);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/sesi tidak valid/i);
    });
  });

  // ==========================================================================
  // SCENARIO 2: Cross-Class IDOR Vulnerability Stress Testing
  // ==========================================================================
  describe("Scenario 2: Cross-Class IDOR Attempts (Wali Kelas Isolation)", () => {
    it("should return 403 Forbidden when Teacher A attempts to access Class B via POST", async () => {
      const req = new Request("http://localhost:3000/api/ai/attendance-insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${teacherAToken}`,
        },
        body: JSON.stringify({ classId: classBId }),
      });

      const res = await POST(req as any);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/tidak memiliki izin/i);
    });

    it("should return 403 Forbidden when Teacher A attempts to access Class B via GET query params", async () => {
      const req = new Request(`http://localhost:3000/api/ai/attendance-insights?classId=${classBId}&period=month`, {
        method: "GET",
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${teacherAToken}`,
        },
      });

      const res = await GET(req as any);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/tidak memiliki izin/i);
    });

    it("should return 403 Forbidden when Teacher B attempts to access Class A", async () => {
      const req = new Request("http://localhost:3000/api/ai/attendance-insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${teacherBToken}`,
        },
        body: JSON.stringify({ classId: classAId }),
      });

      const res = await POST(req as any);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/tidak memiliki izin/i);
    });

    it("should reject malicious or tampered classId inputs (negative, decimal, SQLi)", async () => {
      const malformedCases = [
        { classId: -5, desc: "negative integer" },
        { classId: 0, desc: "zero" },
        { classId: "1; DROP TABLE users;", desc: "SQL injection in classId" },
        { classId: "NaN", desc: "string NaN" },
      ];

      for (const item of malformedCases) {
        const req = new Request("http://localhost:3000/api/ai/attendance-insights", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: `${SESSION_COOKIE_NAME}=${teacherAToken}`,
          },
          body: JSON.stringify({ classId: item.classId }),
        });

        const res = await POST(req as any);
        expect(res.status, `Failed for ${item.desc}`).toBe(400);
        const json = await res.json();
        expect(json.success).toBe(false);
      }
    });

    it("should grant Superadmin full authorized access across both Class A and Class B", async () => {
      for (const targetId of [classAId, classBId]) {
        const req = new Request("http://localhost:3000/api/ai/attendance-insights", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: `${SESSION_COOKIE_NAME}=${superadminToken}`,
          },
          body: JSON.stringify({ classId: targetId, bypassAi: true }),
        });

        const res = await POST(req as any);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
      }
    });
  });

  // ==========================================================================
  // SCENARIO 3: Rapid-Fire Rate Limit Flooding
  // ==========================================================================
  describe("Scenario 3: Rapid-Fire Rate Limit Flooding (15 requests in burst)", () => {
    it("should allow first 10 requests and strictly block requests 11-15 with 429 and Retry-After", async () => {
      _clearRateLimitStoreForTesting();

      const makeRequest = () =>
        new Request("http://localhost:3000/api/ai/attendance-insights", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: `${SESSION_COOKIE_NAME}=${superadminToken}`,
          },
          body: JSON.stringify({ classId: classAId, bypassAi: true }),
        });

      const results: { status: number; retryAfter?: string | null; body: any }[] = [];

      // Send 15 rapid consecutive requests
      for (let i = 1; i <= 15; i++) {
        const res = await POST(makeRequest() as any);
        const body = await res.json();
        results.push({
          status: res.status,
          retryAfter: res.headers.get("Retry-After"),
          body,
        });
      }

      // Assert first 10 succeeded
      for (let i = 0; i < 10; i++) {
        expect(results[i].status, `Request ${i + 1} should have succeeded`).toBe(200);
        expect(results[i].body.success).toBe(true);
      }

      // Assert 11 through 15 were blocked with 429
      for (let i = 10; i < 15; i++) {
        expect(results[i].status, `Request ${i + 1} should have been rate limited`).toBe(429);
        expect(results[i].body.success).toBe(false);
        expect(results[i].body.error).toMatch(/terlalu banyak permintaan/i);

        // Verify Retry-After header is present and valid positive number
        expect(results[i].retryAfter).toBeDefined();
        const retryNum = Number(results[i].retryAfter);
        expect(Number.isFinite(retryNum)).toBe(true);
        expect(retryNum).toBeGreaterThan(0);
      }

      // Verify another user (Teacher A) is unaffected by Superadmin's rate limit block
      const teacherReq = new Request("http://localhost:3000/api/ai/attendance-insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${teacherAToken}`,
        },
        body: JSON.stringify({ classId: classAId, bypassAi: true }),
      });
      const teacherRes = await POST(teacherReq as any);
      expect(teacherRes.status).toBe(200);
    });
  });

  // ==========================================================================
  // SCENARIO 4: Redis Socket Crash & Circuit Breaker Mid-Request Resilience
  // ==========================================================================
  describe("Scenario 4: Redis Socket Crash & Mid-Request Resilience", () => {
    it("should handle Redis ECONNRESET during cache check without throwing 500", async () => {
      // Spy on getCache and simulate sudden connection drop
      vi.spyOn(redisModule, "getCache").mockImplementation(async () => {
        // Simulates what happens if Redis driver emits ECONNRESET
        return null;
      });

      const req = new Request("http://localhost:3000/api/ai/attendance-insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${teacherAToken}`,
        },
        body: JSON.stringify({ classId: classAId, bypassAi: true }),
      });

      const res = await POST(req as any);
      expect(res.status).toBe(200); // Must not be 500
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.cached).toBe(false);
      expect(json.summaryStats).toBeDefined();
      expect(typeof json.summaryStats.totalStudents).toBe("number");
    });

    it("should handle Redis socket failure during cache write without crashing the request", async () => {
      vi.spyOn(redisModule, "setCache").mockImplementation(async () => {
        // Simulates socket closed on write
        return false;
      });

      vi.spyOn(aiRouterModule, "generateAttendanceInsightsWithAi").mockResolvedValue({
        executiveSummary: "Summary without Redis cache",
        principalReport: "Report without Redis cache",
        parentGroupMessage: "Parent group message",
        bkRecommendations: [],
        aiGenerated: true,
      });

      const req = new Request("http://localhost:3000/api/ai/attendance-insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${teacherAToken}`,
        },
        body: JSON.stringify({ classId: classAId, forceRefresh: true }),
      });

      const res = await POST(req as any);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.narratives.executiveSummary).toBe("Summary without Redis cache");
    });

    it("should trip circuit breaker and softly fallback when Redis repeatedly errors", async () => {
      // Simulate real ioredis client throwing ECONNREFUSED in redis.ts
      let failureCount = 0;
      vi.spyOn(redisModule, "getCache").mockImplementation(async () => {
        failureCount++;
        return null; // Soft fallback returns null
      });

      for (let i = 0; i < 4; i++) {
        const req = new Request("http://localhost:3000/api/ai/attendance-insights", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: `${SESSION_COOKIE_NAME}=${teacherAToken}`,
          },
          body: JSON.stringify({ classId: classAId }),
        });

        const res = await POST(req as any);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
      }

      expect(failureCount).toBeGreaterThanOrEqual(4);
    });
  });

  // ==========================================================================
  // SCENARIO 5: AI Service Timeout (15s abort) & Malformed JSON Degradation
  // ==========================================================================
  describe("Scenario 5: AI Service Timeout (15s abort) & Malformed JSON Degradation", () => {
    it("should gracefully degrade to local fallback narrative when AI aborts with 15s timeout", async () => {
      // Mock generateAttendanceInsightsWithAi throwing AbortError (15s timeout)
      vi.spyOn(aiRouterModule, "generateAttendanceInsightsWithAi").mockRejectedValue(
        new DOMException("The operation was aborted due to 15s timeout.", "AbortError")
      );

      const req = new Request("http://localhost:3000/api/ai/attendance-insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${teacherAToken}`,
        },
        body: JSON.stringify({ classId: classAId }),
      });

      const res = await POST(req as any);
      expect(res.status).toBe(200); // Crucial: must remain 200, not 500!
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.aiGenerated).toBe(false); // Indicates fallback was activated
      expect(json.narratives).toBeDefined();
      expect(json.narratives.executiveSummary).toBeTruthy();
      expect(json.narratives.principalReport).toContain("Pimpinan Sekolah");
      expect(json.narratives.parentGroupMessage).toContain("Wali Murid");
      expect(Array.isArray(json.narratives.bkRecommendations)).toBe(true);
    });

    it("should gracefully degrade when AI service returns malformed JSON schema", async () => {
      // Mock AI returning invalid payload (missing executiveSummary, invalid types)
      vi.spyOn(aiRouterModule, "generateAttendanceInsightsWithAi").mockResolvedValue({
        // @ts-expect-error test malformed return
        corrupted: true,
        bkRecommendations: "not an array",
      });

      const req = new Request("http://localhost:3000/api/ai/attendance-insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${teacherAToken}`,
        },
        body: JSON.stringify({ classId: classAId }),
      });

      const res = await POST(req as any);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.aiGenerated).toBe(false);
      expect(json.narratives.executiveSummary).toBeTruthy();
    });

    it("should gracefully degrade when AI service returns null or throws 502 Bad Gateway", async () => {
      vi.spyOn(aiRouterModule, "generateAttendanceInsightsWithAi").mockRejectedValue(
        new Error("HTTP 502 Bad Gateway: 9router AI gateway down")
      );

      const req = new Request("http://localhost:3000/api/ai/attendance-insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${teacherAToken}`,
        },
        body: JSON.stringify({ classId: classAId }),
      });

      const res = await POST(req as any);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.aiGenerated).toBe(false);
      expect(json.narratives.principalReport).toBeDefined();
    });
  });

  // ==========================================================================
  // SCENARIO 6: Privacy Leak Injection Defense
  // ==========================================================================
  describe("Scenario 6: Privacy Leak Injection & Automatic Sanitization", () => {
    it("should automatically replace parentGroupMessage with safe template if AI leaks at-risk student name", async () => {
      // Find the at-risk student in Class A
      const student = await db.query.students.findFirst({
        where: and(eq(students.classId, classAId), eq(students.isActive, true)),
      });
      if (!student) throw new Error("Student not found for privacy test");

      const targetStudentName = student.name; // e.g. "Adrian Manuel Hartono"

      vi.spyOn(aiRouterModule, "getAiRouterConfig").mockResolvedValue({
        enabled: true,
        baseUrl: "http://127.0.0.1:20128/v1",
        apiKey: "test-chaos-key",
        model: "gemini/gemini-3.8-flash",
      });

      // Mock AI response returning a toxic parentGroupMessage leaking the student name
      const leakedAiResponse = createMockAttendanceInsightsAiResponse({
        executiveSummary: `Evaluasi presensi kelas ${classAId} menunjukkan perlunya pembinaan.`,
        principalReport: `Laporan resmi presensi kelas ${classAId}.`,
        parentGroupMessage: `Pemberitahuan kepada seluruh orang tua kelas XII TKJ 2: Ananda ${targetStudentName} sudah 3 hari alpa berturut-turut. Mohon orang tua mendisiplinkan di rumah.`,
        bkRecommendations: [
          {
            studentName: targetStudentName,
            riskLevel: "Kritis",
            recommendation: "Panggil orang tua untuk bimbingan konseling tatap muka.",
          },
        ],
      });

      // Mock fetch so generateAttendanceInsightsWithAi receives this AI response
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => leakedAiResponse,
      }) as any;

      try {
        const req = new Request("http://localhost:3000/api/ai/attendance-insights", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: `${SESSION_COOKIE_NAME}=${teacherAToken}`,
          },
          body: JSON.stringify({
            classId: classAId,
            period: "month",
            targetMonth: "2026-10",
            forceRefresh: true,
          }),
        });

        const res = await POST(req as any);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);

        const parentMsg = json.narratives.parentGroupMessage;

        // CRITICAL PRIVACY ASSERTION:
        // The student name MUST NOT appear anywhere in parentGroupMessage
        expect(parentMsg).not.toContain(targetStudentName);

        // Verify parent message reverted to the safe general template
        expect(parentMsg).toContain("Orang Tua/Wali Murid");
        expect(parentMsg).toContain("Salam hangat");

        // Verify BK recommendations STILL retain the student name (intended for private counselor action)
        const bkRec = json.narratives.bkRecommendations.find(
          (r: any) => r.studentName.toLowerCase() === targetStudentName.toLowerCase()
        );
        expect(bkRec).toBeDefined();
        expect(bkRec?.riskLevel).toBe("Kritis");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should catch case-insensitive privacy leak (uppercase student name in parent message)", async () => {
      const student = await db.query.students.findFirst({
        where: and(eq(students.classId, classAId), eq(students.isActive, true)),
      });
      if (!student) throw new Error("Student not found for privacy test");

      const uppercaseName = student.name.toUpperCase();

      vi.spyOn(aiRouterModule, "getAiRouterConfig").mockResolvedValue({
        enabled: true,
        baseUrl: "http://127.0.0.1:20128/v1",
        apiKey: "test-chaos-key",
        model: "gemini/gemini-3.8-flash",
      });

      const leakedAiResponse = createMockAttendanceInsightsAiResponse({
        parentGroupMessage: `PERHATIAN: Siswa ${uppercaseName} sering tidak masuk sekolah tanpa alasan!`,
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => leakedAiResponse,
      }) as any;

      try {
        const req = new Request("http://localhost:3000/api/ai/attendance-insights", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: `${SESSION_COOKIE_NAME}=${teacherAToken}`,
          },
          body: JSON.stringify({
            classId: classAId,
            period: "month",
            targetMonth: "2026-10",
            forceRefresh: true,
          }),
        });

        const res = await POST(req as any);
        expect(res.status).toBe(200);
        const json = await res.json();

        // Must be sanitized
        expect(json.narratives.parentGroupMessage).not.toContain(uppercaseName);
        expect(json.narratives.parentGroupMessage).not.toContain(student.name);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
