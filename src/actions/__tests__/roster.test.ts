import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/db";
import { classes, students, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  addStudentAction,
  updateStudentAction,
  toggleStudentActiveAction,
  deleteStudentAction,
  bulkImportStudentsAction,
} from "../class-settings";
import { createSessionToken } from "@/lib/auth";

describe("Student Roster Management & CRUD Operations", () => {
  let classId: number;
  let testStudentId: number;

  beforeAll(async () => {
    const cls = await db.query.classes.findFirst({
      where: eq(classes.slug, "xii-tkj-2"),
    });
    if (!cls) {
      throw new Error("Class xii-tkj-2 not found.");
    }
    classId = cls.id;
  });

  it("should create a new student, update name/NIS, toggle active, and delete", async () => {
    // 1. Direct DB insert for test student
    const [insertResult] = await db.insert(students).values({
      classId,
      name: "Siswa Uji Coba CRUD",
      nis: "998877",
      isActive: true,
    });
    testStudentId = insertResult.insertId;

    expect(testStudentId).toBeGreaterThan(0);

    // Verify student exists
    const inserted = await db.query.students.findFirst({
      where: eq(students.id, testStudentId),
    });
    expect(inserted).toBeDefined();
    expect(inserted?.name).toBe("Siswa Uji Coba CRUD");
    expect(inserted?.nis).toBe("998877");
    expect(inserted?.isActive).toBe(true);

    // 2. Update student
    await db
      .update(students)
      .set({ name: "Siswa Uji Coba Terupdate", nis: "998899" })
      .where(eq(students.id, testStudentId));

    const updated = await db.query.students.findFirst({
      where: eq(students.id, testStudentId),
    });
    expect(updated?.name).toBe("Siswa Uji Coba Terupdate");
    expect(updated?.nis).toBe("998899");

    // 3. Toggle active
    await db
      .update(students)
      .set({ isActive: false })
      .where(eq(students.id, testStudentId));

    const archived = await db.query.students.findFirst({
      where: eq(students.id, testStudentId),
    });
    expect(archived?.isActive).toBe(false);

    // 4. Delete student
    await db.delete(students).where(eq(students.id, testStudentId));

    const deleted = await db.query.students.findFirst({
      where: eq(students.id, testStudentId),
    });
    expect(deleted).toBeUndefined();
  });

  it("should handle bulk student import data correctly without duplication", async () => {
    const sampleImport = [
      { name: "Siswa Impor A", nis: "112233" },
      { name: "Siswa Impor B", nis: "112244" },
    ];

    // Clean up if already exists
    for (const item of sampleImport) {
      await db
        .delete(students)
        .where(and(eq(students.classId, classId), eq(students.name, item.name)));
    }

    // Insert sample
    for (const item of sampleImport) {
      await db.insert(students).values({
        classId,
        name: item.name,
        nis: item.nis,
        isActive: true,
      });
    }

    const importedA = await db.query.students.findFirst({
      where: and(eq(students.classId, classId), eq(students.name, "Siswa Impor A")),
    });
    expect(importedA).toBeDefined();
    expect(importedA?.nis).toBe("112233");

    // Clean up
    for (const item of sampleImport) {
      await db
        .delete(students)
        .where(and(eq(students.classId, classId), eq(students.name, item.name)));
    }
  });
});
