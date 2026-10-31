import { describe, it, expect, beforeEach, afterEach } from "vitest";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import {
  normalizeBoundingBox,
  getImageMetadata,
  autoOrientImage,
  cropLetterToWebp,
  saveCroppedLetterToTemp,
  promoteTempLetterFile,
  cleanupExpiredTempFiles,
  deleteTempLetterFile,
} from "../letter-crop-storage";
import { isValidLetterFilePath } from "../attendance-security";

describe("Letter Crop & Temp Storage Engine (src/lib/letter-crop-storage)", () => {
  const testStorageBase = path.resolve("./storage/test_uploads_crop");
  const testClassId = 99;

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

  describe("1. normalizeBoundingBox", () => {
    const W = 2000;
    const H = 1500;

    it("should correctly normalize Gemini [0, 1000] scale array [ymin, xmin, ymax, xmax]", () => {
      // 10% to 90% in y (150 to 1350), 20% to 80% in x (400 to 1600)
      const box: [number, number, number, number] = [100, 200, 900, 800];
      const result = normalizeBoundingBox(box, W, H);

      expect(result.left).toBe(400);
      expect(result.top).toBe(150);
      expect(result.width).toBe(1200);
      expect(result.height).toBe(1200);
      expect(result.left + result.width).toBeLessThanOrEqual(W);
      expect(result.top + result.height).toBeLessThanOrEqual(H);
    });

    it("should correctly normalize float [0, 1] unit scale coordinates", () => {
      const box: [number, number, number, number] = [0.1, 0.2, 0.9, 0.8];
      const result = normalizeBoundingBox(box, W, H);

      expect(result.left).toBe(400);
      expect(result.top).toBe(150);
      expect(result.width).toBe(1200);
      expect(result.height).toBe(1200);
    });

    it("should correctly handle inverted coordinates (ymin > ymax or xmin > xmax)", () => {
      const invertedBox: [number, number, number, number] = [800, 750, 200, 250];
      const result = normalizeBoundingBox(invertedBox, W, H);

      expect(result.left).toBe(500); // 250 / 1000 * 2000
      expect(result.top).toBe(300);  // 200 / 1000 * 1500
      expect(result.width).toBe(1000); // (750 - 250) / 1000 * 2000
      expect(result.height).toBe(900); // (800 - 200) / 1000 * 1500
    });

    it("should clamp oversized coordinates outside the image boundary", () => {
      const oversizedBox: [number, number, number, number] = [-100, -50, 1200, 1100];
      const result = normalizeBoundingBox(oversizedBox, W, H);

      expect(result.left).toBe(0);
      expect(result.top).toBe(0);
      expect(result.left + result.width).toBeLessThanOrEqual(W);
      expect(result.top + result.height).toBeLessThanOrEqual(H);
      expect(result.width).toBe(W);
      expect(result.height).toBe(H);
    });

    it("should guarantee minimum 1px dimension for degenerate boxes", () => {
      const degenerateBox: [number, number, number, number] = [500, 500, 500, 500];
      const result = normalizeBoundingBox(degenerateBox, W, H);

      expect(result.width).toBeGreaterThanOrEqual(1);
      expect(result.height).toBeGreaterThanOrEqual(1);
    });
  });

  describe("2. Image Metadata & Auto-Orientation", () => {
    it("should read metadata and auto-orient image correctly", async () => {
      // Create synthetic 400x300 image
      const rawBuffer = await sharp({
        create: {
          width: 400,
          height: 300,
          channels: 3,
          background: { r: 100, g: 150, b: 200 },
        },
      })
        .jpeg()
        .toBuffer();

      const meta = await getImageMetadata(rawBuffer);
      expect(meta.width).toBe(400);
      expect(meta.height).toBe(300);

      const oriented = await autoOrientImage(rawBuffer);
      expect(oriented.width).toBe(400);
      expect(oriented.height).toBe(300);
      expect(Buffer.isBuffer(oriented.orientedBuffer)).toBe(true);
    });
  });

  describe("3. Letter Cropping & WebP Encoding", () => {
    it("should crop specified box and output valid WebP buffer", async () => {
      const testBuffer = await sharp({
        create: {
          width: 600,
          height: 400,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .png()
        .toBuffer();

      const cropBox = { left: 50, top: 40, width: 200, height: 150 };
      const cropped = await cropLetterToWebp(testBuffer, cropBox, 85);

      const cropMeta = await sharp(cropped).metadata();
      expect(cropMeta.format).toBe("webp");
      expect(cropMeta.width).toBe(200);
      expect(cropMeta.height).toBe(150);
    });
  });

  describe("4. Temp Storage & Security Invariants", () => {
    it("should save cropped letter to temp and satisfy isValidLetterFilePath", async () => {
      const webpBuffer = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 50, g: 50, b: 50 },
        },
      })
        .webp()
        .toBuffer();

      const saved = await saveCroppedLetterToTemp(testClassId, webpBuffer);

      expect(saved.filePath).toMatch(new RegExp(`^${testClassId}/temp/temp_\\d+_[a-f0-9]+\\.webp$`));
      expect(saved.previewUrl).toBe(`/api/files/${saved.filePath}`);
      expect(fs.existsSync(saved.diskPath)).toBe(true);

      // Verify path security invariant directly
      expect(isValidLetterFilePath(saved.filePath, testClassId)).toBe(true);
      // Cross-class attempt must fail
      expect(isValidLetterFilePath(saved.filePath, testClassId + 1)).toBe(false);
    });

    it("should promote temp letter file to permanent monthly storage", async () => {
      const webpBuffer = await sharp({
        create: {
          width: 80,
          height: 80,
          channels: 3,
          background: { r: 10, g: 20, b: 30 },
        },
      })
        .webp()
        .toBuffer();

      const saved = await saveCroppedLetterToTemp(testClassId, webpBuffer);
      const promoted = await promoteTempLetterFile(testClassId, saved.tempFileId);

      // Temp file should no longer exist
      expect(fs.existsSync(saved.diskPath)).toBe(false);
      // Permanent file must exist
      expect(fs.existsSync(promoted.permanentDiskPath)).toBe(true);
      expect(promoted.permanentFilePath).toMatch(new RegExp(`^${testClassId}/\\d{4}-\\d{2}/\\d+_[a-f0-9]+\\.webp$`));
      expect(isValidLetterFilePath(promoted.permanentFilePath, testClassId)).toBe(true);
    });

    it("should safely delete individual temp letter file", async () => {
      const webpBuffer = await sharp({
        create: {
          width: 50,
          height: 50,
          channels: 3,
          background: { r: 1, g: 2, b: 3 },
        },
      })
        .webp()
        .toBuffer();

      const saved = await saveCroppedLetterToTemp(testClassId, webpBuffer);
      expect(fs.existsSync(saved.diskPath)).toBe(true);

      const deleted = await deleteTempLetterFile(testClassId, saved.tempFileId);
      expect(deleted).toBe(true);
      expect(fs.existsSync(saved.diskPath)).toBe(false);
    });
  });

  describe("5. Routine Cleanup of Expired Temp Files", () => {
    it("should remove files older than 2 hours and keep recent files", async () => {
      const webpBuffer = await sharp({
        create: {
          width: 50,
          height: 50,
          channels: 3,
          background: { r: 0, g: 0, b: 0 },
        },
      })
        .webp()
        .toBuffer();

      // Create an expired temp file (simulate 3 hours old)
      const oldSaved = await saveCroppedLetterToTemp(testClassId, webpBuffer, "temp_old_sample");
      const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
      fs.utimesSync(oldSaved.diskPath, new Date(threeHoursAgo), new Date(threeHoursAgo));

      // Create a fresh temp file (recent)
      const freshSaved = await saveCroppedLetterToTemp(testClassId, webpBuffer, "temp_fresh_sample");

      const cleanupStats = await cleanupExpiredTempFiles({
        maxAgeMs: 2 * 60 * 60 * 1000,
        customStoragePath: testStorageBase,
      });

      expect(cleanupStats.scannedCount).toBe(2);
      expect(cleanupStats.deletedCount).toBe(1);
      expect(cleanupStats.freedBytes).toBeGreaterThan(0);
      expect(cleanupStats.errors.length).toBe(0);

      // Old file should be deleted
      expect(fs.existsSync(oldSaved.diskPath)).toBe(false);
      // Fresh file must remain intact
      expect(fs.existsSync(freshSaved.diskPath)).toBe(true);
    });
  });
});
