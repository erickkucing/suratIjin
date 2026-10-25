import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { classes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword, createParentToken, PARENT_COOKIE_PREFIX } from "@/lib/auth";

const unlockSchema = z.object({
  classSlug: z.string().min(1, "Slug kelas harus diisi."),
  password: z.string().min(1, "Password akses harus diisi."),
});

const isCookieSecure =
  process.env.COOKIE_SECURE === "true" ||
  process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") === true;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parse = unlockSchema.safeParse(body);

    if (!parse.success) {
      return NextResponse.json(
        { success: false, error: parse.error.issues[0]?.message || "Input tidak valid." },
        { status: 400 }
      );
    }

    const { classSlug, password } = parse.data;

    const cls = await db.query.classes.findFirst({
      where: eq(classes.slug, classSlug),
    });

    if (!cls || !cls.isActive) {
      return NextResponse.json(
        { success: false, error: "Kelas tidak ditemukan atau dinonaktifkan." },
        { status: 404 }
      );
    }

    if (!cls.parentPasswordHash) {
      return NextResponse.json({ success: true, message: "Akses terbuka tanpa password." });
    }

    const isValid = await verifyPassword(password, cls.parentPasswordHash);
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: "Password akses salah. Silakan tanyakan ke Wali Kelas." },
        { status: 401 }
      );
    }

    const token = await createParentToken({
      classSlug: cls.slug,
      classId: cls.id,
    });

    const response = NextResponse.json({ success: true });

    response.cookies.set(`${PARENT_COOKIE_PREFIX}${cls.slug}`, token, {
      httpOnly: true,
      secure: isCookieSecure,
      sameSite: "lax",
      path: "/",
      maxAge: 24 * 60 * 60, // 24 hours
    });

    return response;
  } catch (err) {
    console.error("API parent unlock error:", err);
    return NextResponse.json(
      { success: false, error: "Terjadi kesalahan internal server." },
      { status: 500 }
    );
  }
}
