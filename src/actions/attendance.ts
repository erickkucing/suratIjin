"use server";

import { z } from "zod";
import { db } from "@/db";
import { attendanceRecords, classes, students } from "@/db/schema";
import { eq, and, ne, sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import path from "path";
import fs from "fs";

import { generateDateRange } from "@/lib/date-utils";

/**
 * Helper to safely delete an unused letter file from disk
 * with path traversal containment checks.
 */
async function safeDeleteUnusedLetter(filePath: string | null | undefined) {
  if (!filePath || filePath.startsWith("legacy/")) return;

  const otherReference = await db.query.attendanceRecords.findFirst({
    where: eq(attendanceRecords.letterFilePath, filePath),
  });

  if (!otherReference) {
    const storageBase = path.resolve(process.env.STORAGE_PATH || "./storage/uploads");
    const fullPath = path.resolve(storageBase, filePath);
    const rel = path.relative(storageBase, fullPath);

    if (!rel.startsWith("..") && !path.isAbsolute(rel) && fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
      } catch (e) {
        console.warn("Failed to delete unused letter file:", e);
      }
    }
  }
}

const createAttendanceSchema = z.object({
  classId: z.coerce.number().positive(),
  studentId: z.coerce.number().positive(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal mulai tidak valid."),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal selesai tidak valid.").optional().or(z.literal("")),
  status: z.enum(["Izin", "Sakit", "Alpa"]),
  infoSource: z.string().min(1, "Sumber info harus diisi."),
  description: z.string().default(""),
  letterFilePath: z.string().nullable().optional(),
  letterMimeType: z.string().nullable().optional(),
  letterStatus: z.enum(["Sudah", "Belum"]).default("Belum"),
});

export async function createAttendanceAction(inputData: unknown) {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Sesi telah berakhir. Silakan login kembali." };
  }

  const parse = createAttendanceSchema.safeParse(inputData);
  if (!parse.success) {
    return {
      success: false,
      error: parse.error.issues[0]?.message || "Input tidak valid.",
    };
  }

  const {
    classId,
    studentId,
    startDate,
    endDate,
    status,
    infoSource,
    description,
    letterFilePath,
    letterMimeType,
    letterStatus,
  } = parse.data;

  // Verify class permission
  const cls = await db.query.classes.findFirst({
    where: eq(classes.id, classId),
  });

  if (!cls) {
    return { success: false, error: "Kelas tidak ditemukan." };
  }

  if (user.role !== "superadmin" && cls.waliKelasId !== user.id) {
    return { success: false, error: "Anda tidak memiliki izin mencatat untuk kelas ini." };
  }

  // Verify student belongs to class
  const st = await db.query.students.findFirst({
    where: and(eq(students.id, studentId), eq(students.classId, classId)),
  });

  if (!st) {
    return { success: false, error: "Siswa tidak ditemukan dalam kelas ini." };
  }

  // Rule: If Alpa, letter is always Belum and file is null
  const finalStatus = status;
  let finalLetterStatus = letterStatus;
  let finalFilePath = letterFilePath || null;
  let finalMimeType = letterMimeType || null;

  if (finalStatus === "Alpa") {
    finalLetterStatus = "Belum";
    finalFilePath = null;
    finalMimeType = null;
  } else if (!finalFilePath) {
    finalLetterStatus = "Belum";
  }

  const datesToInsert = generateDateRange(startDate, endDate || undefined);

  let insertedCount = 0;
  for (const dateStr of datesToInsert) {
    // Check if record already exists for this student on this date
    const existing = await db.query.attendanceRecords.findFirst({
      where: and(
        eq(attendanceRecords.classId, classId),
        eq(attendanceRecords.studentId, studentId),
        eq(attendanceRecords.attendanceDate, dateStr)
      ),
    });

    if (existing) {
      const oldPath = existing.letterFilePath;
      // Update existing record
      await db
        .update(attendanceRecords)
        .set({
          status: finalStatus,
          infoSource,
          description,
          letterFilePath: finalFilePath,
          letterMimeType: finalMimeType,
          letterStatus: finalLetterStatus,
          updatedAt: new Date(),
        })
        .where(eq(attendanceRecords.id, existing.id));

      if (oldPath && oldPath !== finalFilePath) {
        await safeDeleteUnusedLetter(oldPath);
      }
    } else {
      await db.insert(attendanceRecords).values({
        classId,
        studentId,
        attendanceDate: dateStr,
        status: finalStatus,
        infoSource,
        description,
        letterFilePath: finalFilePath,
        letterMimeType: finalMimeType,
        letterStatus: finalLetterStatus,
        createdById: user.id,
      });
    }
    insertedCount++;
  }

  revalidatePath("/dashboard");
  revalidatePath(`/portal/${cls.slug}`);

  return {
    success: true,
    message: `Berhasil mencatat ketidakhadiran (${insertedCount} hari).`,
  };
}

