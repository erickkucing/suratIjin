import { describe, it, expect, beforeEach, afterEach } from "vitest";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import {
  normalizeBoundingBox as normalizeCropBox,
  getImageMetadata,
  autoOrientImage,
  cropLetterToWebp,
  saveCroppedLetterToTemp,
  promoteTempLetterFile,
  cleanupExpiredTempFiles,
  deleteTempLetterFile,
} from "../letter-crop-storage";
import { normalizeBoundingBox as normalizeAiBox } from "../ai-router";
import { isValidLetterFilePath } from "../attendance-security";

describe("Milestone 1 Adversarial & Stress Challenge Suite", () => {
  const testStorageBase = path.resolve("./storage/test_stress_uploads");
  const testClassId = 42;

  beforeEach(() => {
    process.env.STORAGE_PATH = testStorageBase;
    if (fs.existsSync(testStorageBase)) {
      fs.rmSync(testStorageBase, { recursive: true, force: true });
    }
    fs.mkdirSync(testStorageBase, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testStorageBase)) {
      fs.rmSync(testStorageBase, { recursive: true, force: true });
    }
    delete process.env.STORAGE_PATH;
  });

  // =========================================================================
  // 1. Extreme Coordinate Normalization Stress Tests
  // =========================================================================
  describe("1. Coordinate Normalization Stress (letter-crop-storage & ai-router)", () => {
    const W = 1920;
    const H = 1080;

    describe("1.1 normalizeCropBox in letter-crop-storage", () => {
      it("handles completely negative coordinates without crash and clamps safely", () => {
        const box: [number, number, number, number] = [-500, -600, -100, -200];
        const res = normalizeCropBox(box, W, H);

        expect(res.left).toBeGreaterThanOrEqual(0);
        expect(res.top).toBeGreaterThanOrEqual(0);
        expect(res.left + res.width).toBeLessThanOrEqual(W);
        expect(res.top + res.height).toBeLessThanOrEqual(H);
        expect(res.width).toBeGreaterThanOrEqual(1);
        expect(res.height).toBeGreaterThanOrEqual(1);
      });

      it("handles huge out-of-bounds coordinates (> 1000 and > 100,000)", () => {
        const box: [number, number, number, number] = [2000, 3000, 50000, 99999];
        const res = normalizeCropBox(box, W, H);

        expect(res.left).toBeLessThan(W);
        expect(res.top).toBeLessThan(H);
        expect(res.left + res.width).toBeLessThanOrEqual(W);
        expect(res.top + res.height).toBeLessThanOrEqual(H);
        expect(res.width).toBeGreaterThanOrEqual(1);
        expect(res.height).toBeGreaterThanOrEqual(1);
      });

      it("handles inverted coordinates where ymin > ymax and xmin > xmax", () => {
        const box: [number, number, number, number] = [950, 850, 50, 150];
        const res = normalizeCropBox(box, W, H);

        expect(res.left).toBe(Math.floor((150 / 1000) * W));
        expect(res.top).toBe(Math.floor((50 / 1000) * H));
        expect(res.width).toBe(Math.floor(((850 - 150) / 1000) * W));
        expect(res.height).toBe(Math.floor(((950 - 50) / 1000) * H));
        expect(res.left + res.width).toBeLessThanOrEqual(W);
        expect(res.top + res.height).toBeLessThanOrEqual(H);
      });

      it("handles 0-pixel degenerate points safely (e.g. [500, 500, 500, 500])", () => {
        const pointBox: [number, number, number, number] = [500, 500, 500, 500];
        const res = normalizeCropBox(pointBox, W, H);

        expect(res.width).toBe(1);
        expect(res.height).toBe(1);
        expect(res.left + res.width).toBeLessThanOrEqual(W);
        expect(res.top + res.height).toBeLessThanOrEqual(H);
      });

      it("handles corner boundary degenerates ([0, 0, 0, 0] and [1000, 1000, 1000, 1000])", () => {
        const originBox: [number, number, number, number] = [0, 0, 0, 0];
        const resOrigin = normalizeCropBox(originBox, W, H);
        expect(resOrigin.left).toBe(0);
        expect(resOrigin.top).toBe(0);
        expect(resOrigin.width).toBe(1);
        expect(resOrigin.height).toBe(1);

        const maxBox: [number, number, number, number] = [1000, 1000, 1000, 1000];
        const resMax = normalizeCropBox(maxBox, W, H);
        expect(resMax.left).toBe(W - 1);
        expect(resMax.top).toBe(H - 1);
        expect(resMax.width).toBe(1);
        expect(resMax.height).toBe(1);
        expect(resMax.left + resMax.width).toBe(W);
        expect(resMax.top + resMax.height).toBe(H);
      });

      it("handles float scale corner degenerate [1.0, 1.0, 1.0, 1.0]", () => {
        const floatMax: [number, number, number, number] = [1.0, 1.0, 1.0, 1.0];
        const res = normalizeCropBox(floatMax, W, H);
        expect(res.left).toBe(W - 1);
        expect(res.top).toBe(H - 1);
        expect(res.width).toBe(1);
        expect(res.height).toBe(1);
        expect(res.left + res.width).toBe(W);
        expect(res.top + res.height).toBe(H);
      });

      it("handles dictionary objects with { left, top, width, height } and { top, left, bottom, right }", () => {
        const dict1 = { left: 100, top: 150, width: 400, height: 300 };
        const res1 = normalizeCropBox(dict1, W, H);
        expect(res1.left).toBeGreaterThanOrEqual(0);
        expect(res1.top).toBeGreaterThanOrEqual(0);
        expect(res1.left + res1.width).toBeLessThanOrEqual(W);
        expect(res1.top + res1.height).toBeLessThanOrEqual(H);

        const dict2 = { top: 0.1, left: 0.2, bottom: 0.8, right: 0.7 };
        const res2 = normalizeCropBox(dict2, W, H);
        expect(res2.left).toBe(Math.floor(0.2 * W));
        expect(res2.top).toBe(Math.floor(0.1 * H));
        expect(res2.left + res2.width).toBeLessThanOrEqual(W);
        expect(res2.top + res2.height).toBeLessThanOrEqual(H);
      });

      it("throws informative error on non-positive image dimensions", () => {
        expect(() => normalizeCropBox([10, 10, 100, 100], 0, 100)).toThrow(/tidak valid/);
        expect(() => normalizeCropBox([10, 10, 100, 100], 100, -50)).toThrow(/tidak valid/);
      });
    });

    describe("1.2 normalizeAiBox in ai-router", () => {
      it("rejects degenerate 0-pixel boxes by returning null (< 2% threshold)", () => {
        expect(normalizeAiBox([500, 500, 500, 500])).toBeNull();
        expect(normalizeAiBox([0, 0, 0, 0])).toBeNull();
        expect(normalizeAiBox([0.5, 0.5, 0.505, 0.505])).toBeNull(); // 0.5% dimension
      });

      it("accepts valid bounding boxes and scales 0-1000 to 0.0-1.0 float", () => {
        const res = normalizeAiBox([100, 200, 800, 900]);
        expect(res).not.toBeNull();
        expect(res![0]).toBeCloseTo(0.1);
        expect(res![1]).toBeCloseTo(0.2);
        expect(res![2]).toBeCloseTo(0.8);
        expect(res![3]).toBeCloseTo(0.9);
      });

      it("handles inverted coordinates in AI output correctly", () => {
        const res = normalizeAiBox([900, 800, 100, 200]);
        expect(res).not.toBeNull();
        expect(res![0]).toBeCloseTo(0.1); // min y
        expect(res![1]).toBeCloseTo(0.2); // min x
        expect(res![2]).toBeCloseTo(0.9); // max y
        expect(res![3]).toBeCloseTo(0.8); // max x
      });

      it("rejects invalid non-numeric inputs gracefully", () => {
        expect(normalizeAiBox(null)).toBeNull();
        expect(normalizeAiBox(undefined)).toBeNull();
        expect(normalizeAiBox("invalid")).toBeNull();
        expect(normalizeAiBox([100, "abc", 500, 600])).toBeNull();
        expect(normalizeAiBox([NaN, 100, 200, 300])).toBeNull();
        expect(normalizeAiBox([])).toBeNull();
      });
    });
  });

  // =========================================================================
  // 2. Unusual Image Dimensions & EXIF Rotation Stress Tests
  // =========================================================================
  describe("2. Unusual Image Dimensions & EXIF Orientations (cropLetterToWebp & autoOrientImage)", () => {
    it("successfully crops and encodes a 10x10 tiny image", async () => {
      const tinyBuffer = await sharp({
        create: {
          width: 10,
          height: 10,
          channels: 3,
          background: { r: 120, g: 60, b: 200 },
        },
      })
        .png()
        .toBuffer();

      const pixelBox = normalizeCropBox([1, 1, 9, 9], 10, 10);
      const cropped = await cropLetterToWebp(tinyBuffer, pixelBox);

      const meta = await sharp(cropped).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.width).toBe(pixelBox.width);
      expect(meta.height).toBe(pixelBox.height);
    });

    it("successfully crops a 1x1 minimal pixel image without Sharp errors", async () => {
      const pixel1Buffer = await sharp({
        create: {
          width: 1,
          height: 1,
          channels: 3,
          background: { r: 255, g: 255, b: 0 },
        },
      })
        .png()
        .toBuffer();

      const pixelBox = normalizeCropBox([0, 0, 1, 1], 1, 1);
      const cropped = await cropLetterToWebp(pixel1Buffer, pixelBox);

      const meta = await sharp(cropped).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.width).toBe(1);
      expect(meta.height).toBe(1);
    });

    it("successfully handles extreme aspect ratios (ultra-tall 20x1500 and ultra-wide 1500x20)", async () => {
      // Ultra-tall vertical strip
      const tallBuffer = await sharp({
        create: {
          width: 20,
          height: 1500,
          channels: 3,
          background: { r: 10, g: 200, b: 50 },
        },
      })
        .jpeg()
        .toBuffer();

      const tallBox = normalizeCropBox([100, 100, 900, 900], 20, 1500);
      const croppedTall = await cropLetterToWebp(tallBuffer, tallBox);
      const tallMeta = await sharp(croppedTall).metadata();
      expect(tallMeta.format).toBe("webp");
      expect(tallMeta.width).toBe(tallBox.width);
      expect(tallMeta.height).toBe(tallBox.height);

      // Ultra-wide horizontal banner
      const wideBuffer = await sharp({
        create: {
          width: 1500,
          height: 20,
          channels: 3,
          background: { r: 200, g: 10, b: 50 },
        },
      })
        .jpeg()
        .toBuffer();

      const wideBox = normalizeCropBox([100, 100, 900, 900], 1500, 20);
      const croppedWide = await cropLetterToWebp(wideBuffer, wideBox);
      const wideMeta = await sharp(croppedWide).metadata();
      expect(wideMeta.format).toBe("webp");
      expect(wideMeta.width).toBe(wideBox.width);
      expect(wideMeta.height).toBe(wideBox.height);
    });

    it("handles EXIF orientation tags correctly via autoOrientImage", async () => {
      // Create a 400x200 horizontal image with EXIF orientation 6 (90 deg CW)
      const rotatedJpeg = await sharp({
        create: {
          width: 400,
          height: 200,
          channels: 3,
          background: { r: 80, g: 90, b: 100 },
        },
      })
        .jpeg()
        .withMetadata({ orientation: 6 })
        .toBuffer();

      const metaBefore = await sharp(rotatedJpeg).metadata();
      expect(metaBefore.orientation).toBe(6);
      expect(metaBefore.width).toBe(400);
      expect(metaBefore.height).toBe(200);

      // autoOrientImage applies sharp.rotate() which converts 400x200 upright to 200x400
      const oriented = await autoOrientImage(rotatedJpeg);
      expect(oriented.width).toBe(200);
      expect(oriented.height).toBe(400);

      // Verify EXIF orientation tag was stripped so subsequent crops are not rotated again
      const metaAfter = await sharp(oriented.orientedBuffer).metadata();
      expect(metaAfter.orientation).toBeUndefined();
      expect(metaAfter.width).toBe(200);
      expect(metaAfter.height).toBe(400);
    });

    it("handles EXIF orientation 8 (90 deg CCW) correctly via autoOrientImage", async () => {
      const rotatedJpeg = await sharp({
        create: {
          width: 500,
          height: 300,
          channels: 3,
          background: { r: 120, g: 150, b: 180 },
        },
      })
        .jpeg()
        .withMetadata({ orientation: 8 })
        .toBuffer();

      const oriented = await autoOrientImage(rotatedJpeg);
      expect(oriented.width).toBe(300);
      expect(oriented.height).toBe(500);

      const metaAfter = await sharp(oriented.orientedBuffer).metadata();
      expect(metaAfter.orientation).toBeUndefined();
    });

    it("rejects corrupt or unreadable image buffers with clear error", async () => {
      const corruptBuffer = Buffer.from("THIS_IS_NOT_A_VALID_IMAGE_FILE_BUFFER");
      await expect(getImageMetadata(corruptBuffer)).rejects.toThrow();
    });
  });

  // =========================================================================
  // 3. Temp File Path Invariants & Path Traversal Security Tests
  // =========================================================================
  describe("3. Temp File Storage & Path Traversal Security Invariants", () => {
    it("sanitizes malicious path traversal payloads in customTempFileId", async () => {
      const testBuffer = await sharp({
        create: {
          width: 50,
          height: 50,
          channels: 3,
          background: { r: 10, g: 10, b: 10 },
        },
      })
        .webp()
        .toBuffer();

      // Test 1: directory traversal with ../../
      const maliciousId1 = "../../../etc/passwd";
      const saved1 = await saveCroppedLetterToTemp(testClassId, testBuffer, maliciousId1);

      expect(saved1.tempFileId).not.toContain("..");
      expect(saved1.tempFileId).not.toContain("/");
      expect(saved1.filePath).toBe(`${testClassId}/temp/${saved1.tempFileId}.webp`);
      expect(isValidLetterFilePath(saved1.filePath, testClassId)).toBe(true);
      expect(fs.existsSync(saved1.diskPath)).toBe(true);

      // Verify the file was written INSIDE storage/test_stress_uploads/42/temp, NOT in /etc
      expect(saved1.diskPath.startsWith(path.resolve(testStorageBase, String(testClassId), "temp"))).toBe(true);

      // Test 2: Windows backslash traversal ..\..\windows
      const maliciousId2 = "..\\..\\windows\\system32";
      const saved2 = await saveCroppedLetterToTemp(testClassId, testBuffer, maliciousId2);

      expect(saved2.tempFileId).not.toContain("\\");
      expect(isValidLetterFilePath(saved2.filePath, testClassId)).toBe(true);

      // Test 3: Null bytes or special characters
      const maliciousId3 = "temp\0bad!@#$%^&*()";
      const saved3 = await saveCroppedLetterToTemp(testClassId, testBuffer, maliciousId3);
      expect(saved3.tempFileId).toMatch(/^[a-zA-Z0-9_-]+$/);
    });

    it("rejects empty customTempFileId after sanitization", async () => {
      const testBuffer = await sharp({
        create: {
          width: 20,
          height: 20,
          channels: 3,
          background: { r: 5, g: 5, b: 5 },
        },
      })
        .webp()
        .toBuffer();

      // Only dots and slashes sanitize to empty string
      await expect(saveCroppedLetterToTemp(testClassId, testBuffer, "../../../")).rejects.toThrow(
        /tempFileId tidak boleh kosong/
      );
    });

    it("rejects invalid, negative, or non-numeric classId", async () => {
      const testBuffer = await sharp({
        create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 0, b: 0 } },
      })
        .webp()
        .toBuffer();

      await expect(saveCroppedLetterToTemp(0, testBuffer)).rejects.toThrow(/ID Kelas tidak valid/);
      await expect(saveCroppedLetterToTemp(-5, testBuffer)).rejects.toThrow(/ID Kelas tidak valid/);
      await expect(saveCroppedLetterToTemp(NaN, testBuffer)).rejects.toThrow(/ID Kelas tidak valid/);
    });

    it("strictly enforces cross-class access isolation via isValidLetterFilePath", async () => {
      const classA = 101;
      const classB = 102;

      const testBuffer = await sharp({
        create: { width: 20, height: 20, channels: 3, background: { r: 0, g: 0, b: 0 } },
      })
        .webp()
        .toBuffer();

      const savedA = await saveCroppedLetterToTemp(classA, testBuffer);

      // Path belonging to class A MUST be valid for class A
      expect(isValidLetterFilePath(savedA.filePath, classA)).toBe(true);

      // Path belonging to class A MUST BE REJECTED for class B (cross-class leak prevention)
      expect(isValidLetterFilePath(savedA.filePath, classB)).toBe(false);

      // Any path with traversal characters must be rejected
      expect(isValidLetterFilePath(`${classA}/../${classB}/temp/file.webp`, classA)).toBe(false);
      expect(isValidLetterFilePath(`${classA}\\temp\\file.webp`, classA)).toBe(false);
    });

    it("safely promotes temp file and removes the temporary artifact", async () => {
      const testBuffer = await sharp({
        create: { width: 40, height: 40, channels: 3, background: { r: 30, g: 60, b: 90 } },
      })
        .webp()
        .toBuffer();

      const saved = await saveCroppedLetterToTemp(testClassId, testBuffer);
      expect(fs.existsSync(saved.diskPath)).toBe(true);

      const promoted = await promoteTempLetterFile(testClassId, saved.tempFileId);

      // Permanent path verification
      expect(promoted.permanentFilePath.startsWith(`${testClassId}/`)).toBe(true);
      expect(isValidLetterFilePath(promoted.permanentFilePath, testClassId)).toBe(true);
      expect(fs.existsSync(promoted.permanentDiskPath)).toBe(true);

      // Old temp file must have been moved or unlinked
      expect(fs.existsSync(saved.diskPath)).toBe(false);
    });

    it("fails safely when promoting non-existent or maliciously named temp files", async () => {
      await expect(promoteTempLetterFile(testClassId, "../../../etc/passwd")).rejects.toThrow(
        /tidak ditemukan/
      );
      await expect(promoteTempLetterFile(testClassId, "non_existent_file_99999")).rejects.toThrow(
        /tidak ditemukan/
      );
    });

    it("safely deletes temp file and behaves idempotently on repeated calls", async () => {
      const testBuffer = await sharp({
        create: { width: 30, height: 30, channels: 3, background: { r: 70, g: 70, b: 70 } },
      })
        .webp()
        .toBuffer();

      const saved = await saveCroppedLetterToTemp(testClassId, testBuffer);
      expect(fs.existsSync(saved.diskPath)).toBe(true);

      // First delete succeeds
      const deleted1 = await deleteTempLetterFile(testClassId, saved.tempFileId);
      expect(deleted1).toBe(true);
      expect(fs.existsSync(saved.diskPath)).toBe(false);

      // Second delete on already deleted file returns false cleanly without throwing
      const deleted2 = await deleteTempLetterFile(testClassId, saved.tempFileId);
      expect(deleted2).toBe(false);
    });

    it("routine cleanupExpiredTempFiles deletes only expired files and keeps recent ones", async () => {
      const testBuffer = await sharp({
        create: { width: 25, height: 25, channels: 3, background: { r: 100, g: 100, b: 100 } },
      })
        .webp()
        .toBuffer();

      // Create a recent file
      const recent = await saveCroppedLetterToTemp(testClassId, testBuffer, "recent_file");

      // Create an expired file and backdate its mtime
      const expired = await saveCroppedLetterToTemp(testClassId, testBuffer, "expired_file");
      const pastTime = (Date.now() - 3 * 60 * 60 * 1000) / 1000; // 3 hours ago
      fs.utimesSync(expired.diskPath, pastTime, pastTime);

      const cleanupResult = await cleanupExpiredTempFiles({
        maxAgeMs: 2 * 60 * 60 * 1000,
        customStoragePath: testStorageBase,
      });

      expect(cleanupResult.deletedCount).toBe(1);
      expect(cleanupResult.freedBytes).toBeGreaterThan(0);
      expect(cleanupResult.errors).toHaveLength(0);

      // Expired file must be gone
      expect(fs.existsSync(expired.diskPath)).toBe(false);
      // Recent file must still exist
      expect(fs.existsSync(recent.diskPath)).toBe(true);
    });
  });

  // =========================================================================
  // 4. Concurrency & Stress Load Test
  // =========================================================================
  describe("4. Concurrency & Parallel Crop Stress", () => {
    it("handles 20 concurrent Sharp crops and temp saves without race conditions", async () => {
      const masterBuffer = await sharp({
        create: {
          width: 1200,
          height: 800,
          channels: 3,
          background: { r: 180, g: 140, b: 100 },
        },
      })
        .jpeg()
        .toBuffer();

      const tasks = Array.from({ length: 20 }).map(async (_, idx) => {
        // Varying bounding boxes
        const ymin = 0.05 * (idx % 10);
        const xmin = 0.05 * (idx % 10);
        const ymax = ymin + 0.3;
        const xmax = xmin + 0.3;

        const pixelBox = normalizeCropBox([ymin, xmin, ymax, xmax], 1200, 800);
        const croppedWebp = await cropLetterToWebp(masterBuffer, pixelBox);
        const saved = await saveCroppedLetterToTemp(testClassId, croppedWebp, `concurrent_${idx}`);

        return { idx, saved, width: pixelBox.width, height: pixelBox.height };
      });

      const results = await Promise.all(tasks);

      expect(results).toHaveLength(20);
      for (const res of results) {
        expect(fs.existsSync(res.saved.diskPath)).toBe(true);
        expect(res.saved.sizeBytes).toBeGreaterThan(0);
        expect(isValidLetterFilePath(res.saved.filePath, testClassId)).toBe(true);
      }
    });
  });
});
