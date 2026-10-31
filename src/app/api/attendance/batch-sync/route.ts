import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { db } from "@/db";
import { classes, students, attendanceRecords } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { checkRateLimit, recordFailedAttempt } from "@/lib/rate-limiter";
import { promoteTempLetterFile } from "@/lib/letter-crop-storage";
import { generateDateRange } from "@/lib/date-utils";
import { isValidLetterFilePath } from "@/lib/attendance-security";
import {
  invalidateClassDashboardCache,
  invalidateAdminOverviewCache,
} from "@/db/queries";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import path from "path";
import fs from "fs";

/**
 * Safely delete an unreferenced letter file from disk with path traversal containment.
 */
async function safeDeleteUnusedLetter(filePath: string | null | undefined) {
  if (!filePath || filePath.startsWith("legacy/")) return;

  const otherReference = await db.query.attendanceRecords.findFirst({
    where: eq(attendanceRecords.letterFilePath, filePath),
  });

  if (!otherReference) {
    const storageBase = path.resolve(process.env.STORAGE_PATH || "./storage/uploads");
    const fullPath = path.resolve(storageBase, filePath);
    const rel = path.relative(storageBase, fullPath);

    if (!rel.startsWith("..") && !path.isAbsolute(rel) && fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
      } catch (e) {
        console.warn("[Batch Sync] Gagal menghapus berkas surat lama:", e);
      }
    }
  }
}

const batchSyncItemSchema = z.object({
  tempFileId: z.string().min(1, "tempFileId wajib diisi"),
  studentId: z.coerce.number().positive("studentId harus berupa angka positif"),
  status: z.enum(["Izin", "Sakit"], {
    errorMap: () => ({ message: "Status harus 'Izin' atau 'Sakit'" }),
  }),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal mulai harus YYYY-MM-DD"),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal selesai harus YYYY-MM-DD")
    .nullable()
    .optional()
    .or(z.literal("")),
  isMultiDay: z.boolean().optional(),
  description: z.string().optional().default(""),
  actionType: z.enum(["update", "create"]).optional(),
  existingRecordId: z.coerce.number().positive().nullable().optional(),
});

const batchSyncPayloadSchema = z.object({
  classId: z.coerce.number().positive("classId harus berupa angka positif"),
  items: z.array(batchSyncItemSchema).min(1, "Daftar items minimal berisi 1 item"),
});

