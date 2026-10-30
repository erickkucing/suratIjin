import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { POST } from "../route";
import { db } from "@/db";
import { classes, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { initializeRedis, disconnectRedis, getCache, isRedisConnected } from "@/lib/redis";
import path from "path";
import fs from "fs";
import crypto from "crypto";

describe("File Upload Deduplication & Soft Fallback (/api/upload)", () => {
  let token: string;
  let testClassId: number;
  const storageBase = process.env.STORAGE_PATH || "./storage/uploads";
  const createdFiles: string[] = [];

  // Valid 1x1 PNG image buffer
  const samplePngBuffer = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2d420000000049454e44ae426082",
    "hex"
  );

  // Minimal valid PDF buffer
  const samplePdfBuffer = Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\nxref\n0 3\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n115\n%%EOF"
  );

  beforeAll(async () => {
    const adminUser = await db.query.users.findFirst({
      where: eq(users.role, "superadmin"),
    });
    if (!adminUser) throw new Error("Superadmin user not found");

    token = await createSessionToken({
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      role: adminUser.role,
    });

    const cls = await db.query.classes.findFirst();
    if (!cls) throw new Error("Class not found");
    testClassId = cls.id;
  });

  afterAll(async () => {
    await disconnectRedis();
    // Cleanup any created disk files
    for (const relPath of createdFiles) {
      try {
        const full = path.resolve(storageBase, relPath);
        if (fs.existsSync(full)) {
          fs.unlinkSync(full);
        }
      } catch {
        // ignore
      }
    }
  });

  function createUploadRequest(buffer: Buffer, filename: string, mime: string) {
    const formData = new FormData();
    formData.append("classId", String(testClassId));
    formData.append("file", new File([new Uint8Array(buffer)], filename, { type: mime }));

    return new Request("http://localhost:3000/api/upload", {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: formData,
    });
  }

  it("should upload file on cache miss and return deduplicated path on duplicate upload", async () => {
    await initializeRedis("redis://127.0.0.1:6379");

    // 1. First upload
    const req1 = createUploadRequest(samplePngBuffer, "test-letter.png", "image/png");
    const res1 = await POST(req1 as any);
    expect(res1.status).toBe(200);

    const body1 = await res1.json();
    expect(body1.success).toBe(true);
    expect(body1.filePath).toBeDefined();
    expect(body1.deduplicated).toBeUndefined();
    createdFiles.push(body1.filePath);

    // Verify file actually exists on disk
    const fullPath1 = path.resolve(storageBase, body1.filePath);
    expect(fs.existsSync(fullPath1)).toBe(true);

    // Verify Redis dedup key exists
    const fileHash = crypto.createHash("sha256").update(samplePngBuffer).digest("hex");
    const cachedPointer = await getCache<string>(`dedup:upload:${fileHash}`);
    expect(cachedPointer).toBe(body1.filePath);

    // 2. Second upload with identical buffer
    const req2 = createUploadRequest(samplePngBuffer, "test-letter-copy.png", "image/png");
    const res2 = await POST(req2 as any);
    expect(res2.status).toBe(200);

    const body2 = await res2.json();
    expect(body2.success).toBe(true);
    expect(body2.filePath).toBe(body1.filePath); // Exact same file path returned!
    expect(body2.deduplicated).toBe(true);
  });

  it("should re-save file if cached entry exists in Redis but file was removed from disk", async () => {
    await initializeRedis("redis://127.0.0.1:6379");

    // Generate unique valid PDF buffer for this test
    const uniqueId = crypto.randomBytes(8).toString("hex");
    const uniquePdf = Buffer.from(
      `%PDF-1.4\n% Unique: ${uniqueId}\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\nxref\n0 3\n0000000000 65535 f \n0000000025 00000 n \n0000000074 00000 n \ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n131\n%%EOF`
    );

    const req1 = createUploadRequest(uniquePdf, "unique.pdf", "application/pdf");
    const res1 = await POST(req1 as any);
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.success).toBe(true);
    createdFiles.push(body1.filePath);

    const fullPath1 = path.resolve(storageBase, body1.filePath);
    expect(fs.existsSync(fullPath1)).toBe(true);

    // Simulate disk pruning / manual deletion
    fs.unlinkSync(fullPath1);
    expect(fs.existsSync(fullPath1)).toBe(false);

    // Upload identical buffer again
    const req2 = createUploadRequest(uniquePdf, "unique-again.pdf", "application/pdf");
    const res2 = await POST(req2 as any);
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.success).toBe(true);
    createdFiles.push(body2.filePath);

    // Because disk file was missing, it should NOT return deduplicated: true
    expect(body2.deduplicated).toBeUndefined();
    // And new file must exist on disk!
    const fullPath2 = path.resolve(storageBase, body2.filePath);
    expect(fs.existsSync(fullPath2)).toBe(true);
  });

  it("should upload PDF files properly and support deduplication", async () => {
    await initializeRedis("redis://127.0.0.1:6379");

    const req1 = createUploadRequest(samplePdfBuffer, "sample.pdf", "application/pdf");
    const res1 = await POST(req1 as any);
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.success).toBe(true);
    expect(body1.mimeType).toBe("application/pdf");
    createdFiles.push(body1.filePath);

    // Duplicate PDF upload
    const req2 = createUploadRequest(samplePdfBuffer, "sample-dup.pdf", "application/pdf");
    const res2 = await POST(req2 as any);
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.success).toBe(true);
    expect(body2.deduplicated).toBe(true);
    expect(body2.filePath).toBe(body1.filePath);
  });

  it("should seamlessly fallback and save file when Redis is disconnected", async () => {
    await disconnectRedis();
    expect(isRedisConnected()).toBe(false);

    const uniqueId = crypto.randomBytes(8).toString("hex");
    const fallbackPdf = Buffer.from(
      `%PDF-1.4\n% Fallback: ${uniqueId}\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\nxref\n0 3\n0000000000 65535 f \n0000000027 00000 n \n0000000076 00000 n \ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n133\n%%EOF`
    );

    const req = createUploadRequest(fallbackPdf, "fallback.pdf", "application/pdf");
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.filePath).toBeDefined();
    createdFiles.push(body.filePath);

    const fullPath = path.resolve(storageBase, body.filePath);
    expect(fs.existsSync(fullPath)).toBe(true);
  });

  it("should reject invalid file format or corrupted PDF with 400", async () => {
    const corruptBuffer = Buffer.from("NOT_A_VALID_MAGIC_BYTES_AT_ALL");
    const req = createUploadRequest(corruptBuffer, "fake.jpg", "image/jpeg");
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });
});
