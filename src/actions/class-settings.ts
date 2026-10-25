"use server";

import { z } from "zod";
import { db } from "@/db";
import { classes, students } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { revalidatePath } from "next/cache";

const updateParentAccessSchema = z.object({
  classId: z.coerce.number().positive(),
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

  const { classId, newPassword, parentShowLetterFile, periodTitle, academicYear } = parse.data;

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
    parentShowLetterFile: boolean;
    periodTitle: string;
    academicYear: string;
    parentPasswordHash?: string;
  } = {
    parentShowLetterFile,
    periodTitle,
    academicYear,
  };

  if (newPassword && newPassword.trim().length > 0) {
    updateFields.parentPasswordHash = await hashPassword(newPassword.trim());
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

  await db.insert(students).values({
    classId,
    name: name.trim(),
    nis: nis?.trim() || null,
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
    with: { class: true },
  });

  if (!st || !st.class) {
    return { success: false, error: "Siswa tidak ditemukan." };
  }

  if (user.role !== "superadmin" && st.class.waliKelasId !== user.id) {
    return { success: false, error: "Akses ditolak." };
  }

  await db
    .update(students)
    .set({
      name: name.trim(),
      nis: nis?.trim() || null,
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
    with: { class: true },
  });

  if (!st || !st.class) {
    return { success: false, error: "Siswa tidak ditemukan." };
  }

  if (user.role !== "superadmin" && st.class.waliKelasId !== user.id) {
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

  let count = 0;
  for (const raw of names) {
    const trimmed = raw.trim();
    if (trimmed.length > 0) {
      const existing = await db.query.students.findFirst({
        where: and(eq(students.classId, classId), eq(students.name, trimmed)),
      });
      if (!existing) {
        await db.insert(students).values({
          classId,
          name: trimmed,
          isActive: true,
        });
        count++;
      }
    }
  }

  revalidatePath("/dashboard");
  return { success: true, message: `Berhasil menambahkan ${count} siswa baru.` };
}

export async function deleteStudentAction(studentId: number) {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Sesi telah berakhir." };
  }

  const st = await db.query.students.findFirst({
    where: eq(students.id, studentId),
    with: { class: true },
  });

  if (!st || !st.class) {
    return { success: false, error: "Siswa tidak ditemukan." };
  }

  if (user.role !== "superadmin" && st.class.waliKelasId !== user.id) {
    return { success: false, error: "Akses ditolak." };
  }

  await db.delete(students).where(eq(students.id, studentId));

  revalidatePath("/dashboard");
  revalidatePath(`/portal/${st.class.slug}`);
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

  let count = 0;
  for (const item of items) {
    const trimmedName = item.name.trim();
    const trimmedNis = item.nis ? item.nis.trim() : null;
    if (trimmedName.length > 0) {
      const existing = await db.query.students.findFirst({
        where: and(eq(students.classId, classId), eq(students.name, trimmedName)),
      });
      if (!existing) {
        await db.insert(students).values({
          classId,
          name: trimmedName,
          nis: trimmedNis || null,
          isActive: true,
        });
        count++;
      } else if (trimmedNis && !existing.nis) {
        await db
          .update(students)
          .set({ nis: trimmedNis })
          .where(eq(students.id, existing.id));
      }
    }
  }

  revalidatePath("/dashboard");
  revalidatePath(`/portal/${cls.slug}`);
  return { success: true, message: `Berhasil mengimpor ${count} siswa baru.` };
}

