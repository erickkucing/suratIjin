import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "../letter/route";
import { POST as AI_REFINE_POST } from "../letter/ai-refine/route";
import { _clearRateLimitStoreForTesting } from "@/lib/rate-limiter";
import { db } from "@/db";
import { users, classes, students, systemSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { invalidateSystemSettingsCache } from "@/lib/system-settings";
import fs from "fs";
import path from "path";

describe("OCR Letter API Route (/api/ocr/letter)", () => {
  beforeEach(() => {
    _clearRateLimitStoreForTesting();
  });

  it("should return 401 when user is not authenticated", async () => {
    const formData = new FormData();
    formData.append("classId", "1");
    formData.append("file", new Blob(["test"], { type: "text/plain" }), "test.txt");

    const req = new Request("http://localhost:3000/api/ocr/letter", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req as any);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Sesi tidak valid");
  });

  it("should return 400 when classId or file is missing", async () => {
    const adminUser = await db.query.users.findFirst({
      where: eq(users.role, "superadmin"),
    });
    if (!adminUser) throw new Error("Superadmin user not found");

    const token = await createSessionToken({
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      role: adminUser.role,
    });

    const formData = new FormData();
    // Missing file & classId

    const req = new Request("http://localhost:3000/api/ocr/letter", {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: formData,
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("should return 400 when file format has invalid magic bytes", async () => {
    const adminUser = await db.query.users.findFirst({
      where: eq(users.role, "superadmin"),
    });
    if (!adminUser) throw new Error("Superadmin user not found");

    const token = await createSessionToken({
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      role: adminUser.role,
    });

    const testClass = await db.query.classes.findFirst();
    if (!testClass) throw new Error("Class not found");

    const formData = new FormData();
    formData.append("classId", String(testClass.id));
    formData.append(
      "file",
      new Blob(["plain text dummy content that is not pdf or image"], { type: "text/plain" }),
      "fake.png"
    );

    const req = new Request("http://localhost:3000/api/ocr/letter", {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: formData,
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Format file tidak valid");
  });

  it("should successfully extract letter information when proxying valid letter image to local OCR service", async () => {
    const adminUser = await db.query.users.findFirst({
      where: eq(users.role, "superadmin"),
    });
    if (!adminUser) throw new Error("Superadmin user not found");

    const token = await createSessionToken({
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      role: adminUser.role,
    });

    const testClass = await db.query.classes.findFirst();
    if (!testClass) throw new Error("Class not found");

    // Ensure student exists in this class
    const existingStudent = await db.query.students.findFirst({
      where: eq(students.classId, testClass.id),
    });
    if (!existingStudent) throw new Error("No student found in class");

    // Read the committed test letter fixture
    const fixturePath = path.join(__dirname, "fixtures", "test_letter.png");
    const testBuffer = fs.readFileSync(fixturePath);

    const formData = new FormData();
    formData.append("classId", String(testClass.id));
    formData.append("file", new Blob([testBuffer], { type: "image/png" }), "test_letter.png");

    const req = new Request("http://localhost:3000/api/ocr/letter", {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: formData,
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.detected).toBeDefined();
    expect(body.detected.status).toBe("Sakit");
    expect(body.detected.className).toBe("7A");
    expect(body.detected.candidateName).toBe("Budi Santosc");
    expect(body.detected.startDate).toBe("2026-10-26");
    expect(body.detected.endDate).toBe("2026-10-28");
    expect(body.detected.isMultiDay).toBe(true);
    expect(body.detected.infoSource).toBe("Orang tua");
  }, 25000);

  it("should perform pure GPU OCR without calling AI automatically and return needsAiRefinement flag", async () => {
    const adminUser = await db.query.users.findFirst({
      where: eq(users.role, "superadmin"),
    });
    if (!adminUser) throw new Error("Superadmin user not found");

    const token = await createSessionToken({
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      role: adminUser.role,
    });

    const testClass = await db.query.classes.findFirst();
    if (!testClass) throw new Error("Class not found");

    // Enable AI temporarily in DB
    await db
      .update(systemSettings)
      .set({
        aiEnabled: true,
        aiRouterUrl: "http://127.0.0.1:20128/v1",
        aiRouterApiKey: "test-key",
        aiRouterModel: "gemini/gemini-3.8-flash",
      })
      .where(eq(systemSettings.id, 1));
    await invalidateSystemSettingsCache();

    // Mock fetch to track any potential AI calls
    const originalFetch = global.fetch;
    const fetchMock = vi.fn().mockImplementation(async (url: any, init: any) => {
      return originalFetch(url, init);
    });
    global.fetch = fetchMock as any;

    try {
      const fixturePath = path.join(__dirname, "fixtures", "test_letter.png");
      const testBuffer = fs.readFileSync(fixturePath);

      const formData = new FormData();
      formData.append("classId", String(testClass.id));
      formData.append("file", new Blob([testBuffer], { type: "image/png" }), "test_letter.png");

      const req = new Request("http://localhost:3000/api/ocr/letter", {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
        body: formData,
      });

      const res = await POST(req as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.detected).toBeDefined();
      expect(typeof body.needsAiRefinement).toBe("boolean");

      // Verify 9router AI chat/completions was NOT called in initial scan path
      const callsToAi = fetchMock.mock.calls.filter((c: any) =>
        typeof c[0] === "string" && c[0].includes("chat/completions")
      );
      expect(callsToAi.length).toBe(0);
    } finally {
      global.fetch = originalFetch;
      // Reset AI to disabled
      await db
        .update(systemSettings)
        .set({ aiEnabled: false })
        .where(eq(systemSettings.id, 1));
      await invalidateSystemSettingsCache();
    }
  }, 25000);

  it("should sanitize student birth dates to empty and activate needsAiRefinement flag", async () => {
    const adminUser = await db.query.users.findFirst({
      where: eq(users.role, "superadmin"),
    });
    if (!adminUser) throw new Error("Superadmin user not found");

    const token = await createSessionToken({
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      role: adminUser.role,
    });

    const testClass = await db.query.classes.findFirst();
    if (!testClass) throw new Error("Class not found");

    const originalFetch = global.fetch;
    // Mock local OCR returning high confidence student but a birth date (2009) as startDate
    global.fetch = async (url: any, opts: any) => {
      if (typeof url === "string" && url.includes("/extract-letter")) {
        return new Response(
          JSON.stringify({
            success: true,
            processing_time_seconds: 0.15,
            device: "gpu",
            device_name: "NVIDIA Quadro P1000",
            detected: {
              studentId: 10,
              studentName: "Adrian Manuel",
              candidateName: "Adrian Manuel",
              className: "7A",
              matchConfidence: 0.96,
              status: "Sakit",
              startDate: "2009-05-12", // Student birth date!
              endDate: "",
              isMultiDay: false,
              description: "Sakit demam",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return originalFetch(url, opts);
    };

    try {
      const validPng = Buffer.from(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2d420000000049454e44ae426082",
        "hex"
      );
      const formData = new FormData();
      formData.append("classId", String(testClass.id));
      formData.append("file", new File([validPng], "birthdate-test.png", { type: "image/png" }));

      const req = new Request("http://localhost:3000/api/ocr/letter", {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
        body: formData,
      });

      const res = await POST(req as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      // Birth date must be sanitized to empty string
      expect(body.detected.startDate).toBe("");
      // Since absence date is empty, needsAiRefinement MUST be true!
      expect(body.needsAiRefinement).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("should serve OCR result from Redis cache on duplicate request", async () => {
    const { initializeRedis, disconnectRedis, deleteCache } = await import("@/lib/redis");
    await initializeRedis("redis://127.0.0.1:6379");

    const adminUser = await db.query.users.findFirst({
      where: eq(users.role, "superadmin"),
    });
    if (!adminUser) throw new Error("Superadmin user not found");

    const token = await createSessionToken({
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      role: adminUser.role,
    });

    const testClass = await db.query.classes.findFirst();
    if (!testClass) throw new Error("Class not found");

    const originalFetch = global.fetch;
    let fetchCount = 0;
    global.fetch = async (url: any, opts: any) => {
      fetchCount++;
      return new Response(
        JSON.stringify({
          success: true,
          detected: {
            status: "Izin",
            candidateName: "Cache Test Student",
            startDate: "2026-10-30",
            endDate: "2026-10-30",
          },
          processing_time_seconds: 0.42,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    try {
      const validPng = Buffer.from(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2d420000000049454e44ae426082",
        "hex"
      );
      const crypto = await import("crypto");
      const fileHash = crypto.createHash("sha256").update(validPng).digest("hex");
      await deleteCache(`cache:ocr:letter:${fileHash}:${testClass.id}`);

      const makeReq = () => {
        const formData = new FormData();
        formData.append("classId", String(testClass.id));
        formData.append("file", new File([validPng], "cache-test.png", { type: "image/png" }));
        return new Request("http://localhost:3000/api/ocr/letter", {
          method: "POST",
          headers: {
            cookie: `${SESSION_COOKIE_NAME}=${token}`,
          },
          body: formData,
        });
      };

      // First call -> cache miss, calls fetch
      const res1 = await POST(makeReq() as any);
      expect(res1.status).toBe(200);
      const body1 = await res1.json();
      expect(body1.success).toBe(true);
      expect(body1.cached).toBeUndefined();
      expect(body1.needsAiRefinement).toBeDefined();
      expect(fetchCount).toBe(1);

      // Second call -> cache hit, skips fetch
      const res2 = await POST(makeReq() as any);
      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(body2.success).toBe(true);
      expect(body2.cached).toBe(true);
      expect(body2.detected.candidateName).toBe("Cache Test Student");
      expect(body2.needsAiRefinement).toBeDefined();
      expect(fetchCount).toBe(1); // Fetch not called again!
    } finally {
      global.fetch = originalFetch;
      await disconnectRedis();
    }
  });
});

describe("AI Refine API Route (/api/ocr/letter/ai-refine)", () => {
  it("should return 401 when user is not authenticated", async () => {
    const formData = new FormData();
    formData.append("classId", "1");
    formData.append("file", new Blob(["test"], { type: "text/plain" }), "test.txt");

    const req = new Request("http://localhost:3000/api/ocr/letter/ai-refine", {
      method: "POST",
      body: formData,
    });

    const res = await AI_REFINE_POST(req as any);
    expect(res.status).toBe(401);
  });

  it("should return 400 when classId or file is missing", async () => {
    const adminUser = await db.query.users.findFirst({
      where: eq(users.role, "superadmin"),
    });
    if (!adminUser) throw new Error("Superadmin user not found");

    const token = await createSessionToken({
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      role: adminUser.role,
    });

    const formData = new FormData();
    const req = new Request("http://localhost:3000/api/ocr/letter/ai-refine", {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: formData,
    });

    const res = await AI_REFINE_POST(req as any);
    expect(res.status).toBe(400);
  });

  it("should process on-demand vision refinement via 9router AI and cache result in Redis", async () => {
    const { initializeRedis, disconnectRedis, deleteCache } = await import("@/lib/redis");
    await initializeRedis("redis://127.0.0.1:6379");

    const adminUser = await db.query.users.findFirst({
      where: eq(users.role, "superadmin"),
    });
    if (!adminUser) throw new Error("Superadmin user not found");

    const token = await createSessionToken({
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      role: adminUser.role,
    });

    const testClass = await db.query.classes.findFirst();
    if (!testClass) throw new Error("Class not found");

    // Enable AI temporarily in DB
    await db
      .update(systemSettings)
      .set({
        aiEnabled: true,
        aiRouterUrl: "http://127.0.0.1:20128/v1",
        aiRouterApiKey: "test-key",
        aiRouterModel: "gemini/gemini-3.8-flash",
      })
      .where(eq(systemSettings.id, 1));
    await invalidateSystemSettingsCache();

    const originalFetch = global.fetch;
    let aiFetchCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: any, init: any) => {
      if (typeof url === "string" && url.includes("/chat/completions")) {
        aiFetchCount++;
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    studentId: 101,
                    studentName: "Ahmad Dahlan",
                    candidateName: "Ahmad Dahlan",
                    className: "7A",
                    matchConfidence: 0.98,
                    status: "Sakit",
                    startDate: "2026-10-27",
                    endDate: "2026-10-29",
                    isMultiDay: true,
                    description: "Istirahat dokter sakit demam",
                  }),
                },
              },
            ],
          }),
        };
      }
      return originalFetch(url, init);
    });
    global.fetch = fetchMock as any;

    try {
      const validPng = Buffer.from(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2d420000000049454e44ae426082",
        "hex"
      );
      const crypto = await import("crypto");
      const fileHash = crypto.createHash("sha256").update(validPng).digest("hex");
      await deleteCache(`cache:ocr:letter:ai:${fileHash}:${testClass.id}`);

      const makeReq = () => {
        const formData = new FormData();
        formData.append("classId", String(testClass.id));
        formData.append("file", new File([validPng], "ai-test.png", { type: "image/png" }));
        return new Request("http://localhost:3000/api/ocr/letter/ai-refine", {
          method: "POST",
          headers: {
            cookie: `${SESSION_COOKIE_NAME}=${token}`,
          },
          body: formData,
        });
      };

      const res1 = await AI_REFINE_POST(makeReq() as any);
      expect(res1.status).toBe(200);
      const body1 = await res1.json();
      expect(body1.success).toBe(true);
      expect(body1.detected.studentName).toBe("Ahmad Dahlan");
      expect(body1.detected.status).toBe("Sakit");
      expect(body1.detected.startDate).toBe("2026-10-27");
      expect(body1.detected.endDate).toBe("2026-10-29");
      expect(body1.detected.isMultiDay).toBe(true);
      expect(aiFetchCount).toBe(1);

      // Second call -> cached hit
      const res2 = await AI_REFINE_POST(makeReq() as any);
      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(body2.success).toBe(true);
      expect(body2.cached).toBe(true);
      expect(aiFetchCount).toBe(1); // Cached, no second fetch
    } finally {
      global.fetch = originalFetch;
      await db
        .update(systemSettings)
        .set({ aiEnabled: false })
        .where(eq(systemSettings.id, 1));
      await invalidateSystemSettingsCache();
      await disconnectRedis();
    }
  });
});
