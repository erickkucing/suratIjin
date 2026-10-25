import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, checkParentAccess } from "@/lib/auth";
import { db } from "@/db";
import { classes, attendanceRecords } from "@/db/schema";
import { eq } from "drizzle-orm";
import path from "path";
import fs from "fs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
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
              with: { class: true },
            });
            if (record?.class && record.class.waliKelasId === user.id) {
              isAuthorized = true;
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
        with: {
          class: true,
        },
      });

      if (record && record.class) {
        // Check if class allows parents to view letter file
        if (!record.class.parentShowLetterFile) {
          return new NextResponse(
            "Akses file surat dibatasi oleh Wali Kelas demi privasi siswa.",
            { status: 403 }
          );
        }

        // Check if parent has valid session cookie
        const parentValid = await checkParentAccess(record.class.slug);
        if (parentValid) {
          isAuthorized = true;
        }
      } else if (relativePath.startsWith("legacy/")) {
        // Legacy sample letter is permitted if parent has valid access to xii-tkj-2
        const parentValid = await checkParentAccess("xii-tkj-2");
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

    const fileBuffer = fs.readFileSync(fullPath);
    const ext = path.extname(fullPath).toLowerCase();

    let contentType = "application/octet-stream";
    if (ext === ".webp") contentType = "image/webp";
    else if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
    else if (ext === ".png") contentType = "image/png";
    else if (ext === ".pdf") contentType = "application/pdf";

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("Error serving file:", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
