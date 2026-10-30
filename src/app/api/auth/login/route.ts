import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  verifyPassword,
  createSessionToken,
  resolveCookieSecurity,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import {
  getClientIp,
  checkDualRateLimit,
  recordDualFailedAttempt,
  resetDualRateLimit,
} from "@/lib/rate-limiter";

const loginSchema = z.object({
  username: z.string().min(1, "Username harus diisi."),
  password: z.string().min(1, "Password harus diisi."),
});

export async function POST(request: Request) {
  try {
    let rawUsername = "";
    let rawPassword = "";

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({}));
      rawUsername = typeof body.username === "string" ? body.username : "";
      rawPassword = typeof body.password === "string" ? body.password : "";
    } else if (contentType.includes("form")) {
      const formData = await request.formData();
      rawUsername = String(formData.get("username") || "");
      rawPassword = String(formData.get("password") || "");
    } else {
      const body = await request.json().catch(() => ({}));
      rawUsername = typeof body?.username === "string" ? body.username : "";
      rawPassword = typeof body?.password === "string" ? body.password : "";
    }

    const parse = loginSchema.safeParse({
      username: rawUsername,
      password: rawPassword,
    });

    if (!parse.success) {
      return NextResponse.json(
        {
          success: false,
          error: parse.error.issues[0]?.message || "Input tidak valid.",
        },
        { status: 400 }
      );
    }

    const { username, password } = parse.data;

    // Dual-bucket rate limiting: IP bucket + Account bucket (SEC-FINDING-02)
    const clientIp = await getClientIp(request);
    const ipKey = `login:ip:${clientIp}`;
    const accountKey = `login:account:${username.toLowerCase().trim()}`;

    const limitCheck = checkDualRateLimit(ipKey, accountKey);
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

    const user = await db.query.users.findFirst({
      where: eq(users.username, username.trim()),
    });

    if (!user || !user.isActive) {
      const failStatus = recordDualFailedAttempt(ipKey, accountKey);
      return NextResponse.json(
        {
          success: false,
          error: failStatus.isBlocked
            ? failStatus.errorMessage
            : "Username atau password salah.",
        },
        {
          status: failStatus.isBlocked ? 429 : 401,
          headers: failStatus.isBlocked
            ? { "Retry-After": String(failStatus.retryAfterSeconds) }
            : undefined,
        }
      );
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      const failStatus = recordDualFailedAttempt(ipKey, accountKey);
      return NextResponse.json(
        {
          success: false,
          error: failStatus.isBlocked
            ? failStatus.errorMessage
            : "Username atau password salah.",
        },
        {
          status: failStatus.isBlocked ? 429 : 401,
          headers: failStatus.isBlocked
            ? { "Retry-After": String(failStatus.retryAfterSeconds) }
            : undefined,
        }
      );
    }

    // Reset rate limit counters upon successful credentials
    resetDualRateLimit(ipKey, accountKey);

    const token = await createSessionToken({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    });

    const redirectUrl = user.role === "superadmin" ? "/admin" : "/dashboard";

    const response = NextResponse.json({
      success: true,
      role: user.role,
      redirectUrl,
    });

    const isCookieSecure = resolveCookieSecurity(request);
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isCookieSecure,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (err) {
    console.error("API login error:", err);
    return NextResponse.json(
      {
        success: false,
        error: "Terjadi kesalahan internal server saat masuk.",
      },
      { status: 500 }
    );
  }
}
