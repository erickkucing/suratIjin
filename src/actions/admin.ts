"use server";

import crypto from "crypto";
import { z } from "zod";
import { db } from "@/db";
import { users, classes } from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { getCurrentUser, hashPassword, SESSION_COOKIE_NAME } from "@/lib/auth";
import { getAutoAcademicPeriod } from "@/lib/academic-year";
import { generateUniqueClassSlug } from "@/lib/class-slug";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

const createTeacherSchema = z.object({
  username: z.string().min(3, "Username minimal 3 karakter."),
  displayName: z.string().min(2, "Nama lengkap harus diisi."),
  password: z.string().min(6, "Password minimal 6 karakter."),
  classId: z.coerce.number().optional().nullable(),
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

  const { username, displayName, password, classId } = parse.data;

  const existing = await db.query.users.findFirst({
    where: eq(users.username, username.trim()),
  });

  if (existing) {
    return { success: false, error: "Username sudah digunakan." };
  }

  const passwordHash = await hashPassword(password);

  const [res] = await db.insert(users).values({
    username: username.trim(),
    displayName: displayName.trim(),
    passwordHash,
    role: "wali_kelas",
    isActive: true,
  });

  const newTeacherId = res.insertId;

  if (classId) {
    await db
      .update(classes)
      .set({ waliKelasId: newTeacherId })
      .where(eq(classes.id, classId));
  }

  revalidatePath("/admin");
  return { success: true, message: "Akun Wali Kelas berhasil dibuat." };
}

export async function updateTeacherAction(
  userId: number,
  displayName: string,
  newPassword?: string,
  isActive: boolean = true,
  classId?: number | null
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

  if (classId !== undefined) {
    // Unassign old class if any
    await db
      .update(classes)
      .set({ waliKelasId: null })
      .where(eq(classes.waliKelasId, userId));

    // Assign new class
    if (classId) {
      await db
        .update(classes)
        .set({ waliKelasId: userId })
        .where(eq(classes.id, classId));
    }
  }

  revalidatePath("/admin");
  return { success: true, message: "Data Wali Kelas berhasil diperbarui." };
}

const createClassSchema = z.object({
  name: z.string().min(2, "Nama kelas minimal 2 karakter."),
  slug: z
    .string()
    .optional()
    .refine(
      (val) => !val || /^[a-zA-Z0-9_-]{3,50}$/.test(val),
      "Slug hanya huruf, angka, strip, atau garis bawah (minimal 3 karakter)."
    ),
  parentPin: z
    .string()
    .regex(/^\d{4,6}$/, "PIN harus 4-6 angka.")
    .optional()
    .or(z.literal("")),
  academicYear: z.string().default(() => getAutoAcademicPeriod().academicYear),
  periodTitle: z.string().default(() => getAutoAcademicPeriod().periodTitle),
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

  const { name, slug, parentPin, academicYear, periodTitle, waliKelasId } = parse.data;

  // If slug is provided, check uniqueness; otherwise generate unique 3-char random slug
  const finalSlug = slug && slug.trim().length > 0 ? slug.trim() : await generateUniqueClassSlug();

  const existingSlug = await db.query.classes.findFirst({
    where: eq(classes.slug, finalSlug),
  });

  if (existingSlug) {
    return { success: false, error: "Slug kelas sudah digunakan." };
  }

  // Generate secure random 6-digit PIN if not explicitly provided (SEC-FINDING-05)
  const initialPin =
    parentPin && parentPin.trim().length > 0
      ? parentPin.trim()
      : crypto.randomInt(100000, 999999).toString();
  const defaultParentPass = await hashPassword(initialPin);

  await db.insert(classes).values({
    name: name.trim(),
    slug: finalSlug,
    academicYear,
    periodTitle,
    waliKelasId: waliKelasId || null,
    parentPasswordHash: defaultParentPass,
    parentShowLetterFile: false,
    isActive: true,
  });

  revalidatePath("/admin");
  return {
    success: true,
    message: `Kelas baru berhasil dibuat. PIN portal orang tua: ${initialPin}`,
    initialPin,
  };
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

  const duplicateSlug = await db.query.classes.findFirst({
    where: and(eq(classes.slug, slug.trim()), ne(classes.id, classId)),
  });

  if (duplicateSlug) {
    return { success: false, error: "Slug kelas sudah digunakan oleh kelas lain." };
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
  revalidatePath("/dashboard");
  revalidatePath(`/portal/${existing.slug}`);
  revalidatePath(`/portal/${slug.trim()}`);
  return { success: true, message: "Data kelas berhasil diperbarui." };
}

const adminSelfPasswordSchema = z
  .object({
    newPassword: z.string().min(6, "Password baru minimal 6 karakter."),
    confirmPassword: z.string().min(6, "Konfirmasi password minimal 6 karakter."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Konfirmasi kata sandi tidak cocok.",
    path: ["confirmPassword"],
  });

export async function updateAdminSelfPasswordAction(inputData: unknown) {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") {
    return { success: false, error: "Hanya Superadmin yang berwenang." };
  }

  const parse = adminSelfPasswordSchema.safeParse(inputData);
  if (!parse.success) {
    return {
      success: false,
      error: parse.error.issues[0]?.message || "Input tidak valid.",
    };
  }

  const { newPassword } = parse.data;
  const passwordHash = await hashPassword(newPassword.trim());

  await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, user.id));

  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);

  revalidatePath("/admin");
  revalidatePath("/login");

  return {
    success: true,
    message: "Kata sandi admin berhasil diperbarui. Silakan login kembali.",
    redirectUrl: "/login",
  };
}
