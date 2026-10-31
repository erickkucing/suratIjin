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

const sampleWebpBuffer = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  0x56, 0x50, 0x38, 0x4c, 0x0e, 0x00, 0x00, 0x00, 0x2f, 0x00, 0x00, 0x00,
  0x10, 0x07, 0x10, 0x11, 0x11, 0x88, 0x88, 0xfe, 0x07, 0x00,
]);

describe("Adversarial Stress Harness: Attendance Batch-Sync API", () => {
  const testStorageBase = path.resolve("./storage/test_uploads_adversarial");
  let testClassId: number;
  let testWaliKelasUser: any;
  let activeStudent: any;
  let inactiveStudent: any;
  let sessionToken: string;

  beforeEach(async () => {
    _clearRateLimitStoreForTesting();
    process.env.STORAGE_PATH = testStorageBase;
    if (fs.existsSync(testStorageBase)) {
      fs.rmSync(testStorageBase, { recursive: true, force: true });
    }
    fs.mkdirSync(testStorageBase, { recursive: true });

    // Seed or locate test teacher
    testWaliKelasUser = await db.query.users.findFirst({
      where: eq(users.role, "wali_kelas"),
    });
    if (!testWaliKelasUser) {
      testWaliKelasUser = await db.query.users.findFirst();
    }

    // Seed or locate test class
    let cls = await db.query.classes.findFirst({
      where: eq(classes.waliKelasId, testWaliKelasUser.id),
    });
    if (!cls) {
      const inserted = await db.insert(classes).values({
        name: "ADV-TEST-CLASS",
        slug: `adv-test-${Date.now()}`,
        waliKelasId: testWaliKelasUser.id,
      });
      testClassId = inserted[0].insertId;
    } else {
      testClassId = cls.id;
    }

    // Active student
    let st = await db.query.students.findFirst({
      where: and(eq(students.classId, testClassId), eq(students.isActive, true)),
    });
    if (!st) {
      const insSt = await db.insert(students).values({
        classId: testClassId,
        name: "Siswa Aktif Test",
        nis: `ADV-${Date.now()}`,
        isActive: true,
      });
      activeStudent = { id: insSt[0].insertId, name: "Siswa Aktif Test" };
    } else {
      activeStudent = st;
    }

    // Inactive student
    let inactSt = await db.query.students.findFirst({
      where: and(eq(students.classId, testClassId), eq(students.isActive, false)),
    });
    if (!inactSt) {
      const insInact = await db.insert(students).values({
        classId: testClassId,
        name: "Siswa Nonaktif Test",
        nis: `INACT-${Date.now()}`,
        isActive: false,
      });
      inactiveStudent = { id: insInact[0].insertId, name: "Siswa Nonaktif Test" };
    } else {
      inactiveStudent = inactSt;
    }

    sessionToken = await createSessionToken({
      id: testWaliKelasUser.id,
      username: testWaliKelasUser.username,
      displayName: testWaliKelasUser.displayName,
      role: testWaliKelasUser.role,
    });
  });

  afterEach(async () => {
    if (activeStudent && testClassId) {
      await db.delete(attendanceRecords).where(
        and(
          eq(attendanceRecords.classId, testClassId),
          eq(attendanceRecords.studentId, activeStudent.id)
        )
      );
    }
    if (fs.existsSync(testStorageBase)) {
      fs.rmSync(testStorageBase, { recursive: true, force: true });
    }
    delete process.env.STORAGE_PATH;
  });

  const createAuthedRequest = (body: any) => {
    return new Request("http://localhost:3000/api/attendance/batch-sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`,
      },
      body: JSON.stringify(body),
    });
  };

  it("1. [Inactive Student Rejection] rejects batch-sync for inactive/archived students", async () => {
    const tempDir = path.resolve(testStorageBase, String(testClassId), "temp");
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(path.resolve(tempDir, "temp_inact.webp"), sampleWebpBuffer);

    const req = createAuthedRequest({
      classId: testClassId,
      items: [
        {
          tempFileId: "temp_inact.webp",
          studentId: inactiveStudent.id,
          status: "Izin",
          startDate: "2026-10-31",
        },
      ],
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain("tidak ditemukan dalam kelas ini");
  });

  it("2. [Path Traversal Neutralization] neutralizes directory traversal payloads in tempFileId", async () => {
    const req = createAuthedRequest({
      classId: testClassId,
      items: [
        {
          tempFileId: "../../../../../etc/passwd",
          studentId: activeStudent.id,
          status: "Sakit",
          startDate: "2026-10-31",
        },
      ],
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain("tidak ditemukan atau sudah kedaluwarsa");
  });

  it("3. [Invalid Status Injection] rejects non-enum attendance status values", async () => {
    const tempDir = path.resolve(testStorageBase, String(testClassId), "temp");
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(path.resolve(tempDir, "temp_stat.webp"), sampleWebpBuffer);

    const req = createAuthedRequest({
      classId: testClassId,
      items: [
        {
          tempFileId: "temp_stat.webp",
          studentId: activeStudent.id,
          status: "Hadir", // Only 'Izin' or 'Sakit' allowed
          startDate: "2026-10-31",
        },
      ],
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain("Status harus 'Izin' atau 'Sakit'");
  });

  it("4. [Malformed Date Fuzzing] rejects non-ISO date formats", async () => {
    const req = createAuthedRequest({
      classId: testClassId,
      items: [
        {
          tempFileId: "temp_valid.webp",
          studentId: activeStudent.id,
          status: "Izin",
          startDate: "31/10/2026", // Invalid format
        },
      ],
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain("Format tanggal mulai harus YYYY-MM-DD");
  });

  it("5. [Atomic Upsert Idempotency] executing the same batch twice updates existing records without duplicate rows", async () => {
    const tempDir = path.resolve(testStorageBase, String(testClassId), "temp");
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(path.resolve(tempDir, "temp_idempotent_1.webp"), sampleWebpBuffer);

    const testDate = "2026-10-31";

    // Clean up any existing record for this date
    await db.delete(attendanceRecords).where(
      and(
        eq(attendanceRecords.studentId, activeStudent.id),
        eq(attendanceRecords.attendanceDate, testDate)
      )
    );

    // Call 1: Creates new record
    const req1 = createAuthedRequest({
      classId: testClassId,
      items: [
        {
          tempFileId: "temp_idempotent_1.webp",
          studentId: activeStudent.id,
          status: "Izin",
          startDate: testDate,
          description: "Panggilan pertama",
        },
      ],
    });

    const res1 = await POST(req1 as any);
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(data1.success).toBe(true);
    expect(data1.createdCount).toBe(1);

    // Prepare temp file 2
    fs.writeFileSync(path.resolve(tempDir, "temp_idempotent_2.webp"), sampleWebpBuffer);

    // Call 2: Updates existing record
    const req2 = createAuthedRequest({
      classId: testClassId,
      items: [
        {
          tempFileId: "temp_idempotent_2.webp",
          studentId: activeStudent.id,
          status: "Sakit",
          startDate: testDate,
          description: "Update menjadi sakit",
        },
      ],
    });

    const res2 = await POST(req2 as any);
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2.success).toBe(true);
    expect(data2.updatedCount).toBe(1);
    expect(data2.createdCount).toBe(0);

    // Verify database only has 1 record for this student on this date
    const records = await db.query.attendanceRecords.findMany({
      where: and(
        eq(attendanceRecords.studentId, activeStudent.id),
        eq(attendanceRecords.attendanceDate, testDate)
      ),
    });
    expect(records.length).toBe(1);
    expect(records[0].status).toBe("Sakit");
    expect(records[0].letterStatus).toBe("Sudah");
    expect(records[0].description).toBe("Update menjadi sakit");

    // Clean up created record so database state remains pure
    await db.delete(attendanceRecords).where(
      and(
        eq(attendanceRecords.studentId, activeStudent.id),
        eq(attendanceRecords.attendanceDate, testDate)
      )
    );
  });
});
