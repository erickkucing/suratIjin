import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "../roster/route";
import { _clearRateLimitStoreForTesting } from "@/lib/rate-limiter";
import { db } from "@/db";
import { users, classes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { disconnectRedis } from "@/lib/redis";
import fs from "fs";
import path from "path";

describe("OCR Roster API Route (/api/ocr/roster)", () => {
  beforeEach(() => {
    _clearRateLimitStoreForTesting();
  });

  it("should return 401 when user is not authenticated", async () => {
    const formData = new FormData();
    formData.append("classId", "1");
    formData.append("file", new Blob(["test"], { type: "text/plain" }), "test.txt");

    const req = new Request("http://localhost:3000/api/ocr/roster", {
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
    // Missing file

    const req = new Request("http://localhost:3000/api/ocr/roster", {
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
    formData.append("file", new Blob(["plain text dummy content that is not pdf or image"], { type: "text/plain" }), "fake.png");

    const req = new Request("http://localhost:3000/api/ocr/roster", {
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

  it("should successfully extract students when proxying valid image to local OCR service", async () => {
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

    // Read the committed test table fixture
    const fixturePath = path.join(__dirname, "fixtures", "test_table.png");
    const testBuffer = fs.readFileSync(fixturePath);

    const formData = new FormData();
    formData.append("classId", String(testClass.id));
    formData.append("file", new Blob([testBuffer], { type: "image/png" }), "test_table.png");

    const req = new Request("http://localhost:3000/api/ocr/roster", {
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
    expect(body.totalStudents).toBe(3);
    expect(body.students[0].name).toBe("Ahmad Dahlan");
    expect(body.students[0].nis).toBe("1001");
    expect(body.students[1].name).toBe("Budi Santoso");
    expect(body.students[1].nis).toBe("1002");
    expect(body.students[2].name).toBe("Citra Lestari");
    expect(body.students[2].nis).toBe("1003");
  }, 30000);

  it("should successfully extract students from multi-page PDF document", async () => {
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

    const fixturePath = path.join(__dirname, "fixtures", "test_multipage.pdf");
    const pdfBuffer = fs.readFileSync(fixturePath);

    const formData = new FormData();
    formData.append("classId", String(testClass.id));
    formData.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), "test_multipage.pdf");

    const req = new Request("http://localhost:3000/api/ocr/roster", {
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
    expect(body.pagesProcessed).toBe(2);
    expect(body.totalStudents).toBe(4);
    expect(body.students.some((s: any) => s.name === "Ahmad Dahlan" && s.nis === "1001")).toBe(true);
    expect(body.students.some((s: any) => s.name === "Fajar Ramadhan" && s.nis === "1004")).toBe(true);
  }, 30000);

  it("should filter out headers, wali kelas, and update date notes even if present in OCR output", async () => {
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

    const fixturePath = path.join(__dirname, "fixtures", "test_table.png");
    const testBuffer = fs.readFileSync(fixturePath);

    // Mock OCR fetch response returning noisy rows alongside students
    const originalFetch = global.fetch;
    global.fetch = async (url: any, init: any) => {
      if (String(url).includes("/extract")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            pages_processed: 1,
            total_students: 5,
            students: [
              { name: "DATA NAMA SISWA KELAS XII TEKNIK KOMPUTER DAN JARINGAN - 2", nis: null },
              { name: "Wali Kelas : Erick Kresnamurti, S.Kom. Gr.", nis: null },
              { name: "Adrian Manuel Hartono", nis: "9259 / 110 / 066" },
              { name: "Yohanes Elkan Nathanael", nis: "9509/181/066" },
              { name: "Update per 02 Desember 2024", nis: null },
            ],
            raw_text: "DATA NAMA SISWA KELAS XII\nWali Kelas\nAdrian\nYohanes\nUpdate per 02 Desember 2024",
          }),
        } as any;
      }
      return originalFetch(url, init);
    };

    try {
      const formData = new FormData();
      formData.append("classId", String(testClass.id));
      formData.append("file", new Blob([testBuffer], { type: "image/png" }), "test_table.png");

      const req = new Request("http://localhost:3000/api/ocr/roster", {
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
      expect(body.totalStudents).toBe(2);
      expect(body.students[0].name).toBe("Adrian Manuel Hartono");
      expect(body.students[0].nis).toBe("9259/110/066");
      expect(body.students[1].name).toBe("Yohanes Elkan Nathanael");
      expect(body.students[1].nis).toBe("9509/181/066");
      expect(body.students.some((s: any) => s.name.includes("DATA NAMA"))).toBe(false);
      expect(body.students.some((s: any) => s.name.includes("Wali Kelas"))).toBe(false);
      expect(body.students.some((s: any) => s.name.includes("Update per"))).toBe(false);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("should utilize Redis cache for repeated scans with identical file hash", async () => {
    const { initializeRedis, disconnectRedis, deleteCache } = await import("@/lib/redis");
    await initializeRedis("redis://127.0.0.1:6379");

    const adminUser = await db.query.users.findFirst({
      where: eq(users.role, "superadmin"),
    });
    if (!adminUser) throw new Error("Superadmin user not found");

    const testClass = await db.query.classes.findFirst();
    if (!testClass) throw new Error("Class not found");

    const token = await createSessionToken({
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      role: adminUser.role,
    });

    const originalFetch = global.fetch;
    let fetchCount = 0;

    const validPng = Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2d420000000049454e44ae426082",
      "hex"
    );
    const crypto = await import("crypto");
    const fileHash = crypto.createHash("sha256").update(validPng).digest("hex");
    await deleteCache(`cache:ocr:roster:${fileHash}:${testClass.id}`);

    global.fetch = async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes("/extract")) {
        fetchCount++;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            pages_processed: 1,
            total_students: 1,
            students: [{ name: "Budi Cahyono", nis: "1001" }],
            raw_text: "1. Budi Cahyono 1001",
          }),
        } as any;
      }
      return originalFetch(url, init);
    };

    try {
      const makeReq = () => {
        const formData = new FormData();
        formData.append("classId", String(testClass.id));
        formData.append("file", new File([validPng], "roster-cache-test.png", { type: "image/png" }));
        return new Request("http://localhost:3000/api/ocr/roster", {
          method: "POST",
          headers: {
            cookie: `${SESSION_COOKIE_NAME}=${token}`,
          },
          body: formData,
        });
      };

      // 1. First call -> cache miss, calls fetch
      const res1 = await POST(makeReq() as any);
      expect(res1.status).toBe(200);
      const body1 = await res1.json();
      expect(body1.success).toBe(true);
      expect(body1.cached).toBeUndefined();
      expect(fetchCount).toBe(1);

      // 2. Second call -> cache hit, skips fetch
      const res2 = await POST(makeReq() as any);
      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(body2.success).toBe(true);
      expect(body2.cached).toBe(true);
      expect(body2.students[0].name).toBe("Budi Cahyono");
      expect(fetchCount).toBe(1);
    } finally {
      global.fetch = originalFetch;
      await disconnectRedis();
    }
  });
});
