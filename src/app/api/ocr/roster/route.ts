import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { db } from "@/db";
import { classes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { checkRateLimit, recordFailedAttempt } from "@/lib/rate-limiter";
import { getAiRouterConfig, parseRosterWithAi } from "@/lib/ai-router";

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

function isNoiseStudentName(name: string): boolean {
  if (!name || name.trim().length < 2) return true;
  const lower = name.toLowerCase().trim();

  // Header patterns
  if (
    lower.includes("data nama siswa") ||
    lower.includes("nama siswa kelas") ||
    lower.includes("daftar hadir") ||
    lower.includes("daftar siswa") ||
    lower.includes("daftar presensi") ||
    lower.includes("rekapitulasi") ||
    lower.includes("tahun ajaran") ||
    lower.includes("tahun pelajaran") ||
    lower.includes("kurikulum merdeka") ||
    /\bkelas\s+(?:xii|xi|x|[0-9]+)\b/.test(lower)
  ) {
    return true;
  }

  // Wali kelas and teacher titles
  if (
    lower.includes("wali kelas") ||
    lower.includes("guru kelas") ||
    lower.includes("kepala sekolah") ||
    /\b(?:s\.kom|s\.pd|m\.pd|s\.t|s\.si|s\.sos|gr)\.?\b/.test(lower)
  ) {
    return true;
  }

  // Footer / update date patterns
  if (
    lower.includes("update per") ||
    /\bper\s+\d{1,2}\s+(?:januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\b/.test(lower) ||
    /\b\d{1,2}\s+(?:januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\s+\d{4}\b/.test(lower) ||
    lower.startsWith("halaman ")
  ) {
    return true;
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

    // Rate limiting: 15 OCR scan requests per minute per user
    const rateLimitKey = `ocr-roster:${user.id}`;
    const rateCheck = await checkRateLimit(rateLimitKey, 15, 60 * 1000);
    if (rateCheck.isBlocked) {
      return NextResponse.json(
        {
          success: false,
          error: "Terlalu banyak permintaan pemindaian formulir. Silakan tunggu 1 menit.",
        },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }
    await recordFailedAttempt(rateLimitKey, 15, 60 * 1000);

    const formData = await request.formData();
    const classIdStr = formData.get("classId") as string;
    const file = formData.get("file") as File | null;

    if (!classIdStr || !file) {
      return NextResponse.json(
        { success: false, error: "File dokumen atau ID kelas tidak lengkap." },
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
          { success: false, error: "Anda tidak memiliki izin mengelola daftar siswa kelas ini." },
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
          error: "Format file tidak valid. Harap unggah foto lembar daftar siswa (JPG, PNG, WebP) atau dokumen PDF yang sah.",
        },
        { status: 400 }
      );
    }

    // Forward to internal OCR microservice
    const forwardFormData = new FormData();
    const blob = new Blob([buffer], { type: file.type || "application/octet-stream" });
    forwardFormData.append("file", blob, file.name);

    const controller = new AbortController();
    // Allow up to 90 seconds for multi-page PDF processing
    const timeoutId = setTimeout(() => controller.abort(), 90000);

    let ocrResponse: Response;
    try {
      ocrResponse = await fetch(`${OCR_SERVICE_URL}/extract`, {
        method: "POST",
        headers: {
          "X-Internal-Secret": process.env.OCR_INTERNAL_SECRET || "surat-ijin-internal-secret-2026",
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
            error: "Waktu pemindaian melebihi batas (timeout). Jika file PDF berisi banyak halaman, coba unggah halaman yang berisi daftar siswa saja.",
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
      const errorJson = await ocrResponse.json().catch(() => ({ detail: "Gagal memproses dokumen." }));
      return NextResponse.json(
        {
          success: false,
          error: errorJson.detail || "Gagal mengekstrak nama siswa dari dokumen.",
        },
        { status: ocrResponse.status }
      );
    }

    const data = await ocrResponse.json();
    let students = data.students || [];

    // Hybrid AI Assistance: If AI is enabled in System Settings, use AI to intelligently parse/refine the roster
    const aiConfig = await getAiRouterConfig();
    if (aiConfig.enabled) {
      try {
        const rawLines: string[] = [];
        if (data.raw_text) {
          rawLines.push(...data.raw_text.split("\n").map((l: string) => l.trim()).filter(Boolean));
        } else if (students.length > 0) {
          rawLines.push(...students.map((s: { name: string; nis?: string }) => `${s.name} ${s.nis || ""}`));
        }
        const aiStudents = await parseRosterWithAi({
          rawLines,
          imageBase64: buffer.toString("base64"),
          mimeType: file.type || "application/octet-stream",
        });

        if (aiStudents && aiStudents.length > 0) {
          students = aiStudents;
        }
      } catch (aiErr) {
        console.warn("[Roster OCR] AI refinement failed, continuing with PaddleOCR result:", aiErr);
      }
    }

    // Layer-3 defense: Filter any accidental noise, headers, wali kelas, or dates, and normalize NIS
    students = students
      .filter((s: { name: string; nis?: string }) => !isNoiseStudentName(s.name))
      .map((s: { name: string; nis?: string }) => ({
        name: s.name.trim(),
        nis: s.nis ? s.nis.replace(/\s*\/\s*/g, "/").trim() : undefined,
      }));

    return NextResponse.json({
      success: true,
      pagesProcessed: data.pages_processed || 1,
      totalStudents: students.length,
      students,
      processingTimeSeconds: data.processing_time_seconds,
    });
  } catch (err: unknown) {
    console.error("OCR API route error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Terjadi kesalahan internal server saat memindai dokumen.",
      },
      { status: 500 }
    );
  }
}
