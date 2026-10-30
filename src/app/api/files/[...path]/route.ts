import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, checkParentAccess } from "@/lib/auth";
import { getClientIp, checkRateLimit, recordFailedAttempt } from "@/lib/rate-limiter";
import { db } from "@/db";
import { classes, attendanceRecords } from "@/db/schema";
import { eq } from "drizzle-orm";
import path from "path";
import fs from "fs";
import { Readable } from "node:stream";

function streamFileResponse(
  request: NextRequest,
  fullPath: string,
  contentType: string,
  cacheControl: string
): NextResponse {
  const stat = fs.statSync(fullPath);
  const etag = `"${stat.size}-${Math.floor(stat.mtimeMs)}"`;

  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304 });
  }

  const nodeStream = fs.createReadStream(fullPath);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      "ETag": etag,
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="${encodeURIComponent(path.basename(fullPath))}"`,
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    // SEC-VULN-05: Rate limiting on file downloads (60 downloads per minute per client IP)
    const clientIp = await getClientIp(request);
    const rateLimitKey = `file-download:${clientIp}`;
    const rateCheck = checkRateLimit(rateLimitKey, 60, 60 * 1000);

    if (rateCheck.isBlocked) {
      return NextResponse.json(
        {
          error: "Terlalu banyak permintaan unduhan berkas. Silakan coba lagi nanti.",
          retryAfterSeconds: rateCheck.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateCheck.retryAfterSeconds),
          },
        }
      );
    }
    recordFailedAttempt(rateLimitKey, 60, 60 * 1000);

    const { path: pathSegments } = await params;
    if (!pathSegments || pathSegments.length === 0) {
      return new NextResponse("File tidak ditemukan", { status: 404 });
    }

    const relativePath = pathSegments.join("/");
    const storageBase = path.resolve(process.env.STORAGE_PATH || "./storage/uploads");
    const fullPath = path.resolve(storageBase, relativePath);

    // Prevent path traversal attacks
    const rel = path.relative(storageBase, fullPath);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      return new NextResponse("Akses tidak sah", { status: 403 });
    }

    // Public assets like system logo/favicon & dynamic PWA icons
    if (relativePath.startsWith("system/")) {
      if (!fs.existsSync(fullPath)) {
        // On-demand generation for icon variants if the source logo exists
        const base = path.basename(fullPath);
        const iconMatch = base.match(/^(?:icon-(192|512)|apple-icon)-(\d+)\.png$/);
        if (iconMatch) {
          const timestamp = iconMatch[2];
          const isApple = base.startsWith("apple-icon");
          const size = isApple ? 180 : parseInt(iconMatch[1], 10);
          const sourceLogoPath = path.resolve(storageBase, "system", `logo-${timestamp}.png`);
          if (fs.existsSync(sourceLogoPath)) {
            try {
              const sharp = (await import("sharp")).default;
              const sourceBuffer = fs.readFileSync(sourceLogoPath);
              await sharp(sourceBuffer)
                .resize(size, size, {
                  fit: "contain",
                  background: { r: 0, g: 0, b: 0, alpha: 0 },
                })
                .png({ quality: 90 })
                .toFile(fullPath);
            } catch {
              // Ignore failure, will fall through to 404 below
            }
          }
        }
      }

      if (!fs.existsSync(fullPath)) {
        return new NextResponse("File tidak ditemukan", { status: 404 });
      }

      const ext = path.extname(fullPath).toLowerCase();
      const contentTypes: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
      };
      const contentType = contentTypes[ext] || "application/octet-stream";
      return streamFileResponse(
        request,
        fullPath,
        contentType,
        "public, max-age=86400, stale-while-revalidate=604800"
      );
    }

    if (!fs.existsSync(fullPath)) {
      return new NextResponse("File tidak ditemukan", { status: 404 });
    }

    // Authorization logic
    const user = await getCurrentUser();
    let isAuthorized = false;

    if (user) {
      // Superadmin has universal access
      if (user.role === "superadmin") {
        isAuthorized = true;
      } else {
        // Wali Kelas: check if file belongs to teacher's class or is legacy sample
        if (relativePath.startsWith("legacy/")) {
          isAuthorized = true;
        } else {
          const classIdFromPath = parseInt(pathSegments[0], 10);
          if (!isNaN(classIdFromPath)) {
            const cls = await db.query.classes.findFirst({
              where: eq(classes.id, classIdFromPath),
            });
            if (cls && cls.waliKelasId === user.id) {
              isAuthorized = true;
            }
          }
          if (!isAuthorized) {
            const record = await db.query.attendanceRecords.findFirst({
              where: eq(attendanceRecords.letterFilePath, relativePath),
            });
            if (record) {
              const cls = await db.query.classes.findFirst({
                where: eq(classes.id, record.classId),
              });
              if (cls && cls.waliKelasId === user.id) {
                isAuthorized = true;
              }
            }
          }
        }
      }
    }

    // If not authorized as teacher/superadmin, check parent access
    if (!isAuthorized) {
      // Find class associated with this file path in attendance_records
      const record = await db.query.attendanceRecords.findFirst({
        where: eq(attendanceRecords.letterFilePath, relativePath),
      });

      if (record) {
        const cls = await db.query.classes.findFirst({
          where: eq(classes.id, record.classId),
        });
        if (cls) {
          // Check if class allows parents to view letter file
          if (!cls.parentShowLetterFile) {
            return new NextResponse(
              "Akses file surat dibatasi oleh Wali Kelas demi privasi siswa.",
              { status: 403 }
            );
          }

          // Check if parent has valid session cookie
          const parentValid = await checkParentAccess(cls.slug);
          if (parentValid) {
            isAuthorized = true;
          }
        }
      } else if (relativePath.startsWith("legacy/")) {
        // Legacy sample letter is permitted if parent has valid access to the class
        const legacyClass = await db.query.classes.findFirst({
          where: eq(classes.id, 1),
        });
        const parentValid = legacyClass ? await checkParentAccess(legacyClass.slug) : false;
        if (parentValid) {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      return new NextResponse("Akses ditolak. Silakan login atau masukkan kode akses kelas.", {
        status: 403,
      });
    }

    const ext = path.extname(fullPath).toLowerCase();

    let contentType = "application/octet-stream";
    if (ext === ".webp") contentType = "image/webp";
    else if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
    else if (ext === ".png") contentType = "image/png";
    else if (ext === ".pdf") contentType = "application/pdf";

    return streamFileResponse(request, fullPath, contentType, "private, max-age=3600");
  } catch (err) {
    console.error("Error serving file:", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
