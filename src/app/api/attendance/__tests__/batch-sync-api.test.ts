import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST } from "../batch-sync/route";
import { db } from "@/db";
import { users, classes, students, attendanceRecords } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { _clearRateLimitStoreForTesting } from "@/lib/rate-limiter";
import fs from "fs";
import path from "path";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Minimal valid WebP binary header for disk testing
const sampleWebpBuffer = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  0x56, 0x50, 0x38, 0x4c, 0x0e, 0x00, 0x00, 0x00, 0x2f, 0x00, 0x00, 0x00,
  0x10, 0x07, 0x10, 0x11, 0x11, 0x88, 0x88, 0xfe, 0x07, 0x00,
]);

describe("Attendance Batch-Sync API (/api/attendance/batch-sync)", () => {
  const testStorageBase = path.resolve("./storage/test_uploads_batch_sync");

  beforeEach(() => {
    _clearRateLimitStoreForTesting();
    process.env.STORAGE_PATH = testStorageBase;
    if (fs.existsSync(testStorageBase)) {
      fs.rmSync(testStorageBase, { recursive: true, force: true });
    }
    fs.mkdirSync(testStorageBase, { recursive: true });
  });

  afterEach(async () => {
    if (fs.existsSync(testStorageBase)) {
      fs.rmSync(testStorageBase, { recursive: true, force: true });
    }
    delete process.env.STORAGE_PATH;
  });

  it("1. should return 401 when request is unauthenticated", async () => {
    const req = new Request("http://localhost:3000/api/attendance/batch-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classId: 1, items: [] }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Sesi tidak valid");
  });

  it("2. should return 400 when payload is missing or invalid", async () => {
    const adminUser = await db.query.users.findFirst({ where: eq(users.role, "superadmin") });
    if (!adminUser) throw new Error("Superadmin user not found");

    const token = await createSessionToken({
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      role: adminUser.role,
    });

    const req = new Request("http://localhost:3000/api/attendance/batch-sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: JSON.stringify({ classId: "invalid", items: [] }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("3. should return 403 when teacher is not authorized for target class", async () => {
    const teacherUser = await db.query.users.findFirst({ where: eq(users.role, "wali_kelas") });
    if (!teacherUser) throw new Error("Teacher user not found");

    const token = await createSessionToken({
      id: teacherUser.id,
      username: teacherUser.username,
      displayName: teacherUser.displayName,
      role: teacherUser.role,
    });

    const req = new Request("http://localhost:3000/api/attendance/batch-sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: JSON.stringify({
        classId: 999999, // Non-assigned / non-existent class
        items: [
          {
            tempFileId: "temp_fake_1",
            studentId: 1,
            status: "Izin",
            startDate: "2026-10-25",
          },
        ],
      }),
    });

    const res = await POST(req as any);
    expect([403, 404]).toContain(res.status);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("4. should return 400 when student does not belong to the class", async () => {
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

    const req = new Request("http://localhost:3000/api/attendance/batch-sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: JSON.stringify({
        classId: testClass.id,
        items: [
          {
            tempFileId: "temp_ghost_student",
            studentId: 999999, // Non-existent student
            status: "Izin",
            startDate: "2026-10-25",
          },
        ],
      }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("tidak ditemukan dalam kelas");
  });

  it("5. should return 400 when temp file does not exist on disk", async () => {
    const adminUser = await db.query.users.findFirst({ where: eq(users.role, "superadmin") });
    if (!adminUser) throw new Error("Superadmin not found");
    const testClass = await db.query.classes.findFirst();
    if (!testClass) throw new Error("Class not found");
    const testStudent = await db.query.students.findFirst({ where: eq(students.classId, testClass.id) });
    if (!testStudent) throw new Error("Student not found");

    const token = await createSessionToken({
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      role: adminUser.role,
    });

    const req = new Request("http://localhost:3000/api/attendance/batch-sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: JSON.stringify({
        classId: testClass.id,
        items: [
          {
            tempFileId: "non_existent_temp_file_123",
            studentId: testStudent.id,
            status: "Izin",
            startDate: "2026-10-25",
          },
        ],
      }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("tidak ditemukan atau sudah kedaluwarsa");
  });

  it("6. should idempotently update existing 'Belum' records to 'Sudah' and promote temp file", async () => {
    const adminUser = await db.query.users.findFirst({ where: eq(users.role, "superadmin") });
    if (!adminUser) throw new Error("Superadmin not found");
    const testClass = await db.query.classes.findFirst();
    if (!testClass) throw new Error("Class not found");
    const testStudent = await db.query.students.findFirst({ where: eq(students.classId, testClass.id) });
    if (!testStudent) throw new Error("Student not found");

    const targetDate = "2026-10-25";

    // Clean up existing record
    await db.delete(attendanceRecords).where(
      and(
        eq(attendanceRecords.classId, testClass.id),
        eq(attendanceRecords.studentId, testStudent.id),
        eq(attendanceRecords.attendanceDate, targetDate)
      )
    );

    // Seed existing attendance with letterStatus 'Belum'
    const [inserted] = await db.insert(attendanceRecords).values({
      classId: testClass.id,
      studentId: testStudent.id,
      attendanceDate: targetDate,
      status: "Izin",
      letterStatus: "Belum",
      createdById: adminUser.id,
    });
    const recordId = (inserted as any).insertId;

    // Seed temp letter file on disk
    const tempDir = path.resolve(testStorageBase, String(testClass.id), "temp");
    fs.mkdirSync(tempDir, { recursive: true });
    const tempFileId = `temp_sync_update_${Date.now()}`;
    fs.writeFileSync(path.resolve(tempDir, `${tempFileId}.webp`), sampleWebpBuffer);

    const token = await createSessionToken({
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      role: adminUser.role,
    });

    const req = new Request("http://localhost:3000/api/attendance/batch-sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: JSON.stringify({
        classId: testClass.id,
        items: [
          {
            tempFileId,
            studentId: testStudent.id,
            status: "Izin",
            startDate: targetDate,
            description: "Surat izin sakit kepala",
            actionType: "update",
            existingRecordId: recordId,
          },
        ],
      }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.updatedCount).toBe(1);
    expect(body.createdCount).toBe(0);
    expect(body.totalProcessed).toBe(1);

    // Verify DB update
    const updated = await db.query.attendanceRecords.findFirst({
      where: and(
        eq(attendanceRecords.classId, testClass.id),
        eq(attendanceRecords.studentId, testStudent.id),
        eq(attendanceRecords.attendanceDate, targetDate)
      ),
    });
    expect(updated).toBeDefined();
    expect(updated?.letterStatus).toBe("Sudah");
    expect(updated?.letterFilePath).toMatch(new RegExp(`^${testClass.id}/\\d{4}-\\d{2}/\\d+_[a-f0-9]+\\.webp$`));
    expect(updated?.letterMimeType).toBe("image/webp");

    // Verify temp file promoted (no longer exists in temp)
    expect(fs.existsSync(path.resolve(tempDir, `${tempFileId}.webp`))).toBe(false);

    // Verify permanent file exists on disk
    const permFullPath = path.resolve(testStorageBase, updated!.letterFilePath!);
    expect(fs.existsSync(permFullPath)).toBe(true);

    // Clean up
    await db.delete(attendanceRecords).where(
      and(
        eq(attendanceRecords.classId, testClass.id),
        eq(attendanceRecords.studentId, testStudent.id),
        eq(attendanceRecords.attendanceDate, targetDate)
      )
    );
  });

  it("7. should create new attendance records for unrecorded students", async () => {
    const adminUser = await db.query.users.findFirst({ where: eq(users.role, "superadmin") });
    if (!adminUser) throw new Error("Superadmin not found");
    const testClass = await db.query.classes.findFirst();
    if (!testClass) throw new Error("Class not found");
    const testStudent = await db.query.students.findFirst({ where: eq(students.classId, testClass.id) });
    if (!testStudent) throw new Error("Student not found");

    const targetDate = "2026-10-26";

    await db.delete(attendanceRecords).where(
      and(
        eq(attendanceRecords.classId, testClass.id),
        eq(attendanceRecords.studentId, testStudent.id),
        eq(attendanceRecords.attendanceDate, targetDate)
      )
    );

    // Seed temp file
    const tempDir = path.resolve(testStorageBase, String(testClass.id), "temp");
    fs.mkdirSync(tempDir, { recursive: true });
    const tempFileId = `temp_sync_create_${Date.now()}`;
    fs.writeFileSync(path.resolve(tempDir, `${tempFileId}.webp`), sampleWebpBuffer);

    const token = await createSessionToken({
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      role: adminUser.role,
    });

    const req = new Request("http://localhost:3000/api/attendance/batch-sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: JSON.stringify({
        classId: testClass.id,
        items: [
          {
            tempFileId,
            studentId: testStudent.id,
            status: "Sakit",
            startDate: targetDate,
            description: "Demam berdarah",
            actionType: "create",
          },
        ],
      }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.updatedCount).toBe(0);
    expect(body.createdCount).toBe(1);
    expect(body.totalProcessed).toBe(1);

    const created = await db.query.attendanceRecords.findFirst({
      where: and(
        eq(attendanceRecords.classId, testClass.id),
        eq(attendanceRecords.studentId, testStudent.id),
        eq(attendanceRecords.attendanceDate, targetDate)
      ),
    });
    expect(created).toBeDefined();
    expect(created?.status).toBe("Sakit");
    expect(created?.letterStatus).toBe("Sudah");
    expect(created?.description).toBe("Demam berdarah");

    await db.delete(attendanceRecords).where(
      and(
        eq(attendanceRecords.classId, testClass.id),
        eq(attendanceRecords.studentId, testStudent.id),
        eq(attendanceRecords.attendanceDate, targetDate)
      )
    );
  });

  it("8. should expand multi-day date range and attach single letter across all days", async () => {
    const adminUser = await db.query.users.findFirst({ where: eq(users.role, "superadmin") });
    if (!adminUser) throw new Error("Superadmin not found");
    const testClass = await db.query.classes.findFirst();
    if (!testClass) throw new Error("Class not found");
    const testStudent = await db.query.students.findFirst({ where: eq(students.classId, testClass.id) });
    if (!testStudent) throw new Error("Student not found");

    const multiDates = ["2026-10-27", "2026-10-28", "2026-10-29"];

    for (const d of multiDates) {
      await db.delete(attendanceRecords).where(
        and(
          eq(attendanceRecords.classId, testClass.id),
          eq(attendanceRecords.studentId, testStudent.id),
          eq(attendanceRecords.attendanceDate, d)
        )
      );
    }

    // Seed temp file
    const tempDir = path.resolve(testStorageBase, String(testClass.id), "temp");
    fs.mkdirSync(tempDir, { recursive: true });
    const tempFileId = `temp_sync_multi_${Date.now()}`;
    fs.writeFileSync(path.resolve(tempDir, `${tempFileId}.webp`), sampleWebpBuffer);

    const token = await createSessionToken({
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      role: adminUser.role,
    });

    const req = new Request("http://localhost:3000/api/attendance/batch-sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: JSON.stringify({
        classId: testClass.id,
        items: [
          {
            tempFileId,
            studentId: testStudent.id,
            status: "Izin",
            startDate: "2026-10-27",
            endDate: "2026-10-29",
            isMultiDay: true,
            description: "Izin ke luar kota",
          },
        ],
      }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.createdCount).toBe(3);
    expect(body.totalProcessed).toBe(3);

    // Verify all 3 records share the identical single letter attachment
    const records = await db.query.attendanceRecords.findMany({
      where: and(
        eq(attendanceRecords.classId, testClass.id),
        eq(attendanceRecords.studentId, testStudent.id)
      ),
    });
    const multiRecords = records.filter((r) => multiDates.includes(r.attendanceDate));
    expect(multiRecords.length).toBe(3);

    const firstFilePath = multiRecords[0].letterFilePath;
    expect(firstFilePath).toBeDefined();
    for (const r of multiRecords) {
      expect(r.letterFilePath).toBe(firstFilePath);
      expect(r.letterStatus).toBe("Sudah");
    }

    // Clean up
    for (const d of multiDates) {
      await db.delete(attendanceRecords).where(
        and(
          eq(attendanceRecords.classId, testClass.id),
          eq(attendanceRecords.studentId, testStudent.id),
          eq(attendanceRecords.attendanceDate, d)
        )
      );
    }
  });

  it("9. should enforce rate limiting (429 on exceeding 10 requests/min)", async () => {
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

    // Exhaust 10 allowed requests
    for (let i = 0; i < 10; i++) {
      const req = new Request("http://localhost:3000/api/attendance/batch-sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
        body: JSON.stringify({ classId: testClass.id, items: [] }),
      });
      await POST(req as any);
    }

    // 11th request must receive 429
    const blockedReq = new Request("http://localhost:3000/api/attendance/batch-sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: JSON.stringify({ classId: testClass.id, items: [] }),
    });

    const res = await POST(blockedReq as any);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Terlalu banyak permintaan");
  });
});
