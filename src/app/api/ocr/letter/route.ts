import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { db } from "@/db";
import { classes, students } from "@/db/schema";
import { eq } from "drizzle-orm";
import { checkRateLimit, recordFailedAttempt } from "@/lib/rate-limiter";
import { getAiRouterConfig, parseLetterWithAi } from "@/lib/ai-router";
import crypto from "crypto";
import { getCache, setCache } from "@/lib/redis";

const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || "http://127.0.0.1:8001";
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

    // Rate limiting: 20 OCR letter scan requests per minute per user
    const rateLimitKey = `ocr-letter:${user.id}`;
    const rateCheck = await checkRateLimit(rateLimitKey, 20, 60 * 1000);
    if (rateCheck.isBlocked) {
      return NextResponse.json(
        {
          success: false,
          error: "Terlalu banyak permintaan pemindaian surat izin. Silakan tunggu 1 menit.",
        },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }
    await recordFailedAttempt(rateLimitKey, 20, 60 * 1000);

    const formData = await request.formData();
    const classIdStr = formData.get("classId") as string;
    const file = formData.get("file") as File | null;

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

    // Hash-based caching: check if this identical letter file has already been processed for this class
    const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
    const ocrCacheKey = `cache:ocr:letter:${fileHash}:${classId}`;

    try {
      const cachedResult = await getCache<{
        detected: Record<string, unknown>;
        processingTimeSeconds?: number;
      }>(ocrCacheKey);

      if (cachedResult && cachedResult.detected) {
        return NextResponse.json({
          success: true,
          detected: cachedResult.detected,
          processingTimeSeconds: cachedResult.processingTimeSeconds ?? 0,
          cached: true,
        });
      }
    } catch (cacheErr) {
      console.warn("[Letter OCR] Redis getCache failed, proceeding with live inference:", cacheErr);
    }

    // Retrieve active students for this class to pass to OCR fuzzy matcher
    const classStudents = await db.query.students.findMany({
      where: eq(students.classId, classId),
      columns: {
        id: true,
        name: true,
        nis: true,
      },
    });

    // Forward to internal OCR microservice
    const forwardFormData = new FormData();
    const blob = new Blob([buffer], { type: file.type || "application/octet-stream" });
    forwardFormData.append("file", blob, file.name);
    forwardFormData.append("students", JSON.stringify(classStudents));

    const controller = new AbortController();
    // Allow up to 60 seconds for letter inference
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const rawSecret = (process.env.OCR_INTERNAL_SECRET || "").trim();
    const internalSecret =
      !rawSecret || rawSecret === "ganti_dengan_token_rahasia_internal_microservice_ocr_2026"
        ? "surat-ijin-internal-secret-2026"
        : rawSecret;

    let ocrResponse: Response;
    try {
      ocrResponse = await fetch(`${OCR_SERVICE_URL}/extract-letter`, {
        method: "POST",
        headers: {
          "X-Internal-Secret": internalSecret,
        },
        body: forwardFormData,
        signal: controller.signal,
      });
    } catch (networkErr: unknown) {
      clearTimeout(timeoutId);
      const isAbort = networkErr instanceof Error && networkErr.name === "AbortError";
      if (isAbort) {
        return NextResponse.json(
          {
            success: false,
            error: "Waktu pemindaian melebihi batas (timeout). Pastikan foto tidak terlalu buram atau berukuran terlalu besar.",
          },
          { status: 504 }
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: "Layanan pemindai OCR lokal sedang tidak aktif atau sedang memulai. Silakan coba kembali sesaat lagi.",
        },
        { status: 503 }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!ocrResponse.ok) {
      const errorJson = await ocrResponse.json().catch(() => ({ detail: "Gagal memproses surat izin." }));
      return NextResponse.json(
        {
          success: false,
          error: errorJson.detail || "Gagal menganalisis informasi surat izin.",
        },
        { status: ocrResponse.status }
      );
    }

    const data = await ocrResponse.json();
    const detected = data.detected || {};

    // Smart Fallback via 9router AI if enabled
    const aiConfig = await getAiRouterConfig();
    if (aiConfig.enabled) {
      const matchConfidence = typeof detected.matchConfidence === "number" ? detected.matchConfidence : 0;
      const needsAi =
        !detected.studentName ||
        matchConfidence < 0.70 ||
        !detected.startDate ||
        !detected.status;

      if (needsAi) {
        try {
          const rawText: string = detected.rawExtractedText || data.raw_text || "";
          const rawLines = rawText ? rawText.split("\n").map((l: string) => l.trim()).filter(Boolean) : [];

          const aiResult = await parseLetterWithAi({
            rawLines,
            studentCandidates: classStudents,
            imageBase64: buffer.toString("base64"),
            mimeType: file.type || "image/jpeg",
          });

          if (aiResult) {
            if (aiResult.studentName && (!detected.studentName || aiResult.matchConfidence > matchConfidence)) {
              detected.studentId = aiResult.studentId;
              detected.studentName = aiResult.studentName;
              detected.candidateName = aiResult.candidateName || detected.candidateName;
              detected.matchConfidence = aiResult.matchConfidence;
            } else if (!detected.candidateName && aiResult.candidateName) {
              detected.candidateName = aiResult.candidateName;
            }

            if (aiResult.className && !detected.className) {
              detected.className = aiResult.className;
            }

            if (aiResult.status && (!detected.status || detected.status === "Izin")) {
              detected.status = aiResult.status;
            }

            if (aiResult.startDate) {
              detected.startDate = aiResult.startDate;
              detected.endDate = aiResult.endDate;
              detected.isMultiDay = aiResult.isMultiDay;
            }

            if (aiResult.description && (!detected.description || detected.description.length < 5)) {
              detected.description = aiResult.description;
            }
          }
        } catch (aiErr) {
          console.warn("[Letter OCR] AI fallback failed, continuing with PaddleOCR result:", aiErr);
        }
      }
    }

    // Layer 3 defense: Sanitize dates to prevent student birth dates (e.g. 2005-2015) from becoming absence dates
    const currentYear = new Date().getFullYear();
    if (detected.startDate) {
      const year = parseInt(String(detected.startDate).split("-")[0], 10);
      if (isNaN(year) || Math.abs(year - currentYear) > 1) {
        console.warn(`[Letter OCR] Rejected implausible absence year ${year} (likely birth date)`);
        detected.startDate = "";
        detected.endDate = "";
        detected.isMultiDay = false;
      }
    }
    if (detected.endDate) {
      const year = parseInt(String(detected.endDate).split("-")[0], 10);
      if (isNaN(year) || Math.abs(year - currentYear) > 1) {
        detected.endDate = "";
        detected.isMultiDay = false;
      }
    }

    // Cache the successfully analyzed and sanitized OCR result (TTL 24 hours = 86400s)
    try {
      await setCache(
        ocrCacheKey,
        {
          detected,
          processingTimeSeconds: data?.processing_time_seconds ?? 0,
        },
        86400
      );
    } catch (cacheErr) {
      console.warn("[Letter OCR] Redis setCache failed:", cacheErr);
    }

    return NextResponse.json({
      success: true,
      detected,
      processingTimeSeconds: data.processing_time_seconds,
    });
  } catch (err: unknown) {
    console.error("Letter OCR API route error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Terjadi kesalahan internal server saat memindai surat izin.",
      },
      { status: 500 }
    );
  }
}
