import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "@/db";
import { users, classes } from "@/db/schema";
import { eq } from "drizzle-orm";

const DEFAULT_FALLBACK_SECRET = "surat_ijin_super_secret_jwt_key_2026_modern_academic_system";

if (
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PHASE !== "phase-production-build"
) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === DEFAULT_FALLBACK_SECRET) {
    throw new Error(
      "SECURITY ERROR: In production, a unique and random JWT_SECRET must be configured in environment variables."
    );
  }
}

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || DEFAULT_FALLBACK_SECRET
);

export const SESSION_COOKIE_NAME = "surat_session";
export const PARENT_COOKIE_PREFIX = "parent_access_";

/**
 * Dynamically resolves whether cookies should be flagged with the Secure attribute.
 *
 * Priority order:
 * 1. Checks incoming Request or Headers for `x-forwarded-proto === "https"` (Cloudflare Tunnel / Reverse Proxy)
 * 2. Checks static `process.env.COOKIE_SECURE === "true"`
 * 3. Checks `process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://")`
 * 4. Defaults to `true` in production (`process.env.NODE_ENV === "production"`)
 */
export function resolveCookieSecurity(
  requestOrHeaders?: Headers | Request | { get: (name: string) => string | null } | null
): boolean {
  if (requestOrHeaders) {
    let headerObj: { get: (name: string) => string | null } | null = null;

    if (typeof Request !== "undefined" && requestOrHeaders instanceof Request) {
      headerObj = requestOrHeaders.headers;
    } else if (
      requestOrHeaders &&
      typeof (requestOrHeaders as { get?: unknown }).get === "function"
    ) {
      headerObj = requestOrHeaders as { get: (name: string) => string | null };
    }

    if (headerObj) {
      const proto = headerObj.get("x-forwarded-proto");
      if (proto) {
        const primaryProto = proto.split(",")[0].trim().toLowerCase();
        if (primaryProto === "https") {
          return true;
        }
      }
    }
  }

  if (process.env.COOKIE_SECURE === "true") {
    return true;
  }

  if (process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") === true) {
    return true;
  }

  return process.env.NODE_ENV === "production";
}

export interface UserSessionPayload {
  id: number;
  username: string;
  displayName: string;
  role: "superadmin" | "wali_kelas";
}

export interface ParentSessionPayload {
  classSlug: string;
  classId: number;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hashed);
  } catch (err) {
    console.error("Password comparison error:", err);
    return false;
  }
}

export async function createSessionToken(payload: UserSessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

export async function verifySessionToken(token: string): Promise<UserSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userPayload = payload as unknown as UserSessionPayload;
    if (!userPayload || !userPayload.id) return null;

    // Real-time revocation check: ensure user exists and remains active in database
    const activeUser = await db.query.users.findFirst({
      where: eq(users.id, userPayload.id),
      columns: { id: true, isActive: true },
    });

    if (!activeUser || !activeUser.isActive) {
      return null;
    }

    return userPayload;
  } catch {
    return null;
  }
}

export async function createParentToken(payload: ParentSessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(JWT_SECRET);
}

export async function verifyParentToken(token: string, expectedSlug: string): Promise<ParentSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const parsed = payload as unknown as ParentSessionPayload;
    if (parsed.classSlug !== expectedSlug) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<UserSessionPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;
    return await verifySessionToken(token);
  } catch {
    return null;
  }
}

export async function checkParentAccess(classSlug: string): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const cookieName = `${PARENT_COOKIE_PREFIX}${classSlug}`;
    const token = cookieStore.get(cookieName)?.value;
    if (!token) return false;
    const verified = await verifyParentToken(token, classSlug);
    return !!verified;
  } catch {
    return false;
  }
}
