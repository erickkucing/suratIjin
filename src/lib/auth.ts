import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "@/db";
import { users, classes } from "@/db/schema";
import { eq } from "drizzle-orm";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "surat_ijin_super_secret_jwt_key_2026_modern_academic_system"
);

export const SESSION_COOKIE_NAME = "surat_session";
export const PARENT_COOKIE_PREFIX = "parent_access_";

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
    return payload as unknown as UserSessionPayload;
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