const updateAttendanceSchema = z.object({
  recordId: z.coerce.number().positive(),
  studentId: z.coerce.number().positive(),
  attendanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal tidak valid."),
  status: z.enum(["Izin", "Sakit", "Alpa"]),
  infoSource: z.string().min(1, "Sumber info harus diisi."),
  description: z.string().default(""),
  letterFilePath: z.string().nullable().optional(),
  letterMimeType: z.string().nullable().optional(),
  letterStatus: z.enum(["Sudah", "Belum"]),
});

export async function updateAttendanceAction(inputData: unknown) {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Sesi telah berakhir. Silakan login kembali." };
  }

  const parse = updateAttendanceSchema.safeParse(inputData);
  if (!parse.success) {
    return {
      success: false,
      error: parse.error.issues[0]?.message || "Input tidak valid.",
    };
  }

  const {
    recordId,
    studentId,
    attendanceDate,
    status,
    infoSource,
    description,
    letterFilePath,
    letterMimeType,
    letterStatus,
  } = parse.data;

  const record = await db.query.attendanceRecords.findFirst({
    where: eq(attendanceRecords.id, recordId),
  });

  if (!record) {
    return { success: false, error: "Data ketidakhadiran tidak ditemukan." };
  }

  const targetClass = await db.query.classes.findFirst({
    where: eq(classes.id, record.classId),
  });

  if (!targetClass) {
    return { success: false, error: "Kelas tidak ditemukan." };
  }

  if (user.role !== "superadmin" && targetClass.waliKelasId !== user.id) {
    return { success: false, error: "Anda tidak memiliki izin mengedit data ini." };
  }

  // Verify student belongs to this record's class
  const student = await db.query.students.findFirst({
    where: and(eq(students.id, studentId), eq(students.classId, record.classId)),
  });

  if (!student) {
    return { success: false, error: "Siswa tidak ditemukan dalam kelas ini." };
  }

  // Prevent duplicate records for the same student on the same date
  const duplicate = await db.query.attendanceRecords.findFirst({
    where: and(
      eq(attendanceRecords.classId, record.classId),
      eq(attendanceRecords.studentId, studentId),
      eq(attendanceRecords.attendanceDate, attendanceDate),
      ne(attendanceRecords.id, recordId)
    ),
  });

  if (duplicate) {
    return {
      success: false,
      error: "Catatan ketidakhadiran untuk siswa ini pada tanggal tersebut sudah ada.",
    };
  }

  let finalLetterStatus = letterStatus;
  let finalFilePath = letterFilePath;
  let finalMimeType = letterMimeType;

  if (status === "Alpa") {
    finalLetterStatus = "Belum";
    finalFilePath = null;
    finalMimeType = null;
  } else if (!finalFilePath) {
    finalLetterStatus = "Belum";
  }

  const oldFilePath = record.letterFilePath;

  await db
    .update(attendanceRecords)
    .set({
      studentId,
      attendanceDate,
      status,
      infoSource,
      description,
      letterFilePath: finalFilePath,
      letterMimeType: finalMimeType,
      letterStatus: finalLetterStatus,
      updatedAt: new Date(),
    })
    .where(eq(attendanceRecords.id, recordId));

  // If file changed or was removed, clean up old file if not referenced elsewhere
  if (oldFilePath && oldFilePath !== finalFilePath) {
    await safeDeleteUnusedLetter(oldFilePath);
  }

  revalidatePath("/dashboard");
  revalidatePath(`/portal/${targetClass.slug}`);

  return { success: true, message: "Data berhasil diperbarui." };
}

export async function deleteAttendanceAction(recordId: number) {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Sesi telah berakhir. Silakan login kembali." };
  }

  const record = await db.query.attendanceRecords.findFirst({
    where: eq(attendanceRecords.id, recordId),
  });

  if (!record) {
    return { success: false, error: "Data tidak ditemukan." };
  }

  const targetClass = await db.query.classes.findFirst({
    where: eq(classes.id, record.classId),
  });

  if (!targetClass) {
    return { success: false, error: "Kelas tidak ditemukan." };
  }

  if (user.role !== "superadmin" && targetClass.waliKelasId !== user.id) {
    return { success: false, error: "Anda tidak memiliki izin menghapus data ini." };
  }

  const oldFilePath = record.letterFilePath;

  await db.delete(attendanceRecords).where(eq(attendanceRecords.id, recordId));

  // If there was a file, check if any other record is referencing it before removing
  if (oldFilePath) {
    await safeDeleteUnusedLetter(oldFilePath);
  }

  revalidatePath("/dashboard");
  revalidatePath(`/portal/${targetClass.slug}`);

  return { success: true, message: "Data ketidakhadiran berhasil dihapus." };
}
