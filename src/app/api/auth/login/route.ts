import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword, createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

const loginSchema = z.object({
  username: z.string().min(1, "Username harus diisi."),
  password: z.string().min(1, "Password harus diisi."),
});

const isCookieSecure =
  process.env.COOKIE_SECURE === "true" ||
  process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") === true;

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

    const user = await db.query.users.findFirst({
      where: eq(users.username, username.trim()),
    });

    if (!user || !user.isActive) {
      return NextResponse.json(
        {
          success: false,
          error: "Username atau password salah.",
        },
        { status: 401 }
      );
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        {
          success: false,
          error: "Username atau password salah.",
        },
        { status: 401 }
      );
    }

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
