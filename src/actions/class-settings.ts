"use server";

import { z } from "zod";
import { db } from "@/db";
import { classes, students } from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { generateUniqueClassSlug } from "@/lib/class-slug";
import { revalidatePath } from "next/cache";

const updateParentAccessSchema = z.object({
  classId: z.coerce.number().positive(),
  name: z.string().min(1, "Nama kelas harus diisi.").optional(),
  requirePassword: z.boolean().optional(),
  newPassword: z.string().optional().or(z.literal("")),
  parentShowLetterFile: z.boolean(),
  periodTitle: z.string().min(1, "Judul periode harus diisi."),
  academicYear: z.string().min(1, "Tahun ajaran harus diisi."),
});

export async function updateParentAccessAction(inputData: unknown) {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Sesi telah berakhir. Silakan login kembali." };
  }

  const parse = updateParentAccessSchema.safeParse(inputData);
  if (!parse.success) {
    return {
      success: false,
      error: parse.error.issues[0]?.message || "Input tidak valid.",
    };
  }

  const { classId, name, requirePassword, newPassword, parentShowLetterFile, periodTitle, academicYear } = parse.data;

  const cls = await db.query.classes.findFirst({
    where: eq(classes.id, classId),
  });

  if (!cls) {
    return { success: false, error: "Kelas tidak ditemukan." };
  }

  if (user.role !== "superadmin" && cls.waliKelasId !== user.id) {
    return { success: false, error: "Anda tidak memiliki izin mengedit pengaturan kelas ini." };
  }

  const updateFields: {
    name?: string;
    parentShowLetterFile: boolean;
    periodTitle: string;
    academicYear: string;
    parentPasswordHash?: string | null;
  } = {
    parentShowLetterFile,
    periodTitle,
    academicYear,
  };

  if (name && name.trim().length > 0) {
    updateFields.name = name.trim();
  }

  if (requirePassword === false) {
    updateFields.parentPasswordHash = null;
  } else if (newPassword && newPassword.trim().length > 0) {
    updateFields.parentPasswordHash = await hashPassword(newPassword.trim());
  } else if (requirePassword === true && !cls.parentPasswordHash) {
    return {
      success: false,
      error: "Silakan masukkan kata sandi baru untuk proteksi akses wali murid.",
    };
  }

  await db.update(classes).set(updateFields).where(eq(classes.id, classId));

  revalidatePath("/dashboard");
  revalidatePath(`/portal/${cls.slug}`);

  return { success: true, message: "Pengaturan berhasil disimpan." };
}

export async function addStudentAction(classId: number, name: string, nis?: string) {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Sesi telah berakhir. Silakan login kembali." };
  }

  if (!name || name.trim().length === 0) {
    return { success: false, error: "Nama siswa tidak boleh kosong." };
  }

  const cls = await db.query.classes.findFirst({
    where: eq(classes.id, classId),
  });

  if (!cls) {
    return { success: false, error: "Kelas tidak ditemukan." };
  }

  if (user.role !== "superadmin" && cls.waliKelasId !== user.id) {
    return { success: false, error: "Anda tidak memiliki izin untuk kelas ini." };
  }

  const cleanNis = nis?.trim() || null;
  if (cleanNis) {
    const existingNis = await db.query.students.findFirst({
      where: and(eq(students.classId, classId), eq(students.nis, cleanNis)),
    });
    if (existingNis) {
      return { success: false, error: "NIS sudah digunakan oleh siswa lain di kelas ini." };
    }
  }

  await db.insert(students).values({
    classId,
    name: name.trim(),
    nis: cleanNis,
    isActive: true,
  });

  revalidatePath("/dashboard");
  return { success: true, message: "Siswa berhasil ditambahkan." };
}

