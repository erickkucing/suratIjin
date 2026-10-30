import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "../letter/route";
import { _clearRateLimitStoreForTesting } from "@/lib/rate-limiter";
import { db } from "@/db";
import { users, classes, students, systemSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
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

  it("should trigger AI fallback when AI is enabled and enhance detected data", async () => {
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

    // Mock fetch for 9router chat/completions while preserving OCR service
    const originalFetch = global.fetch;
    const fetchMock = vi.fn().mockImplementation(async (url: any, init: any) => {
      if (typeof url === "string" && url.includes(":20128/v1/chat/completions")) {
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    studentId: 999,
                    studentName: "Budi Santoso Enhanced",
                    candidateName: "Budi Santoso",
                    className: "7A",
                    matchConfidence: 0.99,
                    status: "Sakit",
                    startDate: "2026-10-26",
                    endDate: "2026-10-28",
                    isMultiDay: true,
                    description: "Sakit demam dan pilek",
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
    } finally {
      global.fetch = originalFetch;
      // Reset AI to disabled
      await db
        .update(systemSettings)
        .set({ aiEnabled: false })
        .where(eq(systemSettings.id, 1));
    }
  }, 25000);

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
      expect(fetchCount).toBe(1);

      // Second call -> cache hit, skips fetch
      const res2 = await POST(makeReq() as any);
      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(body2.success).toBe(true);
      expect(body2.cached).toBe(true);
      expect(body2.detected.candidateName).toBe("Cache Test Student");
      expect(fetchCount).toBe(1); // Fetch not called again!
    } finally {
      global.fetch = originalFetch;
      await disconnectRedis();
    }
  });
});
