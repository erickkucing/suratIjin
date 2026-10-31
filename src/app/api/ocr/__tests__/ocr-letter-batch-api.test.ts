import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST } from "../letter/batch/route";
import { _clearRateLimitStoreForTesting } from "@/lib/rate-limiter";
import { db } from "@/db";
import { users, classes, students, attendanceRecords } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import fs from "fs";
import path from "path";

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
    segmentAndParseTableLettersWithAi: vi.fn(),
    parseLetterWithAi: vi.fn(),
  };
});

describe("Batch OCR Letter API Route (/api/ocr/letter/batch)", () => {
  // Valid minimal 1x1 PNG image buffer with valid magic bytes
  const samplePngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);

  beforeEach(async () => {
    _clearRateLimitStoreForTesting();
    const { getAiRouterConfig } = await import("@/lib/ai-router");
    (getAiRouterConfig as any).mockResolvedValue({
      enabled: true,
      baseUrl: "http://127.0.0.1:20128/v1",
      apiKey: "test-key",
      model: "gemini/gemini-3.8-flash",
    });
  });

  it("should return 401 when user is not authenticated", async () => {
    const formData = new FormData();
    formData.append("classId", "1");
    formData.append("mode", "multi_file");
    formData.append("files", new Blob([samplePngBuffer], { type: "image/png" }), "letter1.png");

    const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req as any);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Sesi tidak valid");
  });

  it("should return 400 when classId or files are missing", async () => {
    const adminUser = await db.query.users.findFirst({ where: eq(users.role, "superadmin") });
    if (!adminUser) throw new Error("Superadmin not found");

    const token = await createSessionToken({
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      role: adminUser.role,
    });

    const formData = new FormData();
    // Missing classId and files

    const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      body: formData,
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("should return 403 when teacher is not authorized for target class", async () => {
    const teacherUser = await db.query.users.findFirst({ where: eq(users.role, "wali_kelas") });
    if (!teacherUser) throw new Error("Teacher not found");

    const token = await createSessionToken({
      id: teacherUser.id,
      username: teacherUser.username,
      displayName: teacherUser.displayName,
      role: teacherUser.role,
    });

    const formData = new FormData();
    formData.append("classId", "99999"); // Non-existent class
    formData.append("files", new Blob([samplePngBuffer], { type: "image/png" }), "letter1.png");

    const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      body: formData,
    });

    const res = await POST(req as any);
    expect([403, 404]).toContain(res.status);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("should return 400 when file format has invalid magic bytes", async () => {
    const adminUser = await db.query.users.findFirst({ where: eq(users.role, "superadmin") });
    if (!adminUser) throw new Error("Superadmin not found");
    const testClass = await db.query.classes.findFirst();
    if (!testClass) throw new Error("Class not found");

    const token = await createSessionToken({
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      role: adminUser.role,
    });

    const formData = new FormData();
    formData.append("classId", String(testClass.id));
    formData.append("mode", "multi_file");
    formData.append("files", new Blob(["invalid plain text content"], { type: "text/plain" }), "bad.txt");

    const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      body: formData,
    });

    const res = await POST(req as any);
    expect([400, 500]).toContain(res.status);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("should reject PDF file in table_scan mode with 400 error", async () => {
    const adminUser = await db.query.users.findFirst({ where: eq(users.role, "superadmin") });
    if (!adminUser) throw new Error("Superadmin not found");
    const testClass = await db.query.classes.findFirst();
    if (!testClass) throw new Error("Class not found");

    const token = await createSessionToken({
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      role: adminUser.role,
    });

    const pdfBuffer = Buffer.from("%PDF-1.4 dummy pdf header content");
    const formData = new FormData();
    formData.append("classId", String(testClass.id));
    formData.append("mode", "table_scan");
    formData.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), "scan.pdf");

    const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      body: formData,
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("bukan PDF");
  });

  it("should process multi_file mode and distinguish update vs create actions", async () => {
    const adminUser = await db.query.users.findFirst({ where: eq(users.role, "superadmin") });
    if (!adminUser) throw new Error("Superadmin not found");
    const testClass = await db.query.classes.findFirst();
    if (!testClass) throw new Error("Class not found");

    const testStudents = await db.query.students.findMany({
      where: eq(students.classId, testClass.id),
      limit: 2,
    });
    if (testStudents.length < 1) throw new Error("Need at least 1 student");

    const student1 = testStudents[0];
    const targetDate = "2026-10-25";

    // Seed an existing attendance record for student1 on targetDate to test "update" actionType
    await db.delete(attendanceRecords).where(
      and(
        eq(attendanceRecords.classId, testClass.id),
        eq(attendanceRecords.studentId, student1.id),
        eq(attendanceRecords.attendanceDate, targetDate)
      )
    );
    const [inserted] = await db.insert(attendanceRecords).values({
      classId: testClass.id,
      studentId: student1.id,
      attendanceDate: targetDate,
      status: "Izin",
      letterStatus: "Belum",
      createdById: adminUser.id,
    });
    const seededRecordId = (inserted as any).insertId;

    // Mock microservice fetch
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/extract-letter")) {
        return {
          ok: true,
          json: async () => ({
            detected: {
              studentId: student1.id,
              studentName: student1.name,
              matchConfidence: 0.95,
              status: "Izin",
              startDate: targetDate,
              endDate: null,
              isMultiDay: false,
              description: "Acara keluarga",
            },
          }),
        };
      }
      return { ok: false };
    });
    vi.stubGlobal("fetch", mockFetch);

    const token = await createSessionToken({
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      role: adminUser.role,
    });

    const formData = new FormData();
    formData.append("classId", String(testClass.id));
    formData.append("mode", "multi_file");
    formData.append("files", new Blob([samplePngBuffer], { type: "image/png" }), "letter1.png");

    const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      body: formData,
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.mode).toBe("multi_file");
    expect(body.totalDetected).toBe(1);
    expect(body.allHighConfidence).toBe(true);
    expect(body.items[0].actionType).toBe("update");
    expect(body.items[0].existingRecordId).toBeDefined();
    expect(body.items[0].previewUrl).toContain(`/api/files/${testClass.id}/temp/`);

    // Cleanup seeded record
    await db.delete(attendanceRecords).where(
      and(
        eq(attendanceRecords.classId, testClass.id),
        eq(attendanceRecords.studentId, student1.id),
        eq(attendanceRecords.attendanceDate, targetDate)
      )
    );
  });

  it("should auto-segment multiple letters from a single photo in multi_file mode", async () => {
    const adminUser = await db.query.users.findFirst({ where: eq(users.role, "superadmin") });
    if (!adminUser) throw new Error("Superadmin not found");
    const testClass = await db.query.classes.findFirst();
    if (!testClass) throw new Error("Class not found");

    const testStudents = await db.query.students.findMany({
      where: eq(students.classId, testClass.id),
      limit: 2,
    });
    if (testStudents.length < 2) throw new Error("Need at least 2 students");
    const [s1, s2] = testStudents;

    const { segmentAndParseTableLettersWithAi } = await import("@/lib/ai-router");
    (segmentAndParseTableLettersWithAi as any).mockResolvedValueOnce([
      {
        boundingBox: [0.05, 0.05, 0.45, 0.45],
        studentId: s1.id,
        studentName: s1.name,
        candidateName: s1.name,
        matchConfidence: 0.95,
        status: "Izin",
        startDate: "2026-10-31",
        endDate: null,
        isMultiDay: false,
        description: "Urusan keluarga",
      },
      {
        boundingBox: [0.55, 0.55, 0.95, 0.95],
        studentId: s2.id,
        studentName: s2.name,
        candidateName: s2.name,
        matchConfidence: 0.90,
        status: "Sakit",
        startDate: "2026-10-31",
        endDate: null,
        isMultiDay: false,
        description: "Demam",
      },
    ]);

    const token = await createSessionToken({
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      role: adminUser.role,
    });

    const formData = new FormData();
    formData.append("classId", String(testClass.id));
    formData.append("mode", "multi_file");
    formData.append("files", new Blob([samplePngBuffer], { type: "image/png" }), "table_multi.png");

    const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      body: formData,
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.totalDetected).toBe(2);
    expect(body.items.length).toBe(2);
    expect(body.items[0].studentId).toBe(s1.id);
    expect(body.items[1].studentId).toBe(s2.id);
    expect(body.items[0].status).toBe("Izin");
    expect(body.items[1].status).toBe("Sakit");
  });

  it("should process table_scan mode and crop bounding boxes with sharp", async () => {
    const adminUser = await db.query.users.findFirst({ where: eq(users.role, "superadmin") });
    if (!adminUser) throw new Error("Superadmin not found");
    const testClass = await db.query.classes.findFirst();
    if (!testClass) throw new Error("Class not found");

    const testStudents = await db.query.students.findMany({
      where: eq(students.classId, testClass.id),
      limit: 2,
    });
    if (testStudents.length < 1) throw new Error("Need at least 1 student");
    const student1 = testStudents[0];

    const { segmentAndParseTableLettersWithAi } = await import("@/lib/ai-router");
    (segmentAndParseTableLettersWithAi as any).mockResolvedValueOnce([
      {
        boundingBox: [0.1, 0.1, 0.8, 0.8],
        studentId: student1.id,
        studentName: student1.name,
        candidateName: student1.name,
        matchConfidence: 0.92,
        status: "Sakit",
        startDate: "2026-10-28",
        endDate: null,
        isMultiDay: false,
        description: "Demam",
      },
    ]);

    const token = await createSessionToken({
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      role: adminUser.role,
    });

    const formData = new FormData();
    formData.append("classId", String(testClass.id));
    formData.append("mode", "table_scan");
    formData.append("file", new Blob([samplePngBuffer], { type: "image/png" }), "table.png");

    const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      body: formData,
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.mode).toBe("table_scan");
    expect(body.totalDetected).toBe(1);
    expect(body.allHighConfidence).toBe(true);
    expect(body.items[0].status).toBe("Sakit");
    expect(body.items[0].actionType).toBe("create");
    expect(body.items[0].existingRecordId).toBeNull();
    expect(body.items[0].previewUrl).toContain(`/api/files/${testClass.id}/temp/`);
  });

  it("should set allHighConfidence to false when confidence < 0.85 or student not matched", async () => {
    const adminUser = await db.query.users.findFirst({ where: eq(users.role, "superadmin") });
    if (!adminUser) throw new Error("Superadmin not found");
    const testClass = await db.query.classes.findFirst();
    if (!testClass) throw new Error("Class not found");

    const { segmentAndParseTableLettersWithAi } = await import("@/lib/ai-router");
    (segmentAndParseTableLettersWithAi as any).mockResolvedValueOnce([
      {
        boundingBox: [0.1, 0.1, 0.8, 0.8],
        studentId: null, // Unverified
        studentName: null,
        candidateName: "Unrecognized",
        matchConfidence: 0.55, // Low confidence
        status: "Izin",
        startDate: "2026-10-28",
        endDate: null,
        isMultiDay: false,
        description: "Izin",
      },
    ]);

    const token = await createSessionToken({
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      role: adminUser.role,
    });

    const formData = new FormData();
    formData.append("classId", String(testClass.id));
    formData.append("mode", "table_scan");
    formData.append("file", new Blob([samplePngBuffer], { type: "image/png" }), "table.png");

    const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      body: formData,
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.totalDetected).toBe(1);
    expect(body.allHighConfidence).toBe(false);
    expect(body.items[0].studentId).toBeNull();
  });
});