export async function updateStudentAction(studentId: number, name: string, nis?: string) {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Sesi telah berakhir." };
  }

  const st = await db.query.students.findFirst({
    where: eq(students.id, studentId),
  });

  if (!st) {
    return { success: false, error: "Siswa tidak ditemukan." };
  }

  const targetClass = await db.query.classes.findFirst({
    where: eq(classes.id, st.classId),
  });

  if (!targetClass) {
    return { success: false, error: "Kelas tidak ditemukan." };
  }

  if (user.role !== "superadmin" && targetClass.waliKelasId !== user.id) {
    return { success: false, error: "Akses ditolak." };
  }

  const cleanNis = nis?.trim() || null;
  if (cleanNis) {
    const existingNis = await db.query.students.findFirst({
      where: and(
        eq(students.classId, st.classId),
        eq(students.nis, cleanNis),
        ne(students.id, studentId)
      ),
    });
    if (existingNis) {
      return { success: false, error: "NIS sudah digunakan oleh siswa lain di kelas ini." };
    }
  }

  await db
    .update(students)
    .set({
      name: name.trim(),
      nis: cleanNis,
    })
    .where(eq(students.id, studentId));

  revalidatePath("/dashboard");
  return { success: true, message: "Data siswa berhasil diperbarui." };
}

export async function toggleStudentActiveAction(studentId: number, isActive: boolean) {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Sesi telah berakhir." };
  }

  const st = await db.query.students.findFirst({
    where: eq(students.id, studentId),
  });

  if (!st) {
    return { success: false, error: "Siswa tidak ditemukan." };
  }

  const targetClass = await db.query.classes.findFirst({
    where: eq(classes.id, st.classId),
  });

  if (!targetClass) {
    return { success: false, error: "Kelas tidak ditemukan." };
  }

  if (user.role !== "superadmin" && targetClass.waliKelasId !== user.id) {
    return { success: false, error: "Akses ditolak." };
  }

  await db
    .update(students)
    .set({ isActive })
    .where(eq(students.id, studentId));

  revalidatePath("/dashboard");
  return { success: true, message: isActive ? "Siswa diaktifkan." : "Siswa diarsipkan." };
}

export async function bulkAddStudentsAction(classId: number, names: string[]) {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Sesi telah berakhir." };
  }

  const cls = await db.query.classes.findFirst({
    where: eq(classes.id, classId),
  });

  if (!cls) {
    return { success: false, error: "Kelas tidak ditemukan." };
  }

  if (user.role !== "superadmin" && cls.waliKelasId !== user.id) {
    return { success: false, error: "Akses ditolak." };
  }

  const existingList = await db
    .select({ name: students.name })
    .from(students)
    .where(eq(students.classId, classId));

  const existingNames = new Set(existingList.map((s) => s.name.trim().toLowerCase()));
  const newRows: { classId: number; name: string; isActive: boolean }[] = [];

  for (const raw of names) {
    const trimmed = raw.trim();
    const key = trimmed.toLowerCase();
    if (trimmed.length > 0 && !existingNames.has(key)) {
      existingNames.add(key);
      newRows.push({
        classId,
        name: trimmed,
        isActive: true,
      });
    }
  }

  if (newRows.length > 0) {
    await db.insert(students).values(newRows);
  }

  revalidatePath("/dashboard");
  revalidatePath(`/portal/${cls.slug}`);
  return { success: true, message: `Berhasil menambahkan ${newRows.length} siswa baru.` };
}

export async function deleteStudentAction(studentId: number) {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Sesi telah berakhir." };
  }

  const st = await db.query.students.findFirst({
    where: eq(students.id, studentId),
  });

  if (!st) {
    return { success: false, error: "Siswa tidak ditemukan." };
  }

  const targetClass = await db.query.classes.findFirst({
    where: eq(classes.id, st.classId),
  });

  if (!targetClass) {
    return { success: false, error: "Kelas tidak ditemukan." };
  }

  if (user.role !== "superadmin" && targetClass.waliKelasId !== user.id) {
    return { success: false, error: "Akses ditolak." };
  }

  await db.delete(students).where(eq(students.id, studentId));

  revalidatePath("/dashboard");
  revalidatePath(`/portal/${targetClass.slug}`);
  return { success: true, message: `Siswa "${st.name}" berhasil dihapus.` };
}

