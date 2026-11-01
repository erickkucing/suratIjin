import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { POST } from "../route";
import { DELETE, POST as CLEANUP_POST } from "../cleanup/route";
import { db } from "@/db";
import { classes, users } from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { setCache, getCache } from "@/lib/redis";
import path from "path";
import fs from "fs";
import crypto from "crypto";

describe("Temporary Letter Upload & Cleanup API (/api/upload & /api/upload/cleanup)", () => {
  let superadminToken: string;
  let testClassId: number;
  let unauthorizedToken: string;
  let unauthTeacherId: number | null = null;
  const storageBase = path.resolve(process.env.STORAGE_PATH || "./storage/uploads");
  const createdFiles: string[] = [];

  const samplePngBuffer = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2d420000000049454e44ae426082",
    "hex"
  );

  const samplePdfBuffer = Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\nxref\n0 3\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n115\n%%EOF"
  );

  beforeAll(async () => {
    const admin = await db.query.users.findFirst({
      where: eq(users.role, "superadmin"),
    });
    if (!admin) throw new Error("Superadmin user not found");

    superadminToken = await createSessionToken({
      id: admin.id,
      username: admin.username,
      displayName: admin.displayName,
      role: admin.role,
    });

    const cls = await db.query.classes.findFirst();
    if (!cls) throw new Error("Class not found");
    testClassId = cls.id;

    // Find or create an active wali_kelas user who is not assigned to testClassId
    let unauthTeacher = await db.query.users.findFirst({
      where: and(eq(users.role, "wali_kelas"), ne(users.id, cls.waliKelasId ?? 0)),
    });

    if (!unauthTeacher) {
      const [inserted] = await db.insert(users).values({
        username: `unauth_wali_${Date.now()}`,
        passwordHash: "dummyhash",
        displayName: "Wali Kelas Sebelah",
        role: "wali_kelas",
      });
      unauthTeacherId = (inserted as any).insertId;
      unauthTeacher = await db.query.users.findFirst({
        where: eq(users.id, unauthTeacherId!),
      });
    }

    if (!unauthTeacher) throw new Error("Failed to initialize unauthorized teacher");

    unauthorizedToken = await createSessionToken({
      id: unauthTeacher.id,
      username: unauthTeacher.username,
      displayName: unauthTeacher.displayName,
      role: unauthTeacher.role,
    });
  });

  afterAll(async () => {
    for (const relPath of createdFiles) {
      try {
        const full = path.resolve(storageBase, relPath);
        if (fs.existsSync(full)) {
          fs.unlinkSync(full);
        }
      } catch {}
    }

    if (unauthTeacherId) {
      try {
        await db.delete(users).where(eq(users.id, unauthTeacherId));
      } catch {}
    }
  });

  function createTempUploadRequest(buffer: Buffer, filename: string, mime: string, token: string = superadminToken) {
    const formData = new FormData();
    formData.append("classId", String(testClassId));
    formData.append("mode", "letter_temp");
    formData.append("file", new File([new Uint8Array(buffer)], filename, { type: mime }));

    return new Request("http://localhost:3000/api/upload", {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: formData,
    });
  }

  function createCleanupRequest(filePaths: any, token: string = superadminToken) {
    return new Request("http://localhost:3000/api/upload/cleanup", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: JSON.stringify({ filePaths }),
    });
  }

  describe("1. Temporary Upload Mode (mode === 'letter_temp')", () => {
    it("should save image to {classId}/temp/{tempFileId}.webp and return tempFileId", async () => {
      const req = createTempUploadRequest(samplePngBuffer, "scan-temp.png", "image/png");
      const res = await POST(req as any);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.tempFileId).toBeDefined();
      expect(body.filePath).toMatch(new RegExp(`^${testClassId}/temp/${body.tempFileId}\\.webp$`));
      expect(body.mimeType).toBe("image/webp");
      createdFiles.push(body.filePath);

      const diskPath = path.resolve(storageBase, body.filePath);
      expect(fs.existsSync(diskPath)).toBe(true);
    });

    it("should save PDF to {classId}/temp/{tempFileId}.pdf and return tempFileId", async () => {
      const req = createTempUploadRequest(samplePdfBuffer, "scan-temp.pdf", "application/pdf");
      const res = await POST(req as any);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.tempFileId).toBeDefined();
      expect(body.filePath).toMatch(new RegExp(`^${testClassId}/temp/${body.tempFileId}\\.pdf$`));
      expect(body.mimeType).toBe("application/pdf");
      createdFiles.push(body.filePath);

      const diskPath = path.resolve(storageBase, body.filePath);
      expect(fs.existsSync(diskPath)).toBe(true);
    });

    it("should return 401 when uploading temporary file without authentication", async () => {
      const formData = new FormData();
      formData.append("classId", String(testClassId));
      formData.append("mode", "letter_temp");
      formData.append("file", new File([new Uint8Array(samplePngBuffer)], "scan-temp.png", { type: "image/png" }));

      const req = new Request("http://localhost:3000/api/upload", {
        method: "POST",
        body: formData,
      });

      const res = await POST(req as any);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toContain("Sesi tidak valid");
    });

    it("should return 403 when unauthorized wali_kelas uploads to another class", async () => {
      const req = createTempUploadRequest(samplePngBuffer, "unauth.png", "image/png", unauthorizedToken);
      const res = await POST(req as any);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toContain("tidak memiliki izin mengunggah");
    });
  });

  describe("2. Cleanup Endpoint (DELETE /api/upload/cleanup)", () => {
    it("should successfully remove existing temp files and report deletedCount", async () => {
      // First, upload 2 temporary files
      const req1 = createTempUploadRequest(samplePngBuffer, "del-1.png", "image/png");
      const res1 = await POST(req1 as any);
      const b1 = await res1.json();
      expect(b1.success).toBe(true);

      const req2 = createTempUploadRequest(samplePdfBuffer, "del-2.pdf", "application/pdf");
      const res2 = await POST(req2 as any);
      const b2 = await res2.json();
      expect(b2.success).toBe(true);

      const diskPath1 = path.resolve(storageBase, b1.filePath);
      const diskPath2 = path.resolve(storageBase, b2.filePath);
      expect(fs.existsSync(diskPath1)).toBe(true);
      expect(fs.existsSync(diskPath2)).toBe(true);

      // Now call cleanup
      const cleanReq = createCleanupRequest([b1.filePath, b2.filePath]);
      const cleanRes = await DELETE(cleanReq as any);
      expect(cleanRes.status).toBe(200);

      const cleanBody = await cleanRes.json();
      expect(cleanBody.success).toBe(true);
      expect(cleanBody.deletedCount).toBe(2);

      // Check disk: both should be removed
      expect(fs.existsSync(diskPath1)).toBe(false);
      expect(fs.existsSync(diskPath2)).toBe(false);
    });

    it("should reject path traversal attempts and never delete outside temp directory", async () => {
      // Create a dummy file outside temp directory
      const safeDir = path.resolve(storageBase, `${testClassId}/letters`);
      fs.mkdirSync(safeDir, { recursive: true });
      const safeFile = path.resolve(safeDir, "important.webp");
      fs.writeFileSync(safeFile, samplePngBuffer);
      createdFiles.push(`${testClassId}/letters/important.webp`);

      expect(fs.existsSync(safeFile)).toBe(true);

      const cleanReq = createCleanupRequest([
        `../etc/passwd`,
        `${testClassId}/letters/important.webp`,
        `${testClassId}/temp/../../letters/important.webp`,
        `/root/secret.webp`,
      ]);

      const cleanRes = await DELETE(cleanReq as any);
      expect(cleanRes.status).toBe(200);

      const cleanBody = await cleanRes.json();
      expect(cleanBody.success).toBe(true);
      expect(cleanBody.deletedCount).toBe(0);

      // Safe file outside temp must NOT be deleted
      expect(fs.existsSync(safeFile)).toBe(true);
    });

    it("should return 400 when filePaths is not an array", async () => {
      const cleanReq = new Request("http://localhost:3000/api/upload/cleanup", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${superadminToken}`,
        },
        body: JSON.stringify({ filePaths: "not-an-array" }),
      });

      const cleanRes = await DELETE(cleanReq as any);
      expect(cleanRes.status).toBe(400);
      const body = await cleanRes.json();
      expect(body.success).toBe(false);
    });

    it("should return 401 when cleanup is called without authentication", async () => {
      const cleanReq = new Request("http://localhost:3000/api/upload/cleanup", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ filePaths: [`${testClassId}/temp/any.webp`] }),
      });

      const cleanRes = await DELETE(cleanReq as any);
      expect(cleanRes.status).toBe(401);
      const body = await cleanRes.json();
      expect(body.error).toContain("Sesi tidak valid");
    });

    it("should refuse deletion and leave files on disk when unauthorized wali_kelas calls cleanup", async () => {
      const req = createTempUploadRequest(samplePngBuffer, "unauth-del.png", "image/png");
      const res = await POST(req as any);
      const b = await res.json();
      expect(b.success).toBe(true);
      createdFiles.push(b.filePath);

      const diskPath = path.resolve(storageBase, b.filePath);
      expect(fs.existsSync(diskPath)).toBe(true);

      const cleanReq = createCleanupRequest([b.filePath], unauthorizedToken);
      const cleanRes = await DELETE(cleanReq as any);
      expect(cleanRes.status).toBe(200);

      const cleanBody = await cleanRes.json();
      expect(cleanBody.success).toBe(true);
      expect(cleanBody.deletedCount).toBe(0);

      // File must NOT have been deleted
      expect(fs.existsSync(diskPath)).toBe(true);
    });

    it("should support POST method for sendBeacon / tab-close cleanup", async () => {
      const req = createTempUploadRequest(samplePngBuffer, "beacon-temp.png", "image/png");
      const res = await POST(req as any);
      const b = await res.json();
      expect(b.success).toBe(true);

      const diskPath = path.resolve(storageBase, b.filePath);
      expect(fs.existsSync(diskPath)).toBe(true);

      const beaconReq = new Request("http://localhost:3000/api/upload/cleanup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${superadminToken}`,
        },
        body: JSON.stringify({ filePaths: [b.filePath] }),
      });

      const beaconRes = await CLEANUP_POST(beaconReq as any);
      expect(beaconRes.status).toBe(200);
      const beaconBody = await beaconRes.json();
      expect(beaconBody.success).toBe(true);
      expect(beaconBody.deletedCount).toBe(1);
      expect(fs.existsSync(diskPath)).toBe(false);
    });

    it("should invalidate and delete Redis cache entries when temp file is cleaned up", async () => {
      const req = createTempUploadRequest(samplePngBuffer, "cached-temp.png", "image/png");
      const res = await POST(req as any);
      const b = await res.json();
      expect(b.success).toBe(true);

      const diskPath = path.resolve(storageBase, b.filePath);
      const fileBuf = fs.readFileSync(diskPath);
      const fileHash = crypto.createHash("sha256").update(fileBuf).digest("hex");
      const ocrCacheKey = `cache:ocr:letter:${fileHash}:${testClassId}`;
      const dedupKey = `dedup:upload:${fileHash}`;

      // Populate dummy cache
      await setCache(ocrCacheKey, { dummy: true }, 60);
      await setCache(dedupKey, { dummy: true }, 60);

      expect(await getCache(ocrCacheKey)).toBeDefined();
      expect(await getCache(dedupKey)).toBeDefined();

      const cleanReq = createCleanupRequest([b.filePath]);
      const cleanRes = await DELETE(cleanReq as any);
      expect(cleanRes.status).toBe(200);

      // Verify file and cache are both removed
      expect(fs.existsSync(diskPath)).toBe(false);
      expect(await getCache(ocrCacheKey)).toBeNull();
      expect(await getCache(dedupKey)).toBeNull();
    });

    it("should reject files > 15 MB in letter_temp mode but allow files up to 15 MB", async () => {
      // 11 MB dummy file (greater than 10MB default, within 15MB limit)
      const bigFile = new File([new Uint8Array(11 * 1024 * 1024)], "big-letter.pdf", {
        type: "application/pdf",
      });
      const formData = new FormData();
      formData.append("classId", String(testClassId));
      formData.append("mode", "letter_temp");
      formData.append("file", bigFile);

      const req = new Request("http://localhost:3000/api/upload", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${superadminToken}` },
        body: formData,
      });

      const uploadRes = await POST(req as any);
      // Since dummy content doesn't have %PDF- header, it will return 400 for PDF magic bytes,
      // NOT 413 file size error!
      expect(uploadRes.status).toBe(400);
      const body = await uploadRes.json();
      expect(body.error).toContain("File PDF tidak valid atau rusak.");

      // Now test file exceeding 15 MB
      const oversized = new File([new Uint8Array(16 * 1024 * 1024)], "oversized.pdf", {
        type: "application/pdf",
      });
      const overFormData = new FormData();
      overFormData.append("classId", String(testClassId));
      overFormData.append("mode", "letter_temp");
      overFormData.append("file", oversized);

      const overReq = new Request("http://localhost:3000/api/upload", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${superadminToken}` },
        body: overFormData,
      });

      const overRes = await POST(overReq as any);
      expect(overRes.status).toBe(413);
      const overBody = await overRes.json();
      expect(overBody.error).toContain("Maksimal 15 MB");
    });
  });
});
