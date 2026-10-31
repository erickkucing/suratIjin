import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST } from "../batch-sync/route";
import { db } from "@/db";
import { users, classes, students, attendanceRecords } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
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

describe("Empirical Challenge & Stress Tests: Batch-Sync API (/api/attendance/batch-sync)", () => {
  const testStorageBase = path.resolve("./storage/test_challenge_batch_sync");

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

  // Helper to create test auth headers
  async function getAdminToken() {
    const adminUser = await db.query.users.findFirst({ where: eq(users.role, "superadmin") });
    if (!adminUser) throw new Error("Superadmin not found");
    const token = await createSessionToken({
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      role: adminUser.role,
    });
    return { adminUser, token };
  }

  it("CHALLENGE 1: Repeat execution of the exact same batch payload must NOT create duplicate records", async () => {
    const { token } = await getAdminToken();
    const testClass = await db.query.classes.findFirst();
    if (!testClass) throw new Error("Class not found");
    const testStudent = await db.query.students.findFirst({ where: eq(students.classId, testClass.id) });
    if (!testStudent) throw new Error("Student not found");

    const targetDate = "2026-11-20";

    // Clean up
    await db.delete(attendanceRecords).where(
      and(
        eq(attendanceRecords.classId, testClass.id),
        eq(attendanceRecords.studentId, testStudent.id),
        eq(attendanceRecords.attendanceDate, targetDate)
      )
    );

    // Create temp file on disk
    const tempDir = path.resolve(testStorageBase, String(testClass.id), "temp");
    fs.mkdirSync(tempDir, { recursive: true });
    const tempFileId = `temp_repeat_${Date.now()}`;
    fs.writeFileSync(path.resolve(tempDir, `${tempFileId}.webp`), sampleWebpBuffer);

    const payload = {
      classId: testClass.id,
      items: [
        {
          tempFileId,
          studentId: testStudent.id,
          status: "Izin",
          startDate: targetDate,
          description: "Testing repeat submission",
        },
      ],
    };

    // Execution 1: Should succeed
    const req1 = new Request("http://localhost:3000/api/attendance/batch-sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: JSON.stringify(payload),
    });

    const res1 = await POST(req1 as any);
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.success).toBe(true);
    expect(body1.createdCount).toBe(1);

    // Verify 1 record exists in DB
    const recordsAfterRun1 = await db.query.attendanceRecords.findMany({
      where: and(
        eq(attendanceRecords.classId, testClass.id),
        eq(attendanceRecords.studentId, testStudent.id),
        eq(attendanceRecords.attendanceDate, targetDate)
      ),
    });
    expect(recordsAfterRun1.length).toBe(1);

    // Execution 2: Re-submitting the exact same payload
    // Note: The temp file was promoted in Run 1, so pre-flight catches missing temp file
    const req2 = new Request("http://localhost:3000/api/attendance/batch-sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: JSON.stringify(payload),
    });

    const res2 = await POST(req2 as any);
    // Should be rejected by pre-flight (temp file no longer in temp/)
    expect(res2.status).toBe(400);

    // Critically, DB must still have EXACTLY 1 record, zero duplicates
    const recordsAfterRun2 = await db.query.attendanceRecords.findMany({
      where: and(
        eq(attendanceRecords.classId, testClass.id),
        eq(attendanceRecords.studentId, testStudent.id),
        eq(attendanceRecords.attendanceDate, targetDate)
      ),
    });
    expect(recordsAfterRun2.length).toBe(1);

    // Clean up
    await db.delete(attendanceRecords).where(
      and(
        eq(attendanceRecords.classId, testClass.id),
        eq(attendanceRecords.studentId, testStudent.id),
        eq(attendanceRecords.attendanceDate, targetDate)
      )
    );
  });

  it("CHALLENGE 2: Repeat submission for same student/date with NEW temp file updates in-place without duplicate", async () => {
    const { token } = await getAdminToken();
    const testClass = await db.query.classes.findFirst();
    if (!testClass) throw new Error("Class not found");
    const testStudent = await db.query.students.findFirst({ where: eq(students.classId, testClass.id) });
    if (!testStudent) throw new Error("Student not found");

    const targetDate = "2026-11-21";

    await db.delete(attendanceRecords).where(
      and(
        eq(attendanceRecords.classId, testClass.id),
        eq(attendanceRecords.studentId, testStudent.id),
        eq(attendanceRecords.attendanceDate, targetDate)
      )
    );

    const tempDir = path.resolve(testStorageBase, String(testClass.id), "temp");
    fs.mkdirSync(tempDir, { recursive: true });

    // Pass 1: Submit Initial Record
    const tempFileId1 = `temp_p1_${Date.now()}`;
    fs.writeFileSync(path.resolve(tempDir, `${tempFileId1}.webp`), sampleWebpBuffer);

    const req1 = new Request("http://localhost:3000/api/attendance/batch-sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: JSON.stringify({
        classId: testClass.id,
        items: [
          {
            tempFileId: tempFileId1,
            studentId: testStudent.id,
            status: "Izin",
            startDate: targetDate,
            description: "First submission",
          },
        ],
      }),
    });

    const res1 = await POST(req1 as any);
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.createdCount).toBe(1);

    // Pass 2: Submit update for the same student on the same date with new temp file
    const tempFileId2 = `temp_p2_${Date.now()}`;
    fs.writeFileSync(path.resolve(tempDir, `${tempFileId2}.webp`), sampleWebpBuffer);

    const req2 = new Request("http://localhost:3000/api/attendance/batch-sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: JSON.stringify({
        classId: testClass.id,
        items: [
          {
            tempFileId: tempFileId2,
            studentId: testStudent.id,
            status: "Sakit",
            startDate: targetDate,
            description: "Second submission - correction to Sakit",
          },
        ],
      }),
    });

    const res2 = await POST(req2 as any);
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.updatedCount).toBe(1);
    expect(body2.createdCount).toBe(0);

    // Verify DB count is still strictly 1
    const records = await db.query.attendanceRecords.findMany({
      where: and(
        eq(attendanceRecords.classId, testClass.id),
        eq(attendanceRecords.studentId, testStudent.id),
        eq(attendanceRecords.attendanceDate, targetDate)
      ),
    });
    expect(records.length).toBe(1);
    expect(records[0].status).toBe("Sakit");
    expect(records[0].description).toBe("Second submission - correction to Sakit");
    expect(records[0].letterStatus).toBe("Sudah");

    // Clean up
    await db.delete(attendanceRecords).where(
      and(
        eq(attendanceRecords.classId, testClass.id),
        eq(attendanceRecords.studentId, testStudent.id),
        eq(attendanceRecords.attendanceDate, targetDate)
      )
    );
  });

  it("CHALLENGE 3: Multi-day date expansion with mixed existing 'Belum' and unrecorded days", async () => {
    const { adminUser, token } = await getAdminToken();
    const testClass = await db.query.classes.findFirst();
    if (!testClass) throw new Error("Class not found");
    const testStudent = await db.query.students.findFirst({ where: eq(students.classId, testClass.id) });
    if (!testStudent) throw new Error("Student not found");

    const dates = ["2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25"];

    // Clean up all 4 dates
    for (const d of dates) {
      await db.delete(attendanceRecords).where(
        and(
          eq(attendanceRecords.classId, testClass.id),
          eq(attendanceRecords.studentId, testStudent.id),
          eq(attendanceRecords.attendanceDate, d)
        )
      );
    }

    // Pre-seed Day 1 (2026-11-22) and Day 3 (2026-11-24) with status 'Belum'
    await db.insert(attendanceRecords).values([
      {
        classId: testClass.id,
        studentId: testStudent.id,
        attendanceDate: "2026-11-22",
        status: "Izin",
        letterStatus: "Belum",
        createdById: adminUser.id,
      },
      {
        classId: testClass.id,
        studentId: testStudent.id,
        attendanceDate: "2026-11-24",
        status: "Izin",
        letterStatus: "Belum",
        createdById: adminUser.id,
      },
    ]);

    // Temp file
    const tempDir = path.resolve(testStorageBase, String(testClass.id), "temp");
    fs.mkdirSync(tempDir, { recursive: true });
    const tempFileId = `temp_multiday_mixed_${Date.now()}`;
    fs.writeFileSync(path.resolve(tempDir, `${tempFileId}.webp`), sampleWebpBuffer);

    // Submit 4-day range
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
            startDate: "2026-11-22",
            endDate: "2026-11-25",
            isMultiDay: true,
            description: "Surat sakit dokter 4 hari",
          },
        ],
      }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();

    // 2 existing updated, 2 new created = 4 total
    expect(body.updatedCount).toBe(2);
    expect(body.createdCount).toBe(2);
    expect(body.totalProcessed).toBe(4);

    // Verify all 4 dates in DB
    const records = await db.query.attendanceRecords.findMany({
      where: and(
        eq(attendanceRecords.classId, testClass.id),
        eq(attendanceRecords.studentId, testStudent.id),
        inArray(attendanceRecords.attendanceDate, dates)
      ),
    });
    expect(records.length).toBe(4);

    const commonLetterFile = records[0].letterFilePath;
    expect(commonLetterFile).toBeDefined();

    for (const r of records) {
      expect(r.letterStatus).toBe("Sudah");
      expect(r.status).toBe("Sakit");
      expect(r.description).toBe("Surat sakit dokter 4 hari");
      expect(r.letterFilePath).toBe(commonLetterFile);
    }

    // Clean up
    for (const d of dates) {
      await db.delete(attendanceRecords).where(
        and(
          eq(attendanceRecords.classId, testClass.id),
          eq(attendanceRecords.studentId, testStudent.id),
          eq(attendanceRecords.attendanceDate, d)
        )
      );
    }
  });

  it("CHALLENGE 4: Pre-flight missing temp file rejection atomicity across multi-item payload", async () => {
    const { token } = await getAdminToken();
    const testClass = await db.query.classes.findFirst();
    if (!testClass) throw new Error("Class not found");
    const testStudents = await db.query.students.findMany({
      where: and(eq(students.classId, testClass.id), eq(students.isActive, true)),
      limit: 2,
    });
    if (testStudents.length < 2) throw new Error("Need at least 2 students");

    const date1 = "2026-11-26";
    const date2 = "2026-11-27";

    // Clean up
    await db.delete(attendanceRecords).where(
      and(
        eq(attendanceRecords.classId, testClass.id),
        inArray(attendanceRecords.attendanceDate, [date1, date2])
      )
    );

    // Create temp file for student 1 ONLY
    const tempDir = path.resolve(testStorageBase, String(testClass.id), "temp");
    fs.mkdirSync(tempDir, { recursive: true });
    const tempFileId1 = `temp_exists_${Date.now()}`;
    fs.writeFileSync(path.resolve(tempDir, `${tempFileId1}.webp`), sampleWebpBuffer);
    const tempFileId2 = `temp_MISSING_${Date.now()}`; // Does NOT exist on disk

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
            tempFileId: tempFileId1,
            studentId: testStudents[0].id,
            status: "Izin",
            startDate: date1,
          },
          {
            tempFileId: tempFileId2,
            studentId: testStudents[1].id,
            status: "Izin",
            startDate: date2,
          },
        ],
      }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain(tempFileId2);

    // ATOMICITY CHECK:
    // 1. tempFileId1 must NOT have been moved/promoted! It must still exist in temp/
    expect(fs.existsSync(path.resolve(tempDir, `${tempFileId1}.webp`))).toBe(true);

    // 2. No records must have been created in DB for either student
    const records = await db.query.attendanceRecords.findMany({
      where: and(
        eq(attendanceRecords.classId, testClass.id),
        inArray(attendanceRecords.attendanceDate, [date1, date2])
      ),
    });
    expect(records.length).toBe(0);
  });

  it("CHALLENGE 5: Internal batch payload containing duplicate items for same student/date handles cleanly", async () => {
    const { token } = await getAdminToken();
    const testClass = await db.query.classes.findFirst();
    if (!testClass) throw new Error("Class not found");
    const testStudent = await db.query.students.findFirst({ where: eq(students.classId, testClass.id) });
    if (!testStudent) throw new Error("Student not found");

    const targetDate = "2026-11-28";

    await db.delete(attendanceRecords).where(
      and(
        eq(attendanceRecords.classId, testClass.id),
        eq(attendanceRecords.studentId, testStudent.id),
        eq(attendanceRecords.attendanceDate, targetDate)
      )
    );

    const tempDir = path.resolve(testStorageBase, String(testClass.id), "temp");
    fs.mkdirSync(tempDir, { recursive: true });
    const tempFileIdA = `temp_dup_a_${Date.now()}`;
    const tempFileIdB = `temp_dup_b_${Date.now()}`;
    fs.writeFileSync(path.resolve(tempDir, `${tempFileIdA}.webp`), sampleWebpBuffer);
    fs.writeFileSync(path.resolve(tempDir, `${tempFileIdB}.webp`), sampleWebpBuffer);

    // Submit batch with duplicate items targeting the same student and same date
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
            tempFileId: tempFileIdA,
            studentId: testStudent.id,
            status: "Izin",
            startDate: targetDate,
            description: "First entry in batch",
          },
          {
            tempFileId: tempFileIdB,
            studentId: testStudent.id,
            status: "Sakit",
            startDate: targetDate,
            description: "Second entry overwrites in same batch",
          },
        ],
      }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);

    // Confirm that EXACTLY 1 record exists in DB (unique constraint never violated)
    const records = await db.query.attendanceRecords.findMany({
      where: and(
        eq(attendanceRecords.classId, testClass.id),
        eq(attendanceRecords.studentId, testStudent.id),
        eq(attendanceRecords.attendanceDate, targetDate)
      ),
    });
    expect(records.length).toBe(1);
    expect(records[0].status).toBe("Sakit");
    expect(records[0].description).toBe("Second entry overwrites in same batch");

    // Clean up
    await db.delete(attendanceRecords).where(
      and(
        eq(attendanceRecords.classId, testClass.id),
        eq(attendanceRecords.studentId, testStudent.id),
        eq(attendanceRecords.attendanceDate, targetDate)
      )
    );
  });

  it("CHALLENGE 6: Concurrent simultaneous batch-sync submissions enforce database uniqueness without corruption", async () => {
    const { token } = await getAdminToken();
    const testClass = await db.query.classes.findFirst();
    if (!testClass) throw new Error("Class not found");
    const testStudent = await db.query.students.findFirst({ where: eq(students.classId, testClass.id) });
    if (!testStudent) throw new Error("Student not found");

    const targetDate = "2026-11-29";

    await db.delete(attendanceRecords).where(
      and(
        eq(attendanceRecords.classId, testClass.id),
        eq(attendanceRecords.studentId, testStudent.id),
        eq(attendanceRecords.attendanceDate, targetDate)
      )
    );

    const tempDir = path.resolve(testStorageBase, String(testClass.id), "temp");
    fs.mkdirSync(tempDir, { recursive: true });

    // Prepare 4 distinct concurrent requests
    const concurrentCount = 4;
    const reqs: Request[] = [];

    for (let i = 0; i < concurrentCount; i++) {
      const tempId = `temp_concurrent_${i}_${Date.now()}`;
      fs.writeFileSync(path.resolve(tempDir, `${tempId}.webp`), sampleWebpBuffer);

      reqs.push(
        new Request("http://localhost:3000/api/attendance/batch-sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: `${SESSION_COOKIE_NAME}=${token}`,
          },
          body: JSON.stringify({
            classId: testClass.id,
            items: [
              {
                tempFileId: tempId,
                studentId: testStudent.id,
                status: i % 2 === 0 ? "Izin" : "Sakit",
                startDate: targetDate,
                description: `Concurrent worker ${i}`,
              },
            ],
          }),
        })
      );
    }

    // Fire all concurrent requests simultaneously
    const results = await Promise.allSettled(reqs.map((r) => POST(r as any)));

    // Verify all completed without unhandled crashes
    for (const res of results) {
      expect(res.status).toBe("fulfilled");
    }

    // CRITICAL INVARIANT: The database unique constraint (idx_attendance_class_student_date_unique)
    // MUST GUARANTEE that at most 1 record exists for that date!
    const records = await db.query.attendanceRecords.findMany({
      where: and(
        eq(attendanceRecords.classId, testClass.id),
        eq(attendanceRecords.studentId, testStudent.id),
        eq(attendanceRecords.attendanceDate, targetDate)
      ),
    });

    expect(records.length).toBe(1);
    expect(records[0].letterStatus).toBe("Sudah");

    // Clean up
    await db.delete(attendanceRecords).where(
      and(
        eq(attendanceRecords.classId, testClass.id),
        eq(attendanceRecords.studentId, testStudent.id),
        eq(attendanceRecords.attendanceDate, targetDate)
      )
    );
  });

  it("CHALLENGE 7: Safe cleanup preserves multi-day letter files when partially replaced", async () => {
    const { token } = await getAdminToken();
    const testClass = await db.query.classes.findFirst();
    if (!testClass) throw new Error("Class not found");
    const testStudent = await db.query.students.findFirst({ where: eq(students.classId, testClass.id) });
    if (!testStudent) throw new Error("Student not found");

    const day1 = "2026-11-11";
    const day2 = "2026-11-12";

    await db.delete(attendanceRecords).where(
      and(
        eq(attendanceRecords.classId, testClass.id),
        eq(attendanceRecords.studentId, testStudent.id),
        inArray(attendanceRecords.attendanceDate, [day1, day2])
      )
    );

    const tempDir = path.resolve(testStorageBase, String(testClass.id), "temp");
    fs.mkdirSync(tempDir, { recursive: true });

    // Step 1: Create a 2-day record sharing 1 letter file
    const sharedTempId = `temp_shared_${Date.now()}`;
    fs.writeFileSync(path.resolve(tempDir, `${sharedTempId}.webp`), sampleWebpBuffer);

    const req1 = new Request("http://localhost:3000/api/attendance/batch-sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: JSON.stringify({
        classId: testClass.id,
        items: [
          {
            tempFileId: sharedTempId,
            studentId: testStudent.id,
            status: "Izin",
            startDate: day1,
            endDate: day2,
            isMultiDay: true,
          },
        ],
      }),
    });

    const res1 = await POST(req1 as any);
    expect(res1.status).toBe(200);

    const recordsStep1 = await db.query.attendanceRecords.findMany({
      where: and(
        eq(attendanceRecords.classId, testClass.id),
        eq(attendanceRecords.studentId, testStudent.id),
        inArray(attendanceRecords.attendanceDate, [day1, day2])
      ),
    });
    expect(recordsStep1.length).toBe(2);
    const sharedFilePath = recordsStep1[0].letterFilePath!;
    const sharedDiskPath = path.resolve(testStorageBase, sharedFilePath);
    expect(fs.existsSync(sharedDiskPath)).toBe(true);

    // Step 2: Update ONLY Day 1 with a new letter file
    const newTempId = `temp_new_day1_${Date.now()}`;
    fs.writeFileSync(path.resolve(tempDir, `${newTempId}.webp`), sampleWebpBuffer);

    const req2 = new Request("http://localhost:3000/api/attendance/batch-sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: JSON.stringify({
        classId: testClass.id,
        items: [
          {
            tempFileId: newTempId,
            studentId: testStudent.id,
            status: "Sakit",
            startDate: day1,
          },
        ],
      }),
    });

    const res2 = await POST(req2 as any);
    expect(res2.status).toBe(200);

    // Day 1 now has new file
    const recDay1 = await db.query.attendanceRecords.findFirst({
      where: and(
        eq(attendanceRecords.classId, testClass.id),
        eq(attendanceRecords.studentId, testStudent.id),
        eq(attendanceRecords.attendanceDate, day1)
      ),
    });
    expect(recDay1?.letterFilePath).not.toBe(sharedFilePath);

    // CRITICAL: sharedFilePath must STILL exist on disk because Day 2 is still pointing to it!
    expect(fs.existsSync(sharedDiskPath)).toBe(true);

    // Step 3: Now update Day 2 with another new letter file
    const day2TempId = `temp_new_day2_${Date.now()}`;
    fs.writeFileSync(path.resolve(tempDir, `${day2TempId}.webp`), sampleWebpBuffer);

    const req3 = new Request("http://localhost:3000/api/attendance/batch-sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: JSON.stringify({
        classId: testClass.id,
        items: [
          {
            tempFileId: day2TempId,
            studentId: testStudent.id,
            status: "Sakit",
            startDate: day2,
          },
        ],
      }),
    });

    const res3 = await POST(req3 as any);
    expect(res3.status).toBe(200);

    // Now NO records in DB reference sharedFilePath.
    // It should have been safely deleted!
    expect(fs.existsSync(sharedDiskPath)).toBe(false);

    // Clean up
    await db.delete(attendanceRecords).where(
      and(
        eq(attendanceRecords.classId, testClass.id),
        eq(attendanceRecords.studentId, testStudent.id),
        inArray(attendanceRecords.attendanceDate, [day1, day2])
      )
    );
  });
});
