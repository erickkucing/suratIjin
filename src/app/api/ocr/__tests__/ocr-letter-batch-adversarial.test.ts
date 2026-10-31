import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import { POST } from "../letter/batch/route";
import { _clearRateLimitStoreForTesting } from "@/lib/rate-limiter";
import { db } from "@/db";
import { users, classes, students, attendanceRecords } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

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

describe("Adversarial Stress Test: Batch OCR Letter API Route (/api/ocr/letter/batch)", () => {
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

  let adminToken: string;
  let teacherToken: string;
  let teacherUser: any;
  let teacherClass: any;
  let otherClass: any;
  let otherTeacherUser: any;
  let teacherStudent: any;
  let otherStudent: any;

  beforeAll(async () => {
    const adminUser = await db.query.users.findFirst({ where: eq(users.role, "superadmin") });
    if (!adminUser) throw new Error("Superadmin not found");
    adminToken = await createSessionToken({
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      role: adminUser.role,
    });

    // Ensure we have a primary teacher
    teacherUser = await db.query.users.findFirst({ where: eq(users.role, "wali_kelas") });
    if (!teacherUser) throw new Error("Teacher not found");
    teacherToken = await createSessionToken({
      id: teacherUser.id,
      username: teacherUser.username,
      displayName: teacherUser.displayName,
      role: teacherUser.role,
    });

    teacherClass = await db.query.classes.findFirst({
      where: eq(classes.waliKelasId, teacherUser.id),
    });
    if (!teacherClass) {
      const anyClass = await db.query.classes.findFirst();
      if (!anyClass) throw new Error("No classes found");
      await db.update(classes).set({ waliKelasId: teacherUser.id }).where(eq(classes.id, anyClass.id));
      teacherClass = await db.query.classes.findFirst({ where: eq(classes.id, anyClass.id) });
    }

    // Seed a second teacher and class for rigorous cross-class isolation testing
    const [insertedOtherTeacher] = await db.insert(users).values({
      username: `adversarial_teacher_${Date.now()}`,
      passwordHash: "dummyhash",
      displayName: "Guru Kelas Sebelah",
      role: "wali_kelas",
    });
    const otherTeacherId = (insertedOtherTeacher as any).insertId;
    otherTeacherUser = { id: otherTeacherId };

    const [insertedOtherClass] = await db.insert(classes).values({
      name: `Adversarial Class ${Date.now()}`,
      slug: `adversarial-class-${Date.now()}`,
      waliKelasId: otherTeacherId,
    });
    const otherClassId = (insertedOtherClass as any).insertId;
    otherClass = { id: otherClassId };

    // Seed a student into otherClass
    const [insertedOtherStudent] = await db.insert(students).values({
      classId: otherClassId,
      name: "Siswa Kelas Sebelah",
      nis: `999${Date.now()}`.slice(0, 10),
    });
    otherStudent = {
      id: (insertedOtherStudent as any).insertId,
      name: "Siswa Kelas Sebelah",
      classId: otherClassId,
    };

    // Get a student from teacherClass
    const stList = await db.query.students.findMany({
      where: eq(students.classId, teacherClass.id),
      limit: 1,
    });
    teacherStudent = stList[0];
  });

  afterAll(async () => {
    // Clean up seeded secondary class and student
    if (otherStudent?.id) {
      await db.delete(attendanceRecords).where(eq(attendanceRecords.studentId, otherStudent.id));
      await db.delete(students).where(eq(students.id, otherStudent.id));
    }
    if (otherClass?.id) {
      await db.delete(classes).where(eq(classes.id, otherClass.id));
    }
    if (otherTeacherUser?.id) {
      await db.delete(users).where(eq(users.id, otherTeacherUser.id));
    }
  });

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

  // =========================================================================
  // 1. ADVERSARIAL EMPTY & MALFORMED REQUESTS
  // =========================================================================
  describe("1. Empty & Malformed Requests", () => {
    it("should reject request with zero-byte file payload with HTTP 400", async () => {
      const formData = new FormData();
      formData.append("classId", String(teacherClass.id));
      formData.append("mode", "multi_file");
      formData.append("files", new Blob([], { type: "image/png" }), "empty.png");

      const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
        body: formData,
      });

      const res = await POST(req as any);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("Tidak ada file surat yang diunggah");
    });

    it("should reject request when formData has no file fields at all with HTTP 400", async () => {
      const formData = new FormData();
      formData.append("classId", String(teacherClass.id));
      formData.append("mode", "multi_file");

      const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
        body: formData,
      });

      const res = await POST(req as any);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("Tidak ada file surat");
    });

    it("should reject non-numeric classId with HTTP 400", async () => {
      const formData = new FormData();
      formData.append("classId", "malicious_string_injection");
      formData.append("files", new Blob([samplePngBuffer], { type: "image/png" }), "letter.png");

      const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
        body: formData,
      });

      const res = await POST(req as any);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("ID Kelas tidak valid");
    });

    it("should reject empty string classId with HTTP 400", async () => {
      const formData = new FormData();
      formData.append("classId", "");
      formData.append("files", new Blob([samplePngBuffer], { type: "image/png" }), "letter.png");

      const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
        body: formData,
      });

      const res = await POST(req as any);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("ID Kelas wajib disertakan");
    });

    it("should return HTTP 404 when classId does not exist in database", async () => {
      const formData = new FormData();
      formData.append("classId", "9999999");
      formData.append("files", new Blob([samplePngBuffer], { type: "image/png" }), "letter.png");

      const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
        body: formData,
      });

      const res = await POST(req as any);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("Kelas tidak ditemukan");
    });

    it("should gracefully handle malformed non-multipart request body without crashing node process", async () => {
      const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ classId: 1 }),
      });

      const res = await POST(req as any);
      expect([400, 500]).toContain(res.status);
      const body = await res.json();
      expect(body.success).toBe(false);
    });
  });

  // =========================================================================
  // 2. ADVERSARIAL FILE LIMITS & SIZE EXHAUSTION
  // =========================================================================
  describe("2. Batch Limits & Size Exhaustion", () => {
    it("should reject multi_file batch containing 11 files (> MAX_BATCH_FILES 10) with HTTP 400", async () => {
      const formData = new FormData();
      formData.append("classId", String(teacherClass.id));
      formData.append("mode", "multi_file");

      for (let i = 1; i <= 11; i++) {
        formData.append("files", new Blob([samplePngBuffer], { type: "image/png" }), `letter_${i}.png`);
      }

      const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
        body: formData,
      });

      const res = await POST(req as any);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("Maksimal 10 file per pemindaian batch");
    });

    it("should reject oversized file (> 15 MB) with HTTP 413", async () => {
      const formData = new FormData();
      formData.append("classId", String(teacherClass.id));
      formData.append("mode", "multi_file");

      // Allocate actual buffer exceeding 15MB (15MB + 1KB) to test real serialization size
      const largeBuf = Buffer.alloc(15 * 1024 * 1024 + 1024);
      const largeBlob = new Blob([largeBuf], { type: "image/png" });
      formData.append("files", largeBlob, "oversized_letter.png");

      const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
        body: formData,
      });

      const res = await POST(req as any);
      expect(res.status).toBe(413);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("melebihi batas maksimal 15 MB");
    });
  });

  // =========================================================================
  // 3. ADVERSARIAL FILE FORMATS & CORRUPT PAYLOADS
  // =========================================================================
  describe("3. File Formats & Corrupt Payloads", () => {
    it("should reject executable or arbitrary binary payloads (invalid magic bytes) with HTTP 400", async () => {
      const maliciousBuffer = Buffer.from("MZ\x90\x00\x03\x00\x00\x00malicious binary executable payload");
      const formData = new FormData();
      formData.append("classId", String(teacherClass.id));
      formData.append("mode", "multi_file");
      formData.append("files", new Blob([maliciousBuffer], { type: "application/octet-stream" }), "malware.exe");

      const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
        body: formData,
      });

      const res = await POST(req as any);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("Format file \"malware.exe\" tidak valid");
    });

    it("should strictly reject PDF submitted in table_scan mode with HTTP 400", async () => {
      const pdfBuffer = Buffer.from("%PDF-1.7 header dummy content");
      const formData = new FormData();
      formData.append("classId", String(teacherClass.id));
      formData.append("mode", "table_scan");
      formData.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), "tabletop.pdf");

      const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
        body: formData,
      });

      const res = await POST(req as any);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("bukan PDF");
    });

    it("should return HTTP 503 if table_scan mode is called when 9router AI is disabled", async () => {
      const { getAiRouterConfig } = await import("@/lib/ai-router");
      (getAiRouterConfig as any).mockResolvedValueOnce({
        enabled: false,
        baseUrl: "",
        apiKey: "",
        model: "",
      });

      const formData = new FormData();
      formData.append("classId", String(teacherClass.id));
      formData.append("mode", "table_scan");
      formData.append("file", new Blob([samplePngBuffer], { type: "image/png" }), "table.png");

      const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
        body: formData,
      });

      const res = await POST(req as any);
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("Layanan 9router AI Vision diperlukan");
    });

    it("should handle corrupted image buffer with valid magic bytes without unhandled process crash", async () => {
      // Valid PNG header (8 bytes) followed by corrupt/truncated garbage
      const corruptPng = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0xde, 0xad, 0xbe, 0xef, 0x00, 0x00, 0x00,
      ]);

      const formData = new FormData();
      formData.append("classId", String(teacherClass.id));
      formData.append("mode", "multi_file");
      formData.append("files", new Blob([corruptPng], { type: "image/png" }), "corrupt.png");

      const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
        body: formData,
      });

      const res = await POST(req as any);
      expect([400, 500]).toContain(res.status);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
    });
  });

  // =========================================================================
  // 4. ADVERSARIAL AUTHORIZATION & CROSS-CLASS ISOLATION
  // =========================================================================
  describe("4. Authorization & Cross-Class Isolation", () => {
    it("should return HTTP 403 when wali_kelas attempts to access another class", async () => {
      const formData = new FormData();
      formData.append("classId", String(otherClass.id));
      formData.append("mode", "multi_file");
      formData.append("files", new Blob([samplePngBuffer], { type: "image/png" }), "letter.png");

      const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${teacherToken}` },
        body: formData,
      });

      const res = await POST(req as any);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("tidak memiliki izin");
    });

    it("should scrub studentId to null if OCR detects a student from another class (Cross-Class Poisoning Defense)", async () => {
      // Teacher scans for teacherClass, but OCR outputs a student belonging to otherClass
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/extract-letter")) {
          return {
            ok: true,
            json: async () => ({
              detected: {
                studentId: otherStudent.id,
                studentName: otherStudent.name,
                matchConfidence: 0.95,
                status: "Sakit",
                startDate: "2026-10-30",
                endDate: null,
                isMultiDay: false,
                description: "Demam",
              },
            }),
          };
        }
        return { ok: false };
      });
      vi.stubGlobal("fetch", mockFetch);

      const formData = new FormData();
      formData.append("classId", String(teacherClass.id));
      formData.append("mode", "multi_file");
      formData.append("files", new Blob([samplePngBuffer], { type: "image/png" }), "letter.png");

      const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
        body: formData,
      });

      const res = await POST(req as any);
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.success).toBe(true);
      expect(body.items.length).toBe(1);
      // Student does not belong to teacherClass, so it must be scrubbed to null
      expect(body.items[0].studentId).toBeNull();
      expect(body.items[0].studentName).toBeNull();
      // Because studentId is null, allHighConfidence MUST be false
      expect(body.allHighConfidence).toBe(false);
      // actionType must be create with null existingRecordId
      expect(body.items[0].actionType).toBe("create");
      expect(body.items[0].existingRecordId).toBeNull();
    });
  });

  // =========================================================================
  // 5. ACTIONTYPE DETERMINATION & RACE / OVERLAPPING DATE TESTS
  // =========================================================================
  describe("5. ActionType Determination (Update vs Create)", () => {
    const testDate = "2026-10-29";

    it("should return actionType: 'update' when record exists for (classId, studentId, startDate)", async () => {
      if (!teacherStudent) throw new Error("No student available");

      // 1. Clean and insert existing record
      await db.delete(attendanceRecords).where(
        and(
          eq(attendanceRecords.classId, teacherClass.id),
          eq(attendanceRecords.studentId, teacherStudent.id),
          eq(attendanceRecords.attendanceDate, testDate)
        )
      );

      const [inserted] = await db.insert(attendanceRecords).values({
        classId: teacherClass.id,
        studentId: teacherStudent.id,
        attendanceDate: testDate,
        status: "Sakit",
        letterStatus: "Belum",
      });
      const expectedRecordId = (inserted as any).insertId;

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/extract-letter")) {
          return {
            ok: true,
            json: async () => ({
              detected: {
                studentId: teacherStudent.id,
                studentName: teacherStudent.name,
                matchConfidence: 0.95,
                status: "Sakit",
                startDate: testDate,
                endDate: null,
                isMultiDay: false,
                description: "Flu berat",
              },
            }),
          };
        }
        return { ok: false };
      });
      vi.stubGlobal("fetch", mockFetch);

      const formData = new FormData();
      formData.append("classId", String(teacherClass.id));
      formData.append("mode", "multi_file");
      formData.append("files", new Blob([samplePngBuffer], { type: "image/png" }), "letter.png");

      const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
        body: formData,
      });

      const res = await POST(req as any);
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.items[0].actionType).toBe("update");
      expect(body.items[0].existingRecordId).toBe(expectedRecordId);

      // Cleanup
      await db.delete(attendanceRecords).where(
        and(
          eq(attendanceRecords.classId, teacherClass.id),
          eq(attendanceRecords.studentId, teacherStudent.id),
          eq(attendanceRecords.attendanceDate, testDate)
        )
      );
    });

    it("should return actionType: 'create' when no record exists for (classId, studentId, startDate)", async () => {
      if (!teacherStudent) throw new Error("No student available");
      const unrecordedDate = "2026-10-15";

      await db.delete(attendanceRecords).where(
        and(
          eq(attendanceRecords.classId, teacherClass.id),
          eq(attendanceRecords.studentId, teacherStudent.id),
          eq(attendanceRecords.attendanceDate, unrecordedDate)
        )
      );

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/extract-letter")) {
          return {
            ok: true,
            json: async () => ({
              detected: {
                studentId: teacherStudent.id,
                studentName: teacherStudent.name,
                matchConfidence: 0.90,
                status: "Izin",
                startDate: unrecordedDate,
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

      const formData = new FormData();
      formData.append("classId", String(teacherClass.id));
      formData.append("mode", "multi_file");
      formData.append("files", new Blob([samplePngBuffer], { type: "image/png" }), "letter.png");

      const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
        body: formData,
      });

      const res = await POST(req as any);
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.items[0].actionType).toBe("create");
      expect(body.items[0].existingRecordId).toBeNull();
    });

    it("should return actionType: 'create' when record exists on date A but letter is for date B (Date Mismatch)", async () => {
      if (!teacherStudent) throw new Error("No student available");
      const dateA = "2026-10-21";
      const dateB = "2026-10-22";

      // Seed record on dateA
      await db.delete(attendanceRecords).where(
        and(
          eq(attendanceRecords.classId, teacherClass.id),
          eq(attendanceRecords.studentId, teacherStudent.id),
          eq(attendanceRecords.attendanceDate, dateA)
        )
      );
      await db.delete(attendanceRecords).where(
        and(
          eq(attendanceRecords.classId, teacherClass.id),
          eq(attendanceRecords.studentId, teacherStudent.id),
          eq(attendanceRecords.attendanceDate, dateB)
        )
      );

      await db.insert(attendanceRecords).values({
        classId: teacherClass.id,
        studentId: teacherStudent.id,
        attendanceDate: dateA,
        status: "Sakit",
        letterStatus: "Belum",
      });

      // OCR outputs dateB
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/extract-letter")) {
          return {
            ok: true,
            json: async () => ({
              detected: {
                studentId: teacherStudent.id,
                studentName: teacherStudent.name,
                matchConfidence: 0.92,
                status: "Sakit",
                startDate: dateB,
                endDate: null,
                isMultiDay: false,
                description: "Demam",
              },
            }),
          };
        }
        return { ok: false };
      });
      vi.stubGlobal("fetch", mockFetch);

      const formData = new FormData();
      formData.append("classId", String(teacherClass.id));
      formData.append("mode", "multi_file");
      formData.append("files", new Blob([samplePngBuffer], { type: "image/png" }), "letter.png");

      const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
        body: formData,
      });

      const res = await POST(req as any);
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.items[0].startDate).toBe(dateB);
      expect(body.items[0].actionType).toBe("create");
      expect(body.items[0].existingRecordId).toBeNull();

      // Cleanup
      await db.delete(attendanceRecords).where(
        and(
          eq(attendanceRecords.classId, teacherClass.id),
          eq(attendanceRecords.studentId, teacherStudent.id),
          eq(attendanceRecords.attendanceDate, dateA)
        )
      );
    });
  });

  // =========================================================================
  // 6. ADVERSARIAL ALLHIGHCONFIDENCE BOUNDARY & EDGE CASES
  // =========================================================================
  describe("6. allHighConfidence Strict Boundary Tests", () => {
    it("should evaluate allHighConfidence: false when confidence is exactly 0.849 (Strict Threshold)", async () => {
      if (!teacherStudent) throw new Error("No student available");

      const { segmentAndParseTableLettersWithAi } = await import("@/lib/ai-router");
      (segmentAndParseTableLettersWithAi as any).mockResolvedValueOnce([
        {
          boundingBox: [0.1, 0.1, 0.8, 0.8],
          studentId: teacherStudent.id,
          studentName: teacherStudent.name,
          candidateName: teacherStudent.name,
          matchConfidence: 0.849, // strictly below 0.85
          status: "Izin",
          startDate: "2026-10-28",
          endDate: null,
          isMultiDay: false,
          description: "Izin",
        },
      ]);

      const formData = new FormData();
      formData.append("classId", String(teacherClass.id));
      formData.append("mode", "table_scan");
      formData.append("file", new Blob([samplePngBuffer], { type: "image/png" }), "table.png");

      const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
        body: formData,
      });

      const res = await POST(req as any);
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.items[0].matchConfidence).toBe(0.849);
      expect(body.allHighConfidence).toBe(false);
    });

    it("should evaluate allHighConfidence: true when confidence is exactly 0.850", async () => {
      if (!teacherStudent) throw new Error("No student available");

      const { segmentAndParseTableLettersWithAi } = await import("@/lib/ai-router");
      (segmentAndParseTableLettersWithAi as any).mockResolvedValueOnce([
        {
          boundingBox: [0.1, 0.1, 0.8, 0.8],
          studentId: teacherStudent.id,
          studentName: teacherStudent.name,
          candidateName: teacherStudent.name,
          matchConfidence: 0.850, // exactly 0.85
          status: "Izin",
          startDate: "2026-10-28",
          endDate: null,
          isMultiDay: false,
          description: "Izin",
        },
      ]);

      const formData = new FormData();
      formData.append("classId", String(teacherClass.id));
      formData.append("mode", "table_scan");
      formData.append("file", new Blob([samplePngBuffer], { type: "image/png" }), "table.png");

      const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
        body: formData,
      });

      const res = await POST(req as any);
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.items[0].matchConfidence).toBe(0.85);
      expect(body.allHighConfidence).toBe(true);
    });

    it("should evaluate allHighConfidence: false when studentId is null even if confidence is 0.99", async () => {
      const { segmentAndParseTableLettersWithAi } = await import("@/lib/ai-router");
      (segmentAndParseTableLettersWithAi as any).mockResolvedValueOnce([
        {
          boundingBox: [0.1, 0.1, 0.8, 0.8],
          studentId: null, // Unidentified student
          studentName: null,
          candidateName: "Unknown Person",
          matchConfidence: 0.99,
          status: "Izin",
          startDate: "2026-10-28",
          endDate: null,
          isMultiDay: false,
          description: "Izin",
        },
      ]);

      const formData = new FormData();
      formData.append("classId", String(teacherClass.id));
      formData.append("mode", "table_scan");
      formData.append("file", new Blob([samplePngBuffer], { type: "image/png" }), "table.png");

      const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
        body: formData,
      });

      const res = await POST(req as any);
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.items[0].studentId).toBeNull();
      expect(body.allHighConfidence).toBe(false);
    });

    it("should evaluate allHighConfidence: false when startDate is invalid/missing even if confidence is 0.99", async () => {
      if (!teacherStudent) throw new Error("No student available");

      const { segmentAndParseTableLettersWithAi } = await import("@/lib/ai-router");
      (segmentAndParseTableLettersWithAi as any).mockResolvedValueOnce([
        {
          boundingBox: [0.1, 0.1, 0.8, 0.8],
          studentId: teacherStudent.id,
          studentName: teacherStudent.name,
          candidateName: teacherStudent.name,
          matchConfidence: 0.99,
          status: "Izin",
          startDate: "invalid-date-format", // Invalid date
          endDate: null,
          isMultiDay: false,
          description: "Izin",
        },
      ]);

      const formData = new FormData();
      formData.append("classId", String(teacherClass.id));
      formData.append("mode", "table_scan");
      formData.append("file", new Blob([samplePngBuffer], { type: "image/png" }), "table.png");

      const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
        body: formData,
      });

      const res = await POST(req as any);
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.items[0].startDate).toBe("");
      expect(body.allHighConfidence).toBe(false);
    });

    it("should evaluate allHighConfidence: false when 4 items are >=0.85 but 1 item is 0.849", async () => {
      if (!teacherStudent) throw new Error("No student available");

      const { segmentAndParseTableLettersWithAi } = await import("@/lib/ai-router");
      (segmentAndParseTableLettersWithAi as any).mockResolvedValueOnce([
        {
          boundingBox: [0.1, 0.1, 0.4, 0.4],
          studentId: teacherStudent.id,
          studentName: teacherStudent.name,
          matchConfidence: 0.95,
          status: "Izin",
          startDate: "2026-10-28",
        },
        {
          boundingBox: [0.1, 0.5, 0.4, 0.9],
          studentId: teacherStudent.id,
          studentName: teacherStudent.name,
          matchConfidence: 0.90,
          status: "Izin",
          startDate: "2026-10-28",
        },
        {
          boundingBox: [0.5, 0.1, 0.9, 0.4],
          studentId: teacherStudent.id,
          studentName: teacherStudent.name,
          matchConfidence: 0.88,
          status: "Izin",
          startDate: "2026-10-28",
        },
        {
          boundingBox: [0.5, 0.5, 0.9, 0.9],
          studentId: teacherStudent.id,
          studentName: teacherStudent.name,
          matchConfidence: 0.85,
          status: "Izin",
          startDate: "2026-10-28",
        },
        {
          boundingBox: [0.2, 0.2, 0.7, 0.7],
          studentId: teacherStudent.id,
          studentName: teacherStudent.name,
          matchConfidence: 0.849, // One single low-confidence item
          status: "Izin",
          startDate: "2026-10-28",
        },
      ]);

      const formData = new FormData();
      formData.append("classId", String(teacherClass.id));
      formData.append("mode", "table_scan");
      formData.append("file", new Blob([samplePngBuffer], { type: "image/png" }), "table.png");

      const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
        body: formData,
      });

      const res = await POST(req as any);
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.totalDetected).toBe(5);
      expect(body.allHighConfidence).toBe(false);
    });

    it("should evaluate allHighConfidence: false when 0 letters are detected in table_scan", async () => {
      const { segmentAndParseTableLettersWithAi } = await import("@/lib/ai-router");
      (segmentAndParseTableLettersWithAi as any).mockResolvedValueOnce([]); // 0 letters detected

      const formData = new FormData();
      formData.append("classId", String(teacherClass.id));
      formData.append("mode", "table_scan");
      formData.append("file", new Blob([samplePngBuffer], { type: "image/png" }), "table.png");

      const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
        body: formData,
      });

      const res = await POST(req as any);
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.totalDetected).toBe(0);
      expect(body.items.length).toBe(0);
      expect(body.allHighConfidence).toBe(false);
    });
  });

  // =========================================================================
  // 8. ADVERSARIAL MIXED BATCH & CONCURRENT RESOLUTION
  // =========================================================================
  describe("8. Mixed Batch & Concurrent ActionType Resolution", () => {
    it("should correctly resolve mixed actionTypes (update vs create) in a single multi_file batch", async () => {
      if (!teacherStudent) throw new Error("No student available");
      const existingDate = "2026-10-25";
      const newDate = "2026-10-26";

      // Seed record for existingDate only
      await db.delete(attendanceRecords).where(
        and(
          eq(attendanceRecords.classId, teacherClass.id),
          eq(attendanceRecords.studentId, teacherStudent.id),
          eq(attendanceRecords.attendanceDate, existingDate)
        )
      );
      await db.delete(attendanceRecords).where(
        and(
          eq(attendanceRecords.classId, teacherClass.id),
          eq(attendanceRecords.studentId, teacherStudent.id),
          eq(attendanceRecords.attendanceDate, newDate)
        )
      );

      const [inserted] = await db.insert(attendanceRecords).values({
        classId: teacherClass.id,
        studentId: teacherStudent.id,
        attendanceDate: existingDate,
        status: "Sakit",
        letterStatus: "Belum",
      });
      const expectedRecordId = (inserted as any).insertId;

      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/extract-letter")) {
          callCount++;
          const targetDate = callCount === 1 ? existingDate : newDate;
          return {
            ok: true,
            json: async () => ({
              detected: {
                studentId: teacherStudent.id,
                studentName: teacherStudent.name,
                matchConfidence: 0.95,
                status: "Sakit",
                startDate: targetDate,
                endDate: null,
                isMultiDay: false,
                description: `Surat ${callCount}`,
              },
            }),
          };
        }
        return { ok: false };
      });
      vi.stubGlobal("fetch", mockFetch);

      const formData = new FormData();
      formData.append("classId", String(teacherClass.id));
      formData.append("mode", "multi_file");
      formData.append("files", new Blob([samplePngBuffer], { type: "image/png" }), "letter1.png");
      formData.append("files", new Blob([samplePngBuffer], { type: "image/png" }), "letter2.png");

      const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
        body: formData,
      });

      const res = await POST(req as any);
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.totalDetected).toBe(2);
      expect(body.allHighConfidence).toBe(true);

      const item1 = body.items.find((i: any) => i.startDate === existingDate);
      const item2 = body.items.find((i: any) => i.startDate === newDate);

      expect(item1.actionType).toBe("update");
      expect(item1.existingRecordId).toBe(expectedRecordId);

      expect(item2.actionType).toBe("create");
      expect(item2.existingRecordId).toBeNull();

      // Cleanup
      await db.delete(attendanceRecords).where(
        and(
          eq(attendanceRecords.classId, teacherClass.id),
          eq(attendanceRecords.studentId, teacherStudent.id),
          eq(attendanceRecords.attendanceDate, existingDate)
        )
      );
    });

    it("should handle 5 concurrent requests without race conditions or memory corruption", async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/extract-letter")) {
          return {
            ok: true,
            json: async () => ({
              detected: {
                studentId: teacherStudent.id,
                studentName: teacherStudent.name,
                matchConfidence: 0.90,
                status: "Izin",
                startDate: "2026-10-27",
                endDate: null,
                isMultiDay: false,
                description: "Concurrent request",
              },
            }),
          };
        }
        return { ok: false };
      });
      vi.stubGlobal("fetch", mockFetch);

      const reqPromises = Array.from({ length: 5 }, (_, idx) => {
        const formData = new FormData();
        formData.append("classId", String(teacherClass.id));
        formData.append("mode", "multi_file");
        formData.append("files", new Blob([samplePngBuffer], { type: "image/png" }), `concurrent_${idx}.png`);

        const req = new Request("http://localhost:3000/api/ocr/letter/batch", {
          method: "POST",
          headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
          body: formData,
        });

        return POST(req as any);
      });

      const responses = await Promise.all(reqPromises);
      for (const res of responses) {
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.items.length).toBe(1);
      }
    });
  });

  // =========================================================================
  // 9. ADVERSARIAL GEOMETRY & PATH TRAVERSAL IN CROP STORAGE
  // =========================================================================
  describe("9. Crop Storage Geometry Clamping & Path Security", () => {
    it("should safely clamp inverted, negative, and out-of-bound bounding boxes without crashing Sharp", async () => {
      const { normalizeBoundingBox, cropLetterToWebp, autoOrientImage } = await import("@/lib/letter-crop-storage");

      // Test with 100x100 virtual dimensions
      // Inverted box: ymin > ymax, xmin > xmax
      const boxInverted = normalizeBoundingBox([0.9, 0.8, 0.1, 0.2], 100, 100);
      expect(boxInverted.left).toBeGreaterThanOrEqual(0);
      expect(boxInverted.top).toBeGreaterThanOrEqual(0);
      expect(boxInverted.left + boxInverted.width).toBeLessThanOrEqual(100);
      expect(boxInverted.top + boxInverted.height).toBeLessThanOrEqual(100);
      expect(boxInverted.width).toBeGreaterThanOrEqual(1);
      expect(boxInverted.height).toBeGreaterThanOrEqual(1);

      // Out-of-bounds box: negative coordinates and coordinates > 1.0
      const boxOob = normalizeBoundingBox([-0.5, -0.2, 1.8, 2.0], 200, 200);
      expect(boxOob.left).toBe(0);
      expect(boxOob.top).toBe(0);
      expect(boxOob.width).toBeLessThanOrEqual(200);
      expect(boxOob.height).toBeLessThanOrEqual(200);

      // Zero-area box: width 0, height 0
      const boxZero = normalizeBoundingBox([0.5, 0.5, 0.5, 0.5], 100, 100);
      expect(boxZero.width).toBeGreaterThanOrEqual(1);
      expect(boxZero.height).toBeGreaterThanOrEqual(1);

      // Actually crop sample image with clamped box to verify Sharp does not throw
      const oriented = await autoOrientImage(samplePngBuffer);
      const boxForActualImage = normalizeBoundingBox([0.5, 0.5, 0.5, 0.5], oriented.width, oriented.height);
      const cropResult = await cropLetterToWebp(oriented.orientedBuffer, boxForActualImage);
      expect(cropResult).toBeDefined();
      expect(cropResult.length).toBeGreaterThan(0);
    });

    it("should sanitize path traversal attempts in customTempFileId", async () => {
      const { saveCroppedLetterToTemp, deleteTempLetterFile } = await import("@/lib/letter-crop-storage");

      // Malicious traversal attempt
      const saved = await saveCroppedLetterToTemp(
        teacherClass.id,
        samplePngBuffer,
        "../../../etc/passwd_exploit"
      );

      // Path traversal characters must be stripped
      expect(saved.tempFileId).not.toContain("..");
      expect(saved.tempFileId).not.toContain("/");
      expect(saved.filePath).toContain(`${teacherClass.id}/temp/`);

      // Cleanup
      await deleteTempLetterFile(teacherClass.id, saved.tempFileId);
    });
  });
});