export async function POST(request: NextRequest) {
  try {
    // 1. Authentication
    let user = await getCurrentUser();
    if (!user) {
      const cookieHeader = request.headers.get("cookie") || "";
      const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
      const token =
        (request as NextRequest).cookies?.get?.(SESSION_COOKIE_NAME)?.value ||
        (match ? match[1] : null);
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
    const rateLimitKey = `attendance-batch-sync:${user.id}`;
    const rateCheck = await checkRateLimit(rateLimitKey, 10, 60_000);
    if (rateCheck.isBlocked) {
      return NextResponse.json(
        {
          success: false,
          error: "Terlalu banyak permintaan sinkronisasi absensi. Silakan tunggu 1 menit.",
        },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }
    await recordFailedAttempt(rateLimitKey, 10, 60_000);

    // 3. Payload Parsing & Validation
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Format payload JSON tidak valid." },
        { status: 400 }
      );
    }

    const parsed = batchSyncPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message || "Payload tidak valid.",
        },
        { status: 400 }
      );
    }

    const { classId, items } = parsed.data;

    // 4. Authorization: Verify target class and permissions
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
        { success: false, error: "Anda tidak memiliki izin mengelola absensi kelas ini." },
        { status: 403 }
      );
    }

    // 5. Verify Student Membership in Target Class
    const classStudents = await db.query.students.findMany({
      where: and(eq(students.classId, classId), eq(students.isActive, true)),
      columns: { id: true, name: true },
    });
    const validStudentSet = new Set(classStudents.map((s) => s.id));

    for (const item of items) {
      if (!validStudentSet.has(item.studentId)) {
        return NextResponse.json(
          {
            success: false,
            error: `Siswa dengan ID ${item.studentId} tidak ditemukan dalam kelas ini.`,
          },
          { status: 400 }
        );
      }
    }

    // 6. Pre-flight Verification of Temp Files on Disk
    const storageBase = path.resolve(process.env.STORAGE_PATH || "./storage/uploads");
    const tempDir = path.resolve(storageBase, String(classId), "temp");

    for (const item of items) {
      const cleanId = path
        .basename(item.tempFileId)
        .replace(/\.(webp|pdf)$/i, "")
        .replace(/[^a-zA-Z0-9_-]/g, "");
      const webpPath = path.resolve(tempDir, `${cleanId}.webp`);
      const pdfPath = path.resolve(tempDir, `${cleanId}.pdf`);

      if (!fs.existsSync(webpPath) && !fs.existsSync(pdfPath)) {
        return NextResponse.json(
          {
            success: false,
            error: `Berkas sementara "${item.tempFileId}" tidak ditemukan atau sudah kedaluwarsa.`,
          },
          { status: 400 }
        );
      }
    }

    // 7. Storage Promotion: Move temp files to permanent storage
    interface PreparedItem {
      item: (typeof items)[number];
      permanentFilePath: string;
      letterMimeType: string;
      datesToProcess: string[];
    }

    const preparedItems: PreparedItem[] = [];

    for (const item of items) {
      const datesToProcess = generateDateRange(item.startDate, item.endDate || undefined);
      const promoted = await promoteTempLetterFile(classId, item.tempFileId, item.startDate);
      const letterMimeType = promoted.permanentFilePath.endsWith(".pdf")
        ? "application/pdf"
        : "image/webp";

      if (!isValidLetterFilePath(promoted.permanentFilePath, classId)) {
        throw new Error(
          `Jalur berkas ${promoted.permanentFilePath} melanggar invariant keamanan kelas.`
        );
      }

      preparedItems.push({
        item,
        permanentFilePath: promoted.permanentFilePath,
        letterMimeType,
        datesToProcess,
      });
    }

    // 8. Atomic Database Transaction: Idempotent Upsert & Multi-Day Expansion
    let updatedCount = 0;
    let createdCount = 0;
    const oldFilesToDelete: string[] = [];

    await db.transaction(async (tx) => {
      for (const { item, permanentFilePath, letterMimeType, datesToProcess } of preparedItems) {
        for (const dateStr of datesToProcess) {
          const existing = await tx.query.attendanceRecords.findFirst({
            where: and(
              eq(attendanceRecords.classId, classId),
              eq(attendanceRecords.studentId, item.studentId),
              eq(attendanceRecords.attendanceDate, dateStr)
            ),
          });

          if (existing) {
            const oldPath = existing.letterFilePath;

            await tx
              .update(attendanceRecords)
              .set({
                status: item.status,
                infoSource: "Surat",
                description: item.description || existing.description || "",
                letterFilePath: permanentFilePath,
                letterMimeType,
                letterStatus: "Sudah",
                updatedAt: new Date(),
              })
              .where(eq(attendanceRecords.id, existing.id));

            if (oldPath && oldPath !== permanentFilePath) {
              oldFilesToDelete.push(oldPath);
            }
            updatedCount++;
          } else {
            await tx.insert(attendanceRecords).values({
              classId,
              studentId: item.studentId,
              attendanceDate: dateStr,
              status: item.status,
              infoSource: "Surat",
              description: item.description || "",
              letterFilePath: permanentFilePath,
              letterMimeType,
              letterStatus: "Sudah",
              createdById: user.id,
            });
            createdCount++;
          }
        }
      }
    });

    // 9. Post-Commit Asynchronous Cleanup of Replaced Files
    for (const oldPath of oldFilesToDelete) {
      await safeDeleteUnusedLetter(oldPath);
    }

    // 10. Cache Invalidation & Path Revalidation
    try {
      revalidatePath("/dashboard");
      revalidatePath(`/portal/${cls.slug}`);
    } catch {
      // Safe fallback when executed outside Next.js request lifecycle
    }

    try {
      await invalidateClassDashboardCache(classId);
      await invalidateAdminOverviewCache();
    } catch (err) {
      console.error("[Batch Sync] Gagal invalidasi cache dashboard:", err);
    }

    return NextResponse.json({
      success: true,
      updatedCount,
      createdCount,
      totalProcessed: updatedCount + createdCount,
    });
  } catch (err: unknown) {
    console.error("[Batch Sync] Fatal route error:", err);
    return NextResponse.json(
      {
        success: false,
        error:
          err instanceof Error
            ? err.message
            : "Terjadi kesalahan server saat sinkronisasi batch absensi.",
      },
      { status: 500 }
    );
  }
}
