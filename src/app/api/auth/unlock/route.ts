import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { classes } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  verifyPassword,
  createParentToken,
  resolveCookieSecurity,
  PARENT_COOKIE_PREFIX,
} from "@/lib/auth";
import {
  getClientIp,
  checkDualRateLimit,
  recordDualFailedAttempt,
  resetDualRateLimit,
} from "@/lib/rate-limiter";

const unlockSchema = z.object({
  classSlug: z.string().min(1, "Slug kelas harus diisi."),
  password: z.string().min(1, "Password akses harus diisi."),
});

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

    // Dual-bucket rate limiting: IP bucket + Class bucket (SEC-FINDING-02)
    const clientIp = await getClientIp(request);
    const ipKey = `unlock:ip:${clientIp}`;
    const classKey = `unlock:class:${classSlug.toLowerCase().trim()}`;

    const limitCheck = checkDualRateLimit(ipKey, classKey);
    if (limitCheck.isBlocked) {
      return NextResponse.json(
        {
          success: false,
          error: limitCheck.errorMessage,
        },
        {
          status: 429,
          headers: { "Retry-After": String(limitCheck.retryAfterSeconds) },
        }
      );
    }

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
      const failStatus = recordDualFailedAttempt(ipKey, classKey);
      return NextResponse.json(
        {
          success: false,
          error: failStatus.isBlocked
            ? failStatus.errorMessage
            : "Password akses salah. Silakan tanyakan ke Wali Kelas.",
        },
        {
          status: failStatus.isBlocked ? 429 : 401,
          headers: failStatus.isBlocked
            ? { "Retry-After": String(failStatus.retryAfterSeconds) }
            : undefined,
        }
      );
    }

    // Reset rate limit counters upon successful password
    resetDualRateLimit(ipKey, classKey);

    const token = await createParentToken({
      classSlug: cls.slug,
      classId: cls.id,
    });

    const response = NextResponse.json({ success: true });

    const isCookieSecure = resolveCookieSecurity(request);
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
