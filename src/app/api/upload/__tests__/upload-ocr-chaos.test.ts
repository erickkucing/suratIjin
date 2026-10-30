import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { POST as uploadPOST } from "../route";
import { POST as ocrPOST } from "@/app/api/ocr/letter/route";
import {
  getClassDashboardData,
  getAdminOverviewData,
  invalidateClassDashboardCache,
  invalidateAdminOverviewCache,
  getClassDashboardCacheKey,
} from "@/db/queries";
import {
  getSystemSettings,
  invalidateSystemSettingsCache,
  _resetSystemSettingsCacheForTesting,
} from "@/lib/system-settings";
import {
  initializeRedis,
  disconnectRedis,
  getCache,
  setCache,
  deleteCache,
  deleteCachePattern,
  isRedisConnected,
  getRedisClient,
  _resetRedisStateForTesting,
} from "@/lib/redis";
import { db } from "@/db";
import { classes, users, students, systemSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import path from "path";
import fs from "fs";
import crypto from "crypto";

describe("Empirical Challenger M3-2: OCR, Upload Deduplication, Self-Healing & Fallback Chaos", () => {
  const REAL_REDIS_URL = "redis://127.0.0.1:6379";
  const storageBase = process.env.STORAGE_PATH || "./storage/uploads";
  const createdFiles: string[] = [];

  let token: string;
  let testClassId1: number;
  let testClassId2: number;
  let superadminUser: any;

  // Distinct valid PNG images
  const pngImageA = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2d420000000049454e44ae426082",
    "hex"
  );
  // Distinct valid PNG image B (2x1 px)
  const pngImageB = Buffer.from(
    "89504e470d0a1a0a0000000d4948445200000002000000010806000000f40d04b70000000c49444154789c6360000200000a00020d0a2d420000000049454e44ae426082",
    "hex"
  );

  // Minimal valid PDF documents
  const samplePdfA = Buffer.from(
    "%PDF-1.4\n% PDF Document A\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\nxref\n0 3\n0000000000 65535 f \n0000000026 00000 n \n0000000075 00000 n \ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n132\n%%EOF"
  );
  const samplePdfB = Buffer.from(
    "%PDF-1.4\n% PDF Document B\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\nxref\n0 3\n0000000000 65535 f \n0000000026 00000 n \n0000000075 00000 n \ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n132\n%%EOF"
  );

  beforeAll(async () => {
    superadminUser = await db.query.users.findFirst({
      where: eq(users.role, "superadmin"),
    });
    if (!superadminUser) throw new Error("Superadmin user not found");

    token = await createSessionToken({
      id: superadminUser.id,
      username: superadminUser.username,
      displayName: superadminUser.displayName,
      role: superadminUser.role,
    });

    const allClasses = await db.query.classes.findMany({ limit: 2 });
    if (!allClasses || allClasses.length === 0) throw new Error("No classes found");
    testClassId1 = allClasses[0].id;
    testClassId2 = allClasses.length > 1 ? allClasses[1].id : allClasses[0].id + 999;
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    await initializeRedis(REAL_REDIS_URL);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (isRedisConnected()) {
      try {
        await deleteCachePattern("cache:ocr:letter:*");
        await deleteCachePattern("dedup:upload:*");
        await deleteCachePattern("cache:dashboard:*");
        await deleteCachePattern("cache:settings:*");
      } catch {}
    }
    await disconnectRedis();
    _resetRedisStateForTesting();
    await _resetSystemSettingsCacheForTesting();
  });

  afterAll(async () => {
    await disconnectRedis();
    _resetRedisStateForTesting();

    // Clean up all disk files created during testing
    for (const relPath of createdFiles) {
      try {
        const full = path.resolve(storageBase, relPath);
        if (fs.existsSync(full)) {
          fs.unlinkSync(full);
        }
      } catch {}
    }
  });

  function createUploadReq(buffer: Buffer, filename: string, mime: string, classId = testClassId1) {
    const formData = new FormData();
    formData.append("classId", String(classId));
    formData.append("file", new File([new Uint8Array(buffer)], filename, { type: mime }));

    return new Request("http://localhost:3000/api/upload", {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: formData,
    });
  }

  function createOcrReq(buffer: Buffer, filename: string, mime: string, classId = testClassId1) {
    const formData = new FormData();
    formData.append("classId", String(classId));
    formData.append("file", new File([new Uint8Array(buffer)], filename, { type: mime }));

    return new Request("http://localhost:3000/api/ocr/letter", {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: formData,
    });
  }

  // ==========================================================================
  // SECTION 1: OCR Hash Caching Empirical Verification
  // ==========================================================================
  describe("1. OCR Hash Caching Empirical Verification", () => {
    it("1.1 stores OCR inference in Redis, serves cache hit on duplicate, and isolates by file hash", async () => {
      let liveInferenceCalls = 0;
      const originalFetch = global.fetch;

      global.fetch = async (url: any, opts: any) => {
        liveInferenceCalls++;
        return new Response(
          JSON.stringify({
            success: true,
            detected: {
              status: "Sakit",
              candidateName: "Siswa Uji Coba OCR",
              startDate: "2026-10-30",
              endDate: "2026-10-31",
              isMultiDay: true,
            },
            processing_time_seconds: 0.35,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      try {
        const fileHashA = crypto.createHash("sha256").update(pngImageA).digest("hex");
        const cacheKeyA = `cache:ocr:letter:${fileHashA}:${testClassId1}`;
        await deleteCache(cacheKeyA);

        // 1. First upload of Letter A -> Cache Miss -> Invokes live inference
        const resA1 = await ocrPOST(createOcrReq(pngImageA, "letterA.png", "image/png") as any);
        expect(resA1.status).toBe(200);
        const jsonA1 = await resA1.json();
        expect(jsonA1.success).toBe(true);
        expect(jsonA1.cached).toBeUndefined(); // First time: live inference
        expect(liveInferenceCalls).toBe(1);

        // Verify key exists directly in Redis
        const cachedInRedisA = await getCache<{ detected: any }>(cacheKeyA);
        expect(cachedInRedisA).not.toBeNull();
        expect(cachedInRedisA?.detected?.candidateName).toBe("Siswa Uji Coba OCR");

        // Verify TTL in Redis (should be <= 86400 and > 86000)
        const redisClient = getRedisClient();
        expect(redisClient).not.toBeNull();
        const ttlA = await redisClient!.ttl(cacheKeyA);
        expect(ttlA).toBeGreaterThan(86000);
        expect(ttlA).toBeLessThanOrEqual(86400);

        // 2. Second upload of identical Letter A -> Cache Hit -> Zero new inference calls!
        const resA2 = await ocrPOST(createOcrReq(pngImageA, "letterA_dup.png", "image/png") as any);
        expect(resA2.status).toBe(200);
        const jsonA2 = await resA2.json();
        expect(jsonA2.success).toBe(true);
        expect(jsonA2.cached).toBe(true);
        expect(jsonA2.detected.candidateName).toBe("Siswa Uji Coba OCR");
        expect(liveInferenceCalls).toBe(1); // Fetch count MUST NOT increment!

        // 3. Upload distinct Letter B -> Cache Miss -> Different key and new inference call
        const fileHashB = crypto.createHash("sha256").update(pngImageB).digest("hex");
        const cacheKeyB = `cache:ocr:letter:${fileHashB}:${testClassId1}`;
        expect(cacheKeyB).not.toBe(cacheKeyA);

        const resB = await ocrPOST(createOcrReq(pngImageB, "letterB.png", "image/png") as any);
        expect(resB.status).toBe(200);
        const jsonB = await resB.json();
        expect(jsonB.success).toBe(true);
        expect(jsonB.cached).toBeUndefined();
        expect(liveInferenceCalls).toBe(2);

        const cachedInRedisB = await getCache<{ detected: any }>(cacheKeyB);
        expect(cachedInRedisB).not.toBeNull();
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("1.2 properly isolates OCR cache by classId (cross-class tenant scoping)", async () => {
      let liveInferenceCalls = 0;
      const originalFetch = global.fetch;

      global.fetch = async () => {
        liveInferenceCalls++;
        return new Response(
          JSON.stringify({
            success: true,
            detected: { status: "Izin", candidateName: "Cross Class Student" },
            processing_time_seconds: 0.2,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      try {
        const fileHash = crypto.createHash("sha256").update(pngImageA).digest("hex");
        const cacheKeyClass1 = `cache:ocr:letter:${fileHash}:${testClassId1}`;
        const cacheKeyClass2 = `cache:ocr:letter:${fileHash}:${testClassId2}`;
        await deleteCache(cacheKeyClass1);
        await deleteCache(cacheKeyClass2);

        // Upload for Class 1 -> Live call 1
        const res1 = await ocrPOST(createOcrReq(pngImageA, "letter.png", "image/png", testClassId1) as any);
        expect(res1.status).toBe(200);
        expect(liveInferenceCalls).toBe(1);

        // Upload same file for Class 2 -> Even though hash is same, classId is different -> Live call 2
        const res2 = await ocrPOST(createOcrReq(pngImageA, "letter.png", "image/png", testClassId2) as any);
        expect(res2.status).toBe(200);
        expect(liveInferenceCalls).toBe(2);

        // Verify both distinct keys exist in Redis
        const cached1 = await getCache(cacheKeyClass1);
        const cached2 = await getCache(cacheKeyClass2);
        expect(cached1).not.toBeNull();
        expect(cached2).not.toBeNull();
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("1.3 handles corrupted cache entry in Redis gracefully without 500 error", async () => {
      let liveInferenceCalls = 0;
      const originalFetch = global.fetch;

      global.fetch = async () => {
        liveInferenceCalls++;
        return new Response(
          JSON.stringify({
            success: true,
            detected: { status: "Sakit", candidateName: "Recovered From Corrupt Cache" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      try {
        const fileHash = crypto.createHash("sha256").update(pngImageA).digest("hex");
        const cacheKey = `cache:ocr:letter:${fileHash}:${testClassId1}`;

        // Directly inject invalid/corrupted JSON string into Redis key
        const client = getRedisClient();
        await client!.set(cacheKey, "CORRUPTED_NON_JSON_VALUE");

        // System should catch JSON parse error in getCache, fall through, and run live inference
        const res = await ocrPOST(createOcrReq(pngImageA, "corrupt.png", "image/png") as any);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
        expect(json.detected.candidateName).toBe("Recovered From Corrupt Cache");
        expect(liveInferenceCalls).toBe(1);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  // ==========================================================================
  // SECTION 2: File Upload Deduplication Empirical Verification
  // ==========================================================================
  describe("2. File Upload Deduplication Empirical Verification", () => {
    it("2.1 saves file on initial upload and returns deduplicated: true with 0 disk writes on duplicate upload", async () => {
      // 1. Initial upload of unique PNG image
      const uniquePng = Buffer.from(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2d420000000049454e44ae426082",
        "hex"
      );
      // Append unique bytes within an ancillary safe PNG chunk or use unique hash
      const uniqueSuffix = crypto.randomBytes(8);
      const compositePng = Buffer.concat([uniquePng, uniqueSuffix]);

      const res1 = await uploadPOST(createUploadReq(compositePng, "orig.png", "image/png") as any);
      expect(res1.status).toBe(200);
      const body1 = await res1.json();
      expect(body1.success).toBe(true);
      expect(body1.filePath).toBeDefined();
      expect(body1.deduplicated).toBeUndefined();
      createdFiles.push(body1.filePath);

      const diskPath1 = path.resolve(storageBase, body1.filePath);
      expect(fs.existsSync(diskPath1)).toBe(true);

      const targetDir = path.dirname(diskPath1);
      const fileCountBefore = fs.readdirSync(targetDir).length;

      // Verify Redis deduplication key
      const fileHash = crypto.createHash("sha256").update(compositePng).digest("hex");
      const dedupKey = `dedup:upload:${fileHash}`;
      const cachedPointer = await getCache<string>(dedupKey);
      expect(cachedPointer).toBe(body1.filePath);

      // Verify TTL (30 days = 2592000s)
      const client = getRedisClient();
      const ttl = await client!.ttl(dedupKey);
      expect(ttl).toBeGreaterThan(2500000);
      expect(ttl).toBeLessThanOrEqual(2592000);

      // 2. Duplicate upload of identical buffer
      const res2 = await uploadPOST(createUploadReq(compositePng, "dup.png", "image/png") as any);
      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(body2.success).toBe(true);
      expect(body2.deduplicated).toBe(true);
      expect(body2.filePath).toBe(body1.filePath);

      // Verify ZERO new files were created on disk
      const fileCountAfter = fs.readdirSync(targetDir).length;
      expect(fileCountAfter).toBe(fileCountBefore);
    });

    it("2.2 supports PDF file upload deduplication properly", async () => {
      const res1 = await uploadPOST(createUploadReq(samplePdfA, "documentA.pdf", "application/pdf") as any);
      expect(res1.status).toBe(200);
      const body1 = await res1.json();
      expect(body1.success).toBe(true);
      expect(body1.mimeType).toBe("application/pdf");
      expect(body1.filePath.endsWith(".pdf")).toBe(true);
      createdFiles.push(body1.filePath);

      // Duplicate PDF upload
      const res2 = await uploadPOST(createUploadReq(samplePdfA, "documentA_copy.pdf", "application/pdf") as any);
      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(body2.success).toBe(true);
      expect(body2.deduplicated).toBe(true);
      expect(body2.filePath).toBe(body1.filePath);
    });

    it("2.3 distinguishes different files with separate disk files and distinct cache keys", async () => {
      const resA = await uploadPOST(createUploadReq(samplePdfA, "pdfA.pdf", "application/pdf") as any);
      const resB = await uploadPOST(createUploadReq(pngImageA, "imageA.png", "image/png") as any);

      const bodyA = await resA.json();
      const bodyB = await resB.json();

      createdFiles.push(bodyA.filePath, bodyB.filePath);

      expect(bodyA.filePath).not.toBe(bodyB.filePath);

      const hashA = crypto.createHash("sha256").update(samplePdfA).digest("hex");
      const hashB = crypto.createHash("sha256").update(pngImageA).digest("hex");
      expect(hashA).not.toBe(hashB);

      const ptrA = await getCache<string>(`dedup:upload:${hashA}`);
      const ptrB = await getCache<string>(`dedup:upload:${hashB}`);
      expect(ptrA).toBe(bodyA.filePath);
      expect(ptrB).toBe(bodyB.filePath);
    });
  });

  // ==========================================================================
  // SECTION 3: Self-Healing Disk Verification
  // ==========================================================================
  describe("3. Self-Healing Disk Verification", () => {
    it("3.1 detects missing disk file when Redis key exists, re-saves to disk, and updates pointer", async () => {
      const uniquePdf = Buffer.from(
        `%PDF-1.4\n% Self-heal test ${Date.now()}\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\nxref\n0 3\n0000000000 65535 f \n0000000030 00000 n \n0000000079 00000 n \ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n136\n%%EOF`
      );
      const fileHash = crypto.createHash("sha256").update(uniquePdf).digest("hex");
      const dedupKey = `dedup:upload:${fileHash}`;

      // Step 1: Upload file initially
      const res1 = await uploadPOST(createUploadReq(uniquePdf, "selfheal.pdf", "application/pdf") as any);
      expect(res1.status).toBe(200);
      const body1 = await res1.json();
      expect(body1.success).toBe(true);
      createdFiles.push(body1.filePath);

      const originalDiskPath = path.resolve(storageBase, body1.filePath);
      expect(fs.existsSync(originalDiskPath)).toBe(true);

      // Verify Redis key is set
      const cachedBefore = await getCache<string>(dedupKey);
      expect(cachedBefore).toBe(body1.filePath);

      // Step 2: Manually delete file from disk while Redis key remains intact
      fs.unlinkSync(originalDiskPath);
      expect(fs.existsSync(originalDiskPath)).toBe(false);

      // Step 3: Upload identical file again -> System should detect missing file and re-save!
      const res2 = await uploadPOST(createUploadReq(uniquePdf, "selfheal.pdf", "application/pdf") as any);
      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(body2.success).toBe(true);
      expect(body2.deduplicated).toBeUndefined(); // MUST NOT return deduplicated: true!
      createdFiles.push(body2.filePath);

      // Verify re-saved file exists on disk
      const newDiskPath = path.resolve(storageBase, body2.filePath);
      expect(fs.existsSync(newDiskPath)).toBe(true);

      // Verify Redis cache pointer was updated to the new path
      const cachedAfter = await getCache<string>(dedupKey);
      expect(cachedAfter).toBe(body2.filePath);

      // Step 4: Third upload immediately after re-saving -> now returns deduplicated: true!
      const res3 = await uploadPOST(createUploadReq(uniquePdf, "selfheal.pdf", "application/pdf") as any);
      expect(res3.status).toBe(200);
      const body3 = await res3.json();
      expect(body3.success).toBe(true);
      expect(body3.deduplicated).toBe(true);
      expect(body3.filePath).toBe(body2.filePath);
    });

    it("3.2 self-heals safely against path traversal attempts in cached pointer", async () => {
      const maliciousBuffer = Buffer.from(
        `%PDF-1.4\n% Path Traversal Defense Test ${Date.now()}\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\nxref\n0 3\n0000000000 65535 f \n0000000045 00000 n \n0000000094 00000 n \ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n151\n%%EOF`
      );
      const fileHash = crypto.createHash("sha256").update(maliciousBuffer).digest("hex");
      const dedupKey = `dedup:upload:${fileHash}`;

      // Poison the Redis cache key with a path traversal relative path
      await setCache(dedupKey, "../../etc/passwd", 3600);

      // Upload file -> System's isSafePath check must reject "../../etc/passwd" and write safely to disk
      const res = await uploadPOST(createUploadReq(maliciousBuffer, "safe.pdf", "application/pdf") as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.deduplicated).toBeUndefined();
      expect(body.filePath).not.toContain("..");
      createdFiles.push(body.filePath);

      const fullDisk = path.resolve(storageBase, body.filePath);
      expect(fs.existsSync(fullDisk)).toBe(true);
    });
  });

  // ==========================================================================
  // SECTION 4: Soft Fallback Chaos Verification (Offline & Throwing Redis)
  // ==========================================================================
  describe("4. Soft Fallback Chaos Verification (Offline & Throwing Redis)", () => {
    it("4.1 Upload API: 100% silent fallback when Redis throws network errors during getCache or setCache", async () => {
      const client = getRedisClient();
      expect(client).not.toBeNull();

      // Case A: getCache throws ECONNRESET mid-flight
      vi.spyOn(client!, "get").mockRejectedValueOnce(new Error("ECONNRESET: Connection reset by peer"));

      const uniquePdf1 = Buffer.from(
        `%PDF-1.4\n% Chaos getCache ${Date.now()}\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\nxref\n0 3\n0000000000 65535 f \n0000000030 00000 n \n0000000079 00000 n \ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n136\n%%EOF`
      );
      const res1 = await uploadPOST(createUploadReq(uniquePdf1, "chaos1.pdf", "application/pdf") as any);
      expect(res1.status).toBe(200);
      const body1 = await res1.json();
      expect(body1.success).toBe(true);
      expect(body1.filePath).toBeDefined();
      createdFiles.push(body1.filePath);
      expect(fs.existsSync(path.resolve(storageBase, body1.filePath))).toBe(true);

      // Case B: setCache throws ETIMEDOUT mid-flight
      vi.spyOn(client!, "set").mockRejectedValueOnce(new Error("ETIMEDOUT: Socket write timeout"));

      const uniquePdf2 = Buffer.from(
        `%PDF-1.4\n% Chaos setCache ${Date.now()}\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\nxref\n0 3\n0000000000 65535 f \n0000000030 00000 n \n0000000079 00000 n \ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n136\n%%EOF`
      );
      const res2 = await uploadPOST(createUploadReq(uniquePdf2, "chaos2.pdf", "application/pdf") as any);
      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(body2.success).toBe(true);
      createdFiles.push(body2.filePath);
      expect(fs.existsSync(path.resolve(storageBase, body2.filePath))).toBe(true);
    });

    it("4.2 Upload API: 100% silent fallback when Redis is completely disconnected", async () => {
      await disconnectRedis();
      expect(isRedisConnected()).toBe(false);

      const uniquePdf = Buffer.from(
        `%PDF-1.4\n% Disconnected test ${Date.now()}\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\nxref\n0 3\n0000000000 65535 f \n0000000030 00000 n \n0000000079 00000 n \ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n136\n%%EOF`
      );
      const res = await uploadPOST(createUploadReq(uniquePdf, "offline.pdf", "application/pdf") as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      createdFiles.push(body.filePath);
      expect(fs.existsSync(path.resolve(storageBase, body.filePath))).toBe(true);
    });

    it("4.3 OCR API: 100% silent fallback when Redis throws or is disconnected", async () => {
      const originalFetch = global.fetch;
      global.fetch = async () => {
        return new Response(
          JSON.stringify({
            success: true,
            detected: { status: "Izin", candidateName: "Fallback OCR Student" },
            processing_time_seconds: 0.1,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      try {
        // Disconnect Redis
        await disconnectRedis();
        expect(isRedisConnected()).toBe(false);

        const res = await ocrPOST(createOcrReq(pngImageA, "offline-ocr.png", "image/png") as any);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
        expect(json.detected.candidateName).toBe("Fallback OCR Student");
        expect(json.cached).toBeUndefined(); // Live fallback executed
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("4.4 Query Caching (getClassDashboardData & getAdminOverviewData): transparent soft fallback when Redis is disconnected", async () => {
      await disconnectRedis();
      expect(isRedisConnected()).toBe(false);

      // Query dashboard directly without Redis
      const dashboard = await getClassDashboardData(testClassId1);
      expect(dashboard).not.toBeNull();
      expect(dashboard.classInfo).toBeDefined();
      expect(dashboard.summary).toBeDefined();
      expect(typeof dashboard.summary.totalRecords).toBe("number");

      // Query admin overview directly without Redis
      const overview = await getAdminOverviewData();
      expect(overview).not.toBeNull();
      expect(Array.isArray(overview.classes)).toBe(true);
      expect(Array.isArray(overview.teachers)).toBe(true);

      // Invalidation functions with Redis offline must not throw
      await expect(invalidateClassDashboardCache(testClassId1)).resolves.not.toThrow();
      await expect(invalidateAdminOverviewCache()).resolves.not.toThrow();
    });

    it("4.5 Query Caching: transparent soft fallback when Redis throws runtime socket exceptions", async () => {
      const client = getRedisClient();
      expect(client).not.toBeNull();

      // Mock get to reject
      vi.spyOn(client!, "get").mockRejectedValue(new Error("WRONGTYPE Operation against a key"));
      vi.spyOn(client!, "set").mockRejectedValue(new Error("OOM command not allowed when used memory > 'maxmemory'"));

      // getClassDashboardData should catch Redis error and return data from MySQL
      const dashboard = await getClassDashboardData(testClassId1);
      expect(dashboard).not.toBeNull();
      expect(dashboard.classInfo.id).toBe(testClassId1);

      // getAdminOverviewData should catch Redis error and return data from MySQL
      const overview = await getAdminOverviewData();
      expect(overview).not.toBeNull();
      expect(overview.classes.length).toBeGreaterThan(0);
    });

    it("4.6 System Settings: transparent soft fallback and in-memory caching when Redis fails", async () => {
      await disconnectRedis();
      expect(isRedisConnected()).toBe(false);

      // 1. Fetch system settings with Redis offline
      const settings1 = await getSystemSettings();
      expect(settings1).not.toBeNull();
      expect(settings1.appName).toBeDefined();
      expect(typeof settings1.aiEnabled).toBe("boolean");

      // 2. Invalidate system settings cache with Redis offline
      await expect(invalidateSystemSettingsCache()).resolves.not.toThrow();

      // 3. Second fetch after invalidate
      const settings2 = await getSystemSettings();
      expect(settings2).not.toBeNull();
      expect(settings2.appName).toBe(settings1.appName);
    });

    it("4.7 Circuit Breaker: trips to OPEN after 3 consecutive errors and immediately short-circuits Redis", async () => {
      const client = getRedisClient();
      expect(client).not.toBeNull();

      vi.spyOn(client!, "get").mockRejectedValue(new Error("ClusterDownException: Cluster is down"));

      // 3 consecutive failures to trip circuit breaker
      await getCache("chaos:key:1");
      await getCache("chaos:key:2");
      await getCache("chaos:key:3");

      // Verify circuit breaker tripped to OPEN
      const globalState = (globalThis as any).__suratIjinRedisState;
      expect(globalState).toBeDefined();
      expect(globalState.circuitBreaker.state).toBe("OPEN");
      expect(isRedisConnected()).toBe(false);

      // Subsequent getCache should immediately return null without invoking client.get
      const spy = vi.spyOn(client!, "get");
      const result = await getCache("chaos:key:shortcircuit");
      expect(result).toBeNull();
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