export async function bulkImportStudentsAction(
  classId: number,
  items: { name: string; nis?: string }[]
) {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Sesi telah berakhir." };
  }

  const cls = await db.query.classes.findFirst({
    where: eq(classes.id, classId),
  });

  if (!cls) {
    return { success: false, error: "Kelas tidak ditemukan." };
  }

  if (user.role !== "superadmin" && cls.waliKelasId !== user.id) {
    return { success: false, error: "Akses ditolak." };
  }

  const existingList = await db
    .select({ id: students.id, name: students.name, nis: students.nis })
    .from(students)
    .where(eq(students.classId, classId));

  const existingMap = new Map(
    existingList.map((s) => [s.name.trim().toLowerCase(), s])
  );

  const newRows: { classId: number; name: string; nis: string | null; isActive: boolean }[] = [];
  const nisUpdates: Promise<unknown>[] = [];

  for (const item of items) {
    const trimmedName = item.name.trim();
    const trimmedNis = item.nis ? item.nis.trim() : null;
    if (trimmedName.length === 0) continue;

    const key = trimmedName.toLowerCase();
    const existing = existingMap.get(key);
    if (!existing) {
      existingMap.set(key, { id: -1, name: trimmedName, nis: trimmedNis });
      newRows.push({
        classId,
        name: trimmedName,
        nis: trimmedNis || null,
        isActive: true,
      });
    } else if (existing.id > 0 && trimmedNis && !existing.nis) {
      existing.nis = trimmedNis;
      nisUpdates.push(
        db
          .update(students)
          .set({ nis: trimmedNis })
          .where(eq(students.id, existing.id))
      );
    }
  }

  if (newRows.length > 0) {
    await db.insert(students).values(newRows);
  }
  if (nisUpdates.length > 0) {
    await Promise.all(nisUpdates);
  }

  revalidatePath("/dashboard");
  revalidatePath(`/portal/${cls.slug}`);
  return { success: true, message: `Berhasil mengimpor ${newRows.length} siswa baru.` };
}

export async function regenerateClassSlugAction(classId: number) {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Sesi telah berakhir. Silakan login kembali." };
  }

  const cls = await db.query.classes.findFirst({
    where: eq(classes.id, classId),
  });

  if (!cls) {
    return { success: false, error: "Kelas tidak ditemukan." };
  }

  if (user.role !== "superadmin" && cls.waliKelasId !== user.id) {
    return { success: false, error: "Anda tidak memiliki izin mengedit tautan kelas ini." };
  }

  const oldSlug = cls.slug;
  const newSlug = await generateUniqueClassSlug();

  await db.update(classes).set({ slug: newSlug }).where(eq(classes.id, classId));

  revalidatePath("/dashboard");
  revalidatePath("/admin");
  revalidatePath(`/portal/${oldSlug}`);
  revalidatePath(`/portal/${newSlug}`);

  return {
    success: true,
    newSlug,
    message: `Tautan portal berhasil diubah menjadi /portal/${newSlug}`,
  };
}

export async function deleteAllStudentsAction(classId: number) {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Sesi telah berakhir. Silakan login kembali." };
  }

  const cls = await db.query.classes.findFirst({
    where: eq(classes.id, classId),
  });

  if (!cls) {
    return { success: false, error: "Kelas tidak ditemukan." };
  }

  if (user.role !== "superadmin" && cls.waliKelasId !== user.id) {
    return { success: false, error: "Akses ditolak. Anda tidak memiliki izin untuk mengosongkan siswa kelas ini." };
  }

  const existing = await db
    .select({ id: students.id })
    .from(students)
    .where(eq(students.classId, classId));

  const totalCount = existing.length;
  if (totalCount === 0) {
    return { success: false, error: "Tidak ada data siswa yang dapat dihapus di kelas ini." };
  }

  await db.delete(students).where(eq(students.classId, classId));

  revalidatePath("/dashboard");
  revalidatePath("/admin");
  revalidatePath(`/portal/${cls.slug}`);

  return {
    success: true,
    deletedCount: totalCount,
    message: `Berhasil menghapus seluruh data (${totalCount} siswa) kelas ${cls.name}.`,
  };
}


