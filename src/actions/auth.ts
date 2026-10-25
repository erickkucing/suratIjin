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

const isCookieSecure =
  process.env.COOKIE_SECURE === "true" ||
  process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") === true;

export async function loginAction(
  data: FormData | { username?: string; password?: string } | Record<string, unknown>
) {
  try {
    let rawUsername = "";
    let rawPassword = "";

    if (typeof FormData !== "undefined" && data instanceof FormData) {
      rawUsername = String(data.get("username") || "");
      rawPassword = String(data.get("password") || "");
    } else if (data && typeof data === "object") {
      const obj = data as Record<string, unknown>;
      rawUsername = typeof obj.username === "string" ? obj.username : String(obj.username || "");
      rawPassword = typeof obj.password === "string" ? obj.password : String(obj.password || "");
    }

    const parse = loginSchema.safeParse({
      username: rawUsername,
      password: rawPassword,
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
      secure: isCookieSecure,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return {
      success: true,
      role: user.role,
      redirectUrl: user.role === "superadmin" ? "/admin" : "/dashboard",
    };
  } catch (err) {
    console.error("loginAction error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Terjadi kesalahan sistem saat masuk.",
    };
  }
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
    return { success: true };
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
    secure: isCookieSecure,
    sameSite: "lax",
    path: "/",
    maxAge: 24 * 60 * 60, // 24 hours
  });

  return { success: true };
}
