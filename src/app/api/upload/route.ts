import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { db } from "@/db";
import { classes } from "@/db/schema";
import { eq } from "drizzle-orm";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import sharp from "sharp";
import { checkRateLimit, recordFailedAttempt } from "@/lib/rate-limiter";
import { getCache, setCache } from "@/lib/redis";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function isValidImageMagicBytes(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;

  // JPEG: FF D8 FF
  const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
  if (isJpeg) return true;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4E &&
    buffer[3] === 0x47;
  if (isPng) return true;

  // WebP: RIFF .... WEBP
  const isWebp =
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if (isWebp) return true;

  return false;
}

export async function POST(request: NextRequest) {
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
      return NextResponse.json({ error: "Sesi tidak valid. Silakan login kembali." }, { status: 401 });
    }

    // Rate limiting: max 30 uploads per minute per user
    const uploadRateKey = `upload:${user.id}`;
    const rateCheck = await checkRateLimit(uploadRateKey, 30, 60 * 1000);
    if (rateCheck.isBlocked) {
      return NextResponse.json(
        { error: "Terlalu banyak permintaan unggah file. Silakan tunggu 1 menit." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }
    await recordFailedAttempt(uploadRateKey, 30, 60 * 1000);

    const formData = await request.formData();
    const classIdStr = formData.get("classId") as string;
    const file = formData.get("file") as File | null;

    if (!classIdStr || !file) {
      return NextResponse.json({ error: "Data file atau kelas tidak lengkap." }, { status: 400 });
    }

    // Hardened file size check before reading arrayBuffer
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Ukuran file terlalu besar. Maksimal 10 MB." },
        { status: 413 }
      );
    }

    const classId = parseInt(classIdStr, 10);
    if (isNaN(classId)) {
      return NextResponse.json({ error: "ID Kelas tidak valid." }, { status: 400 });
    }

    // Permission check
    if (user.role !== "superadmin") {
      const cls = await db.query.classes.findFirst({
        where: eq(classes.id, classId),
      });
      if (!cls || cls.waliKelasId !== user.id) {
        return NextResponse.json({ error: "Anda tidak memiliki izin mengunggah untuk kelas ini." }, { status: 403 });
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    // Validate file integrity & magic bytes before deduplication and storage
    if (isPdf) {
      if (buffer.length < 5 || buffer.subarray(0, 5).toString() !== "%PDF-") {
        return NextResponse.json({ error: "File PDF tidak valid atau rusak." }, { status: 400 });
      }
    } else {
      if (!isValidImageMagicBytes(buffer)) {
        return NextResponse.json(
          { error: "Format file gambar tidak valid. Harap gunakan file JPG, PNG, atau WebP yang sah." },
          { status: 400 }
        );
      }
    }

    const storageBase = process.env.STORAGE_PATH || "./storage/uploads";

    // File upload deduplication via SHA-256 hash (TTL: 30 days = 2592000s)
    const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
    const dedupKey = `dedup:upload:${fileHash}`;

    try {
      const cachedFilePath = await getCache<string>(dedupKey);
      if (cachedFilePath && typeof cachedFilePath === "string") {
        const fullDiskPath = path.resolve(storageBase, cachedFilePath);
        const rel = path.relative(path.resolve(storageBase), fullDiskPath);
        const isSafePath = !rel.startsWith("..") && !path.isAbsolute(rel);

        if (isSafePath && fs.existsSync(fullDiskPath)) {
          const ext = path.extname(cachedFilePath).toLowerCase();
          const mimeType = ext === ".pdf" ? "application/pdf" : "image/webp";
          return NextResponse.json({
            success: true,
            filePath: cachedFilePath,
            mimeType,
            deduplicated: true,
          });
        }
      }
    } catch (cacheErr) {
      console.warn("[Upload Dedup] Redis dedup check failed, proceeding with normal upload:", cacheErr);
    }

    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const randomSuffix = crypto.randomBytes(6).toString("hex");
    const timestamp = Date.now();

    const dirPath = path.resolve(storageBase, String(classId), yearMonth);

    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    let fileName: string;
    let mimeType: string;
    let finalPath: string;

    if (isPdf) {
      fileName = `${timestamp}_${randomSuffix}.pdf`;
      finalPath = path.join(dirPath, fileName);
      fs.writeFileSync(finalPath, buffer);
      mimeType = "application/pdf";
    } else {
      // Process with sharp: auto-orient based on EXIF and optimize to WebP
      fileName = `${timestamp}_${randomSuffix}.webp`;
      finalPath = path.join(dirPath, fileName);
      await sharp(buffer)
        .rotate() // auto-orient based on EXIF tag
        .webp({ quality: 82 })
        .toFile(finalPath);
      mimeType = "image/webp";
    }

    // Store relative path e.g. "1/2026-10/1729838493_a1b2c3.webp"
    const relativeStoredPath = `${classId}/${yearMonth}/${fileName}`;

    // Cache deduplication pointer (30 days TTL = 2592000s)
    try {
      await setCache(dedupKey, relativeStoredPath, 30 * 86400);
    } catch (cacheErr) {
      console.warn("[Upload Dedup] Redis setCache failed:", cacheErr);
    }

    return NextResponse.json({
      success: true,
      filePath: relativeStoredPath,
      mimeType,
    });
  } catch (err: unknown) {
    console.error("Upload error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal memproses file upload." },
      { status: 500 }
    );
  }
}
