"use server";

import { z } from "zod";
import { db } from "@/db";
import { users, classes } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  verifyPassword,
  createSessionToken,
  createParentToken,
  SESSION_COOKIE_NAME,
  PARENT_COOKIE_PREFIX,
} from "@/lib/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const loginSchema = z.object({
  username: z.string().min(1, "Username harus diisi."),
  password: z.string().min(1, "Password harus diisi."),
});

export async function loginAction(formData: FormData) {
  const parse = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });

  if (!parse.success) {
    return {
      success: false,
      error: parse.error.issues[0]?.message || "Input tidak valid.",
    };
  }

  const { username, password } = parse.data;

  const user = await db.query.users.findFirst({
    where: eq(users.username, username.trim()),
  });

  if (!user || !user.isActive) {
    return {
      success: false,
      error: "Username atau password salah.",
    };
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    return {
      success: false,
      error: "Username atau password salah.",
    };
  }

  const token = await createSessionToken({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });

  return {
    success: true,
    role: user.role,
    redirectUrl: user.role === "superadmin" ? "/admin" : "/dashboard",
  };
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}

export async function parentUnlockAction(classSlug: string, passwordPlain: string) {
  if (!classSlug || !passwordPlain) {
    return { success: false, error: "Password akses harus diisi." };
  }

  const cls = await db.query.classes.findFirst({
    where: eq(classes.slug, classSlug),
  });

  if (!cls || !cls.isActive) {
    return { success: false, error: "Kelas tidak ditemukan atau dinonaktifkan." };
  }

  if (!cls.parentPasswordHash) {
    return {
      success: false,
      error: "Wali Kelas belum mengatur password akses untuk portal ini.",
    };
  }

  const isValid = await verifyPassword(passwordPlain, cls.parentPasswordHash);
  if (!isValid) {
    return { success: false, error: "Password akses salah. Silakan tanyakan ke Wali Kelas." };
  }

  const token = await createParentToken({
    classSlug: cls.slug,
    classId: cls.id,
  });

  const cookieStore = await cookies();
  cookieStore.set(`${PARENT_COOKIE_PREFIX}${cls.slug}`, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 24 * 60 * 60, // 24 hours
  });

  return { success: true };
}
