import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { db } from "@/db";
import { classes, students, attendanceRecords } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { checkRateLimit, recordFailedAttempt } from "@/lib/rate-limiter";
import { getAiRouterConfig, parseLetterWithAi, segmentAndParseTableLettersWithAi } from "@/lib/ai-router";
import {
  autoOrientImage,
  normalizeBoundingBox,
  cropLetterToWebp,
  saveCroppedLetterToTemp,
  cleanupExpiredTempFiles,
} from "@/lib/letter-crop-storage";
import { getCache, setCache } from "@/lib/redis";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import sharp from "sharp";

const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || "http://127.0.0.1:8001";
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const MAX_BATCH_FILES = 10;

export interface BatchLetterItem {
  tempFileId: string;
  previewUrl: string;
  studentId: number | null;
  studentName: string | null;
  candidateName: string | null;
  matchConfidence: number;
  status: "Izin" | "Sakit";
  startDate: string;
  endDate: string | null;
  isMultiDay: boolean;
  description: string;
  actionType: "update" | "create";
  existingRecordId: number | null;
}

export interface BatchOcrResponse {
  success: boolean;
  mode: "multi_file" | "table_scan";
  totalDetected: number;
  allHighConfidence: boolean;
  items: BatchLetterItem[];
  processingTimeSeconds: number;
}

