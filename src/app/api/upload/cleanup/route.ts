import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { db } from "@/db";
import { classes } from "@/db/schema";
import { eq } from "drizzle-orm";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { checkRateLimit, recordFailedAttempt } from "@/lib/rate-limiter";
import { deleteCache } from "@/lib/redis";

const TEMP_PATH_REGEX = /^(\d+)\/temp\/([a-zA-Z0-9_-]+\.(?:webp|pdf))$/;

export async function DELETE(request: NextRequest) {
  try {
    let user = await getCurrentUser();
    if (!user) {
      const cookieHeader = request.headers.get("cookie") || "";
      const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
      const token = (request as NextRequest).cookies?.get?.(SESSION_COOKIE_NAME)?.value || (match ? match[1] : null);
      if (token) {
        user = await verifySessionToken(token);
      }
    }

    if (!user) {
      return NextResponse.json({ success: false, error: "Sesi tidak valid. Silakan login kembali." }, { status: 401 });
    }

    // Rate limiting: 30 cleanups per minute per user
    const rateLimitKey = `cleanup:${user.id}`;
    const rateCheck = await checkRateLimit(rateLimitKey, 30, 60 * 1000);
    if (rateCheck.isBlocked) {
      return NextResponse.json(
        { success: false, error: "Terlalu banyak permintaan pembersihan berkas. Silakan tunggu 1 menit." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }
    await recordFailedAttempt(rateLimitKey, 30, 60 * 1000);

    let body: any = null;
    try {
      body = await request.json();
    } catch {
      try {
        const text = await request.text();
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }

    if (!body || !Array.isArray(body.filePaths)) {
      return NextResponse.json({ success: false, error: "Daftar jalur berkas (filePaths) wajib berupa array." }, { status: 400 });
    }

    const filePaths: string[] = body.filePaths;
    const storageBase = path.resolve(process.env.STORAGE_PATH || "./storage/uploads");
    const classAuthCache = new Map<number, boolean>();

    let deletedCount = 0;

    for (const relPath of filePaths) {
      if (typeof relPath !== "string") continue;
      const trimmed = relPath.trim();
      const match = trimmed.match(TEMP_PATH_REGEX);

      // Enforce strict containment: must only target {classId}/temp/{file}.(webp|pdf)
      if (!match) continue;

      const classId = parseInt(match[1], 10);
      if (isNaN(classId)) continue;

      // Check permission for this class
      if (user.role !== "superadmin") {
        let isAuthorized = classAuthCache.get(classId);
        if (isAuthorized === undefined) {
          const cls = await db.query.classes.findFirst({
            where: eq(classes.id, classId),
          });
          isAuthorized = Boolean(cls && cls.waliKelasId === user.id);
          classAuthCache.set(classId, isAuthorized);
        }
        if (!isAuthorized) continue;
      }

      const fullDiskPath = path.resolve(storageBase, trimmed);
      const rel = path.relative(storageBase, fullDiskPath);

      // Traversal guard
      if (rel.startsWith("..") || path.isAbsolute(rel)) continue;

      try {
        if (fs.existsSync(fullDiskPath)) {
          // Delete any Redis cache entries tied to this file hash
          try {
            const buf = fs.readFileSync(fullDiskPath);
            const fileHash = crypto.createHash("sha256").update(buf).digest("hex");
            await deleteCache(`cache:ocr:letter:${fileHash}:${classId}`);
            await deleteCache(`dedup:upload:${fileHash}`);
          } catch {
            // Redis cache removal is best-effort
          }

          fs.unlinkSync(fullDiskPath);
          deletedCount++;
        }
      } catch (unlinkErr) {
        console.warn(`[Cleanup] Gagal menghapus berkas ${trimmed}:`, unlinkErr);
      }
    }

    return NextResponse.json({
      success: true,
      deletedCount,
    });
  } catch (err: unknown) {
    console.error("[Cleanup] Route error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Gagal memproses pembersihan berkas." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return DELETE(request);
}
