import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { db } from "@/db";
import { classes, students } from "@/db/schema";
import { eq } from "drizzle-orm";
import { checkRateLimit, recordFailedAttempt } from "@/lib/rate-limiter";
import { getAiRouterConfig, parseLetterWithAi } from "@/lib/ai-router";
import crypto from "crypto";
import { getCache, setCache } from "@/lib/redis";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

function isValidFileMagic(buffer: Buffer): boolean {
  if (buffer.length < 5) return false;

  // PDF: %PDF-
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") return true;

  if (buffer.length >= 12) {
    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true;

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4E &&
      buffer[3] === 0x47
    ) return true;

    // WebP: RIFF .... WEBP
    if (
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    ) return true;

    // HEIC / HEIF: ....ftypheic or ....ftypmif1 or ....ftypmsf1
    const ftyp = buffer.subarray(4, 12).toString("ascii");
    if (ftyp.startsWith("ftyp")) return true;
  }

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
      return NextResponse.json(
        { success: false, error: "Sesi tidak valid. Silakan login kembali." },
        { status: 401 }
      );
    }

    // Rate limiting: 15 AI refine requests per minute per user
    const rateLimitKey = `ocr-letter-ai:${user.id}`;
    const rateCheck = await checkRateLimit(rateLimitKey, 15, 60 * 1000);
    if (rateCheck.isBlocked) {
      return NextResponse.json(
        {
          success: false,
          error: "Terlalu banyak permintaan AI. Silakan tunggu 1 menit.",
        },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }
    await recordFailedAttempt(rateLimitKey, 15, 60 * 1000);

    const formData = await request.formData();
    const classIdStr = formData.get("classId") as string;
    const file = formData.get("file") as File | null;
    const rawLinesStr = formData.get("rawLines") as string | null;

    if (!classIdStr || !file) {
      return NextResponse.json(
        { success: false, error: "File foto surat atau ID kelas tidak lengkap." },
        { status: 400 }
      );
    }

    const classId = parseInt(classIdStr, 10);
    if (isNaN(classId)) {
      return NextResponse.json(
        { success: false, error: "ID Kelas tidak valid." },
        { status: 400 }
      );
    }

    // Check teacher permission for this class
    if (user.role !== "superadmin") {
      const cls = await db.query.classes.findFirst({
        where: eq(classes.id, classId),
      });
      if (!cls || cls.waliKelasId !== user.id) {
        return NextResponse.json(
          { success: false, error: "Anda tidak memiliki izin mengelola ketidakhadiran siswa kelas ini." },
          { status: 403 }
        );
      }
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "Ukuran file terlalu besar. Maksimal 15 MB." },
        { status: 413 }
      );
    }

    const arrayBuf = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    if (!isValidFileMagic(buffer)) {
      return NextResponse.json(
        {
          success: false,
          error: "Format file tidak valid. Harap unggah foto surat izin (JPG, PNG, WebP) atau dokumen PDF yang sah.",
        },
        { status: 400 }
      );
    }

    const aiConfig = await getAiRouterConfig();
    if (!aiConfig.enabled) {
      return NextResponse.json(
        {
          success: false,
          error: "Layanan 9router AI sedang dinonaktifkan oleh Administrator.",
        },
        { status: 503 }
      );
    }

    // Hash-based caching: check if this identical letter file has already been parsed by AI for this class
    const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
    const aiCacheKey = `cache:ocr:letter:ai:${fileHash}:${classId}`;

    try {
      const cachedResult = await getCache<{ detected: Record<string, unknown> }>(aiCacheKey);
      if (cachedResult && cachedResult.detected) {
        return NextResponse.json({
          success: true,
          detected: cachedResult.detected,
          cached: true,
        });
      }
    } catch (cacheErr) {
      console.warn("[Letter AI Refine] Redis getCache failed:", cacheErr);
    }

    // Retrieve active students for this class to pass to AI candidate matcher
    const classStudents = await db.query.students.findMany({
      where: eq(students.classId, classId),
      columns: {
        id: true,
        name: true,
        nis: true,
      },
    });

    let rawLines: string[] = [];
    if (rawLinesStr) {
      try {
        const parsedLines = JSON.parse(rawLinesStr);
        if (Array.isArray(parsedLines)) {
          rawLines = parsedLines.filter((l) => typeof l === "string" && l.trim().length > 0);
        }
      } catch {
        // Ignore JSON parse error
      }
    }

    const base64Image = buffer.toString("base64");
    const mimeType = file.type || "image/jpeg";

    const aiResult = await parseLetterWithAi({
      rawLines,
      studentCandidates: classStudents,
      imageBase64: base64Image,
      mimeType,
    });

    if (!aiResult) {
      return NextResponse.json(
        {
          success: false,
          error: "Model AI tidak dapat menyempurnakan pembacaan surat. Silakan lengkapi form secara manual.",
        },
        { status: 502 }
      );
    }

    // Cache the AI refinement result for 24 hours (86400s)
    try {
      await setCache(aiCacheKey, { detected: aiResult }, 86400);
    } catch (cacheErr) {
      console.warn("[Letter AI Refine] Redis setCache failed:", cacheErr);
    }

    return NextResponse.json({
      success: true,
      detected: aiResult,
    });
  } catch (err: unknown) {
    console.error("Letter AI Refine API route error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Terjadi kesalahan internal server saat memproses AI refine.",
      },
      { status: 500 }
    );
  }
}