function isValidFileMagic(buffer: Buffer): boolean {
  if (buffer.length < 5) return false;

  // PDF: %PDF-
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") return true;

  if (buffer.length >= 12) {
    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
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

function sanitizeDate(dateStr: unknown): string {
  if (!dateStr || typeof dateStr !== "string") return "";
  const trimmed = dateStr.trim();
  const match = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!match) return "";
  const year = parseInt(match[1], 10);
  const currentYear = new Date().getFullYear();
  if (Math.abs(year - currentYear) > 1) {
    return "";
  }
  const month = match[2].padStart(2, "0");
  const day = match[3].padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sanitizeEndDate(dateStr: unknown): string | null {
  const sanitized = sanitizeDate(dateStr);
  return sanitized ? sanitized : null;
}

function normalizeStatus(raw: unknown): "Izin" | "Sakit" {
  if (typeof raw !== "string") return "Izin";
  const s = raw.trim().toLowerCase();
  if (
    s.includes("sakit") ||
    s.includes("demam") ||
    s.includes("dokter") ||
    s.includes("opname") ||
    s.includes("rawat")
  ) {
    return "Sakit";
  }
  return "Izin";
}

async function determineActionType(
  classId: number,
  studentId: number | null,
  startDate: string
): Promise<{ actionType: "update" | "create"; existingRecordId: number | null }> {
  if (!studentId || !startDate) {
    return { actionType: "create", existingRecordId: null };
  }

  try {
    const existing = await db.query.attendanceRecords.findFirst({
      where: and(
        eq(attendanceRecords.classId, classId),
        eq(attendanceRecords.studentId, studentId),
        eq(attendanceRecords.attendanceDate, startDate)
      ),
      columns: {
        id: true,
      },
    });

    if (existing) {
      return { actionType: "update", existingRecordId: existing.id };
    }
  } catch (err) {
    console.warn("[Batch OCR] Error checking existing attendance record:", err);
  }

  return { actionType: "create", existingRecordId: null };
}

export async function POST(request: NextRequest) {
  const startTime = performance.now();

  try {
    // 1. Authentication
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

    // 2. Rate Limiting: 10 requests per minute per user
    const rateLimitKey = `ocr-batch:${user.id}`;
    const rateCheck = await checkRateLimit(rateLimitKey, 10, 60 * 1000);
    if (rateCheck.isBlocked) {
      return NextResponse.json(
        {
          success: false,
          error: "Terlalu banyak permintaan pemindaian batch surat izin. Silakan tunggu 1 menit.",
        },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }
    await recordFailedAttempt(rateLimitKey, 10, 60 * 1000);

    // 3. Parse FormData
    const formData = await request.formData();
    const classIdStr = formData.get("classId") as string | null;
    const modeRaw = formData.get("mode") as string | null;
    const mode: "multi_file" | "table_scan" = modeRaw === "table_scan" ? "table_scan" : "multi_file";

    if (!classIdStr) {
      return NextResponse.json(
        { success: false, error: "ID Kelas wajib disertakan." },
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

    // 4. Authorization: Verify teacher belongs to class or is superadmin
    const cls = await db.query.classes.findFirst({
      where: eq(classes.id, classId),
    });
    if (!cls) {
      return NextResponse.json(
        { success: false, error: "Kelas tidak ditemukan." },
        { status: 404 }
      );
    }
    if (user.role !== "superadmin" && cls.waliKelasId !== user.id) {
      return NextResponse.json(
        { success: false, error: "Anda tidak memiliki izin mengelola ketidakhadiran siswa kelas ini." },
        { status: 403 }
      );
    }

    // 5. Extract Files from FormData
    let files: File[] = [];
    const filesFromGetAll = formData.getAll("files") as File[];
    const fileFromGetAll = formData.getAll("file") as File[];
    const singleFile = formData.get("file") as File | null;

    if (filesFromGetAll.length > 0) {
      files = filesFromGetAll.filter((f) => f && typeof f.size === "number" && f.size > 0);
    } else if (fileFromGetAll.length > 0) {
      files = fileFromGetAll.filter((f) => f && typeof f.size === "number" && f.size > 0);
    } else if (singleFile && singleFile.size > 0) {
      files = [singleFile];
    }

    if (files.length === 0) {
      return NextResponse.json(
        { success: false, error: "Tidak ada file surat yang diunggah." },
        { status: 400 }
      );
    }

    if (mode === "multi_file" && files.length > MAX_BATCH_FILES) {
      return NextResponse.json(
        { success: false, error: `Maksimal ${MAX_BATCH_FILES} file per pemindaian batch.` },
        { status: 400 }
      );
    }

    const fileBuffers: Array<{ file: File; buffer: Buffer }> = [];
    for (const f of files) {
      if (f.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { success: false, error: `Ukuran file "${f.name}" melebihi batas maksimal 15 MB.` },
          { status: 413 }
        );
      }

      const arrayBuf = await f.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      if (!isValidFileMagic(buffer)) {
        return NextResponse.json(
          {
            success: false,
            error: `Format file "${f.name}" tidak valid. Harap gunakan foto berformat JPG, PNG, WebP atau dokumen PDF.`,
          },
          { status: 400 }
        );
      }
      fileBuffers.push({ file: f, buffer });
    }

    // 6. Setup Storage & Students List
    const storageBase = path.resolve(process.env.STORAGE_PATH || "./storage/uploads");
    const tempDir = path.resolve(storageBase, String(classId), "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    // Background non-blocking cleanup of stale temp files (> 2 hours old)
    cleanupExpiredTempFiles().catch(() => {});

    const classStudents = await db.query.students.findMany({
      where: eq(students.classId, classId),
      columns: {
        id: true,
        name: true,
        nis: true,
      },
    });

    const aiConfig = await getAiRouterConfig();
    const rawSecret = (process.env.OCR_INTERNAL_SECRET || "").trim();
    const internalSecret =
      !rawSecret || rawSecret === "ganti_dengan_token_rahasia_internal_microservice_ocr_2026"
        ? "surat-ijin-internal-secret-2026"
        : rawSecret;

    const items: BatchLetterItem[] = [];

    // ==========================================
    // 7. Mode 1: MULTI_FILE
    // ==========================================
    if (mode === "multi_file") {
      const processedItems = await Promise.all(
        fileBuffers.map(async ({ file, buffer }, idx): Promise<BatchLetterItem> => {
          const isPdf = buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-";
          const tempFileId = `letter_${Date.now()}_${idx}_${crypto.randomBytes(4).toString("hex")}`;
          let previewUrl = "";

          if (isPdf) {
            const tempFileName = `${tempFileId}.pdf`;
            const tempFilePath = path.join(tempDir, tempFileName);
            fs.writeFileSync(tempFilePath, buffer);
            previewUrl = `/api/files/${classId}/temp/${tempFileName}`;
          } else {
            const oriented = await autoOrientImage(buffer);
            const webpBuf = await sharp(oriented.orientedBuffer)
              .webp({ quality: 85 })
              .toBuffer();
            const saved = await saveCroppedLetterToTemp(classId, webpBuf, tempFileId);
            previewUrl = saved.previewUrl;
          }

          // Check hash cache
          const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
          const ocrCacheKey = `cache:ocr:letter:${fileHash}:${classId}`;
          let detected: Record<string, any> | null = null;

          try {
            const cachedResult = await getCache<{ detected: Record<string, any> }>(ocrCacheKey);
            if (cachedResult && cachedResult.detected) {
              detected = cachedResult.detected;
            }
          } catch {
            // Soft ignore cache lookup error
          }

          if (!detected) {
            // Forward to local OCR microservice
            let ocrSuccess = false;
            try {
              const forwardFormData = new FormData();
              const blob = new Blob([new Uint8Array(buffer)], { type: file.type || (isPdf ? "application/pdf" : "image/webp") });
              forwardFormData.append("file", blob, file.name || "letter.webp");
              forwardFormData.append("students", JSON.stringify(classStudents));

              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 30000);

              const ocrRes = await fetch(`${OCR_SERVICE_URL}/extract-letter`, {
                method: "POST",
                headers: { "X-Internal-Secret": internalSecret },
                body: forwardFormData,
                signal: controller.signal,
              });
              clearTimeout(timeoutId);

              if (ocrRes.ok) {
                const data = await ocrRes.json();
                detected = data.detected || {};
                ocrSuccess = true;
              }
            } catch (ocrErr) {
              console.warn(`[Batch OCR] Microservice failed for file ${file.name}:`, ocrErr);
            }

            // Fallback to AI Refinement if OCR failed or confidence is low
            const matchConf = typeof detected?.matchConfidence === "number" ? detected.matchConfidence : 0;
            const needsAi = !ocrSuccess || !detected?.studentName || matchConf < 0.80 || !detected?.startDate;

            if (needsAi && aiConfig.enabled && !isPdf) {
              try {
                const aiResult = await parseLetterWithAi({
                  rawLines: detected?.rawLines || [],
                  studentCandidates: classStudents,
                  imageBase64: buffer.toString("base64"),
                  mimeType: file.type || "image/jpeg",
                });
                if (aiResult) {
                  detected = aiResult;
                }
              } catch (aiErr) {
                console.warn(`[Batch OCR] AI refinement failed for file ${file.name}:`, aiErr);
              }
            }

            // Save to Redis cache if detected
            if (detected) {
              try {
                await setCache(ocrCacheKey, { detected }, 86400);
              } catch {
                // Soft ignore cache write error
              }
            }
          }

          // Sanitize & validate fields
          const sanitizedStart = sanitizeDate(detected?.startDate);
          const sanitizedEnd = sanitizeEndDate(detected?.endDate);
          const status = normalizeStatus(detected?.status);
          const confidence = typeof detected?.matchConfidence === "number" ? detected.matchConfidence : 0;
          const isMultiDay = Boolean(
            detected?.isMultiDay || (sanitizedStart && sanitizedEnd && sanitizedStart !== sanitizedEnd)
          );

          let studentId: number | null = detected?.studentId ?? null;
          let studentName: string | null = detected?.studentName ?? null;

          if (studentId) {
            const found = classStudents.find((s) => s.id === studentId);
            if (!found) {
              studentId = null;
              studentName = null;
            } else {
              studentName = found.name;
            }
          }

          const { actionType, existingRecordId } = await determineActionType(classId, studentId, sanitizedStart);

          return {
            tempFileId,
            previewUrl,
            studentId,
            studentName,
            candidateName: detected?.candidateName ?? null,
            matchConfidence: Math.min(Math.max(confidence, 0), 1),
            status,
            startDate: sanitizedStart,
            endDate: sanitizedEnd,
            isMultiDay,
            description: detected?.description || "",
            actionType,
            existingRecordId,
          };
        })
      );

      items.push(...processedItems);
    }

    // ==========================================
    // 8. Mode 2: TABLE_SCAN
    // ==========================================
    else if (mode === "table_scan") {
      const { file: targetFile, buffer } = fileBuffers[0];

      // Reject PDF for table scan
      if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
        return NextResponse.json(
          {
            success: false,
            error: "Mode foto meja (table_scan) memerlukan file foto (JPG, PNG, WebP), bukan PDF.",
          },
          { status: 400 }
        );
      }

      if (!aiConfig?.enabled) {
        return NextResponse.json(
          {
            success: false,
            error: "Layanan 9router AI Vision diperlukan untuk mode pemindaian foto meja (table_scan).",
          },
          { status: 503 }
        );
      }

      const base64Image = buffer.toString("base64");
      const mimeType = targetFile.type || "image/jpeg";

      const detectedLetters = await segmentAndParseTableLettersWithAi({
        imageBase64: base64Image,
        mimeType,
        studentCandidates: classStudents,
      });

      if (detectedLetters && detectedLetters.length > 0) {
        const { orientedBuffer, width: imgWidth, height: imgHeight } = await autoOrientImage(buffer);

        for (let i = 0; i < detectedLetters.length; i++) {
          const det = detectedLetters[i];
          const pixelBox = normalizeBoundingBox(det.boundingBox, imgWidth, imgHeight);

          let savedTempFile: { tempFileId: string; previewUrl: string };

          try {
            const croppedWebp = await cropLetterToWebp(orientedBuffer, pixelBox, 85);
            savedTempFile = await saveCroppedLetterToTemp(classId, croppedWebp);
          } catch (cropErr) {
            console.warn(`[Batch OCR] Sharp crop failed for letter ${i}, fallback to oriented image:`, cropErr);
            const fullWebp = await sharp(orientedBuffer).webp({ quality: 85 }).toBuffer();
            savedTempFile = await saveCroppedLetterToTemp(classId, fullWebp);
          }

          const sanitizedStart = sanitizeDate(det.startDate);
          const sanitizedEnd = sanitizeEndDate(det.endDate);
          const status = normalizeStatus(det.status);
          const confidence = typeof det.matchConfidence === "number" ? det.matchConfidence : 0;
          const isMultiDay = Boolean(
            det.isMultiDay || (sanitizedStart && sanitizedEnd && sanitizedStart !== sanitizedEnd)
          );

          let studentId: number | null = det.studentId ?? null;
          let studentName: string | null = det.studentName ?? null;

          if (studentId) {
            const found = classStudents.find((s) => s.id === studentId);
            if (!found) {
              studentId = null;
              studentName = null;
            } else {
              studentName = found.name;
            }
          }

          const { actionType, existingRecordId } = await determineActionType(classId, studentId, sanitizedStart);

          items.push({
            tempFileId: savedTempFile.tempFileId,
            previewUrl: savedTempFile.previewUrl,
            studentId,
            studentName,
            candidateName: det.candidateName ?? null,
            matchConfidence: Math.min(Math.max(confidence, 0), 1),
            status,
            startDate: sanitizedStart,
            endDate: sanitizedEnd,
            isMultiDay,
            description: det.description || "",
            actionType,
            existingRecordId,
          });
        }
      }
    }

    // 9. Evaluate allHighConfidence boolean
    const allHighConfidence =
      items.length > 0 &&
      items.every(
        (item) =>
          item.studentId !== null &&
          Boolean(item.studentName) &&
          Boolean(item.startDate) &&
          typeof item.matchConfidence === "number" &&
          item.matchConfidence >= 0.85
      );

    const elapsed = Math.round((performance.now() - startTime) / 100) / 10;

    const responsePayload: BatchOcrResponse = {
      success: true,
      mode,
      totalDetected: items.length,
      allHighConfidence,
      items,
      processingTimeSeconds: elapsed,
    };

    return NextResponse.json(responsePayload);
  } catch (err: unknown) {
    console.error("[Batch OCR] Route error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Terjadi kesalahan internal server saat memproses batch OCR.",
      },
      { status: 500 }
    );
  }
}
