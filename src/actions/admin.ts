"use server";

import { z } from "zod";
import { db } from "@/db";
import { users, classes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { revalidatePath } from "next/cache";

const createTeacherSchema = z.object({
  username: z.string().min(3, "Username minimal 3 karakter."),
  displayName: z.string().min(2, "Nama lengkap harus diisi."),
  password: z.string().min(6, "Password minimal 6 karakter."),
});

export async function createTeacherAction(inputData: unknown) {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") {
    return { success: false, error: "Hanya Superadmin yang berwenang." };
  }

  const parse = createTeacherSchema.safeParse(inputData);
  if (!parse.success) {
    return {
      success: false,
      error: parse.error.issues[0]?.message || "Input tidak valid.",
    };
  }

  const { username, displayName, password } = parse.data;

  const existing = await db.query.users.findFirst({
    where: eq(users.username, username.trim()),
  });

  if (existing) {
    return { success: false, error: "Username sudah digunakan." };
  }

  const passwordHash = await hashPassword(password);

  await db.insert(users).values({
    username: username.trim(),
    displayName: displayName.trim(),
    passwordHash,
    role: "wali_kelas",
    isActive: true,
  });

  revalidatePath("/admin");
  return { success: true, message: "Akun Wali Kelas berhasil dibuat." };
}

export async function updateTeacherAction(
  userId: number,
  displayName: string,
  newPassword?: string,
  isActive: boolean = true
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") {
    return { success: false, error: "Hanya Superadmin yang berwenang." };
  }

  const target = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!target) {
    return { success: false, error: "User tidak ditemukan." };
  }

  const updateFields: {
    displayName: string;
    isActive: boolean;
    passwordHash?: string;
  } = {
    displayName: displayName.trim(),
    isActive,
  };

  if (newPassword && newPassword.trim().length >= 6) {
    updateFields.passwordHash = await hashPassword(newPassword.trim());
  }

  await db.update(users).set(updateFields).where(eq(users.id, userId));

  revalidatePath("/admin");
  return { success: true, message: "Data Wali Kelas berhasil diperbarui." };
}

const createClassSchema = z.object({
  name: z.string().min(2, "Nama kelas minimal 2 karakter."),
  slug: z.string().min(2, "Slug minimal 2 karakter.").regex(/^[a-z0-9-]+$/, "Slug hanya huruf kecil, angka, dan strip."),
  academicYear: z.string().default("2026/2027"),
  periodTitle: z.string().default("Semester Genap"),
  waliKelasId: z.coerce.number().optional().nullable(),
});

export async function createClassAction(inputData: unknown) {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") {
    return { success: false, error: "Hanya Superadmin yang berwenang." };
  }

  const parse = createClassSchema.safeParse(inputData);
  if (!parse.success) {
    return {
      success: false,
      error: parse.error.issues[0]?.message || "Input tidak valid.",
    };
  }

  const { name, slug, academicYear, periodTitle, waliKelasId } = parse.data;

  const existingSlug = await db.query.classes.findFirst({
    where: eq(classes.slug, slug.trim()),
  });

  if (existingSlug) {
    return { success: false, error: "Slug kelas sudah digunakan." };
  }

  const defaultParentPass = await hashPassword("123456");

  await db.insert(classes).values({
    name: name.trim(),
    slug: slug.trim(),
    academicYear,
    periodTitle,
    waliKelasId: waliKelasId || null,
    parentPasswordHash: defaultParentPass,
    parentShowLetterFile: false,
    isActive: true,
  });

  revalidatePath("/admin");
  return { success: true, message: "Kelas baru berhasil dibuat." };
}

export async function updateClassAction(
  classId: number,
  name: string,
  slug: string,
  academicYear: string,
  periodTitle: string,
  waliKelasId: number | null,
  isActive: boolean
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") {
    return { success: false, error: "Hanya Superadmin yang berwenang." };
  }

  const existing = await db.query.classes.findFirst({
    where: eq(classes.id, classId),
  });

  if (!existing) {
    return { success: false, error: "Kelas tidak ditemukan." };
  }

  await db
    .update(classes)
    .set({
      name: name.trim(),
      slug: slug.trim(),
      academicYear,
      periodTitle,
      waliKelasId: waliKelasId || null,
      isActive,
    })
    .where(eq(classes.id, classId));

  revalidatePath("/admin");
  return { success: true, message: "Data kelas berhasil diperbarui." };
}
