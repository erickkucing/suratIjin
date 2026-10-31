import sharp from "sharp";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { isValidLetterFilePath } from "./attendance-security";

/**
 * Universal raw bounding box representation supported from AI Vision outputs
 */
export type RawBoundingBox =
  | [number, number, number, number] // [ymin, xmin, ymax, xmax]
  | { ymin: number; xmin: number; ymax: number; xmax: number }
  | { top: number; left: number; bottom: number; right: number }
  | { left: number; top: number; width: number; height: number };

export interface PixelBoundingBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SavedTempFile {
  tempFileId: string;
  filePath: string;
  previewUrl: string;
  diskPath: string;
  sizeBytes: number;
}

export interface PromotedLetterFile {
  permanentFilePath: string;
  permanentDiskPath: string;
}

export interface TempCleanupResult {
  scannedCount: number;
  deletedCount: number;
  freedBytes: number;
  errors: string[];
}

/**
 * Normalizes any bounding box (Gemini [0, 1000], [0, 1] float, or pixel coordinates)
 * and applies strict safety clamping [0, imageWidth/Height] to satisfy Sharp requirements.
 */
export function normalizeBoundingBox(
  box: RawBoundingBox,
  imageWidth: number,
  imageHeight: number
): PixelBoundingBox {
  if (imageWidth <= 0 || imageHeight <= 0) {
    throw new Error(`Dimensi gambar tidak valid: ${imageWidth}x${imageHeight}`);
  }

  let ymin: number;
  let xmin: number;
  let ymax: number;
  let xmax: number;

  if (Array.isArray(box)) {
    // Gemini vision standard: [ymin, xmin, ymax, xmax]
    [ymin, xmin, ymax, xmax] = box;
  } else if ("ymin" in box && "xmin" in box) {
    ymin = box.ymin;
    xmin = box.xmin;
    ymax = box.ymax;
    xmax = box.xmax;
  } else if ("top" in box && "left" in box && "bottom" in box && "right" in box) {
    ymin = box.top;
    xmin = box.left;
    ymax = box.bottom;
    xmax = box.right;
  } else if ("left" in box && "top" in box && "width" in box && "height" in box) {
    // Already in left/top/width/height format
    const leftVal = box.left;
    const topVal = box.top;
    const isUnit = Math.max(leftVal, topVal, box.width, box.height) <= 1.0;
    const isThousand = !isUnit && Math.max(leftVal, topVal, box.width, box.height) <= 1000;

    let pxLeft = leftVal;
    let pxTop = topVal;
    let pxWidth = box.width;
    let pxHeight = box.height;

    if (isUnit) {
      pxLeft = leftVal * imageWidth;
      pxTop = topVal * imageHeight;
      pxWidth = box.width * imageWidth;
      pxHeight = box.height * imageHeight;
    } else if (isThousand) {
      pxLeft = (leftVal / 1000) * imageWidth;
      pxTop = (topVal / 1000) * imageHeight;
      pxWidth = (box.width / 1000) * imageWidth;
      pxHeight = (box.height / 1000) * imageHeight;
    }

    const clampedLeft = Math.max(0, Math.min(Math.floor(pxLeft), imageWidth - 1));
    const clampedTop = Math.max(0, Math.min(Math.floor(pxTop), imageHeight - 1));
    const maxAvailW = imageWidth - clampedLeft;
    const maxAvailH = imageHeight - clampedTop;
    const clampedW = Math.max(1, Math.min(Math.floor(pxWidth), maxAvailW));
    const clampedH = Math.max(1, Math.min(Math.floor(pxHeight), maxAvailH));

    return {
      left: clampedLeft,
      top: clampedTop,
      width: clampedW,
      height: clampedH,
    };
  } else {
    throw new Error("Format bounding box tidak dikenal.");
  }

  // Handle potential inverted min/max from noisy model outputs
  const rawY1 = Math.min(ymin, ymax);
  const rawY2 = Math.max(ymin, ymax);
  const rawX1 = Math.min(xmin, xmax);
  const rawX2 = Math.max(xmin, xmax);

  // Detect scale: [0, 1] unit float vs [0, 1000] Gemini standard vs absolute pixel
  const maxCoord = Math.max(rawY1, rawY2, rawX1, rawX2);
  const isUnitFloat = maxCoord <= 1.0;
  const isThousandScale = !isUnitFloat && maxCoord <= 1500;

  let pxX1: number;
  let pxY1: number;
  let pxX2: number;
  let pxY2: number;

  if (isUnitFloat) {
    pxX1 = rawX1 * imageWidth;
    pxY1 = rawY1 * imageHeight;
    pxX2 = rawX2 * imageWidth;
    pxY2 = rawY2 * imageHeight;
  } else if (isThousandScale) {
    pxX1 = (rawX1 / 1000) * imageWidth;
    pxY1 = (rawY1 / 1000) * imageHeight;
    pxX2 = (rawX2 / 1000) * imageWidth;
    pxY2 = (rawY2 / 1000) * imageHeight;
  } else {
    pxX1 = rawX1;
    pxY1 = rawY1;
    pxX2 = rawX2;
    pxY2 = rawY2;
  }

  // 1. Clamp left and top strictly to valid boundary range
  const clampedLeft = Math.max(0, Math.min(Math.floor(pxX1), imageWidth - 1));
  const clampedTop = Math.max(0, Math.min(Math.floor(pxY1), imageHeight - 1));

  // 2. Determine max available pixels remaining
  const maxAvailWidth = imageWidth - clampedLeft;
  const maxAvailHeight = imageHeight - clampedTop;

  // 3. Compute and clamp width/height
  const rawWidth = Math.max(1, Math.floor(pxX2 - pxX1));
  const rawHeight = Math.max(1, Math.floor(pxY2 - pxY1));

  const clampedWidth = Math.max(1, Math.min(rawWidth, maxAvailWidth));
  const clampedHeight = Math.max(1, Math.min(rawHeight, maxAvailHeight));

  return {
    left: clampedLeft,
    top: clampedTop,
    width: clampedWidth,
    height: clampedHeight,
  };
}

/**
 * Reads metadata (width, height, format, orientation) of an image buffer.
 */
export async function getImageMetadata(buffer: Buffer): Promise<{
  width: number;
  height: number;
  format?: string;
  orientation?: number;
}> {
  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) {
    throw new Error("Berkas gambar tidak memiliki dimensi yang valid atau rusak.");
  }
  return {
    width: meta.width,
    height: meta.height,
    format: meta.format,
    orientation: meta.orientation,
  };
}

/**
 * Auto-orients the buffer based on EXIF orientation tags using sharp(buffer).rotate().
 * Strips EXIF orientation and returns upright buffer with exact pixel dimensions.
 */
export async function autoOrientImage(buffer: Buffer): Promise<{
  orientedBuffer: Buffer;
  width: number;
  height: number;
}> {
  const { data: orientedBuffer, info } = await sharp(buffer)
    .rotate() // auto-orient based on EXIF tag
    .toBuffer({ resolveWithObject: true });

  return {
    orientedBuffer,
    width: info.width,
    height: info.height,
  };
}

/**
 * Crops a bounding box area from an oriented image buffer and encodes to WebP.
 * Quality defaults to 85 for high-efficiency letter legibility.
 */
export async function cropLetterToWebp(
  orientedBuffer: Buffer,
  boundingBox: PixelBoundingBox,
  quality: number = 85
): Promise<Buffer> {
  return await sharp(orientedBuffer)
    .extract({
      left: boundingBox.left,
      top: boundingBox.top,
      width: boundingBox.width,
      height: boundingBox.height,
    })
    .webp({ quality, effort: 4 })
    .toBuffer();
}

/**
 * Saves a cropped WebP buffer into private temporary storage:
 * `./storage/uploads/${classId}/temp/${tempFileId}.webp`
 * Verifies that the resulting relative path satisfies isValidLetterFilePath.
 */
export async function saveCroppedLetterToTemp(
  classId: number,
  webpBuffer: Buffer,
  customTempFileId?: string
): Promise<SavedTempFile> {
  if (!classId || isNaN(classId) || classId <= 0) {
    throw new Error(`ID Kelas tidak valid: ${classId}`);
  }

  const storageBase = path.resolve(process.env.STORAGE_PATH || "./storage/uploads");
  const tempDir = path.resolve(storageBase, String(classId), "temp");

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Generate or sanitize tempFileId
  const tempFileId = customTempFileId
    ? customTempFileId.replace(/\.webp$/i, "").replace(/[^a-zA-Z0-9_-]/g, "")
    : `temp_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;

  if (!tempFileId) {
    throw new Error("tempFileId tidak boleh kosong setelah sanitasi.");
  }

  const fileName = `${tempFileId}.webp`;
  const fullDiskPath = path.resolve(tempDir, fileName);

  // Path traversal containment check
  const rel = path.relative(storageBase, fullDiskPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Pelanggaran keamanan: Jalur berkas berada di luar storage base.");
  }

  // Write WebP buffer to disk
  fs.writeFileSync(fullDiskPath, webpBuffer);

  const relativePath = `${classId}/temp/${fileName}`;

  // Strict invariant check: must satisfy isValidLetterFilePath
  if (!isValidLetterFilePath(relativePath, classId)) {
    try {
      fs.unlinkSync(fullDiskPath);
    } catch {}
    throw new Error(`Jalur berkas ${relativePath} melanggar invariant isValidLetterFilePath.`);
  }

  return {
    tempFileId,
    filePath: relativePath,
    previewUrl: `/api/files/${classId}/temp/${fileName}`,
    diskPath: fullDiskPath,
    sizeBytes: webpBuffer.length,
  };
}

/**
 * Promotes a temporary letter file to permanent monthly storage:
 * `./storage/uploads/${classId}/${yearMonth}/${timestamp}_${randomSuffix}.webp`
 * Used during Milestone 2 Batch Sync database commit.
 */
export async function promoteTempLetterFile(
  arg1: number | string,
  arg2: number | string,
  targetDate?: string | Date
): Promise<PromotedLetterFile> {
  const classId =
    typeof arg1 === "number"
      ? arg1
      : typeof arg2 === "number"
      ? arg2
      : parseInt(String(arg2), 10);
  const rawTempId =
    typeof arg1 === "string" && isNaN(Number(arg1)) ? arg1 : String(arg2);
  const cleanTempId = path
    .basename(rawTempId)
    .replace(/\.(webp|pdf)$/i, "")
    .replace(/[^a-zA-Z0-9_-]/g, "");

  const storageBase = path.resolve(process.env.STORAGE_PATH || "./storage/uploads");
  const tempDir = path.resolve(storageBase, String(classId), "temp");

  let tempDiskPath = path.resolve(tempDir, `${cleanTempId}.webp`);
  let fileExt = ".webp";

  if (!fs.existsSync(tempDiskPath)) {
    const pdfPath = path.resolve(tempDir, `${cleanTempId}.pdf`);
    if (fs.existsSync(pdfPath)) {
      tempDiskPath = pdfPath;
      fileExt = ".pdf";
    } else {
      throw new Error(`Berkas sementara tidak ditemukan: ${cleanTempId}`);
    }
  }

  const d = targetDate ? new Date(targetDate) : new Date();
  const validDate = isNaN(d.getTime()) ? new Date() : d;
  const yearMonth = `${validDate.getFullYear()}-${String(validDate.getMonth() + 1).padStart(2, "0")}`;
  const permDir = path.resolve(storageBase, String(classId), yearMonth);

  if (!fs.existsSync(permDir)) {
    fs.mkdirSync(permDir, { recursive: true });
  }

  const randomSuffix = crypto.randomBytes(6).toString("hex");
  const permFileName = `${Date.now()}_${randomSuffix}${fileExt}`;
  const permDiskPath = path.resolve(permDir, permFileName);

  // Safe move across filesystem boundaries
  try {
    fs.renameSync(tempDiskPath, permDiskPath);
  } catch {
    fs.copyFileSync(tempDiskPath, permDiskPath);
    fs.unlinkSync(tempDiskPath);
  }

  const permanentRelativePath = `${classId}/${yearMonth}/${permFileName}`;

  if (!isValidLetterFilePath(permanentRelativePath, classId)) {
    throw new Error("Permanent path violates isValidLetterFilePath invariant.");
  }

  return {
    permanentFilePath: permanentRelativePath,
    permanentDiskPath: permDiskPath,
  };
}

/**
 * Safely deletes a specific temp file (e.g. when teacher rejects or replaces an item in Review Drawer).
 */
export async function deleteTempLetterFile(
  classId: number,
  tempFileId: string
): Promise<boolean> {
  try {
    const storageBase = path.resolve(process.env.STORAGE_PATH || "./storage/uploads");
    const cleanTempId = tempFileId.replace(/\.webp$/i, "").replace(/[^a-zA-Z0-9_-]/g, "");
    const tempDiskPath = path.resolve(storageBase, String(classId), "temp", `${cleanTempId}.webp`);

    if (fs.existsSync(tempDiskPath)) {
      fs.unlinkSync(tempDiskPath);
      return true;
    }
    return false;
  } catch (err) {
    console.warn(`[Temp Storage] Gagal menghapus berkas sementara ${tempFileId}:`, err);
    return false;
  }
}

/**
 * Routine cleanup helper: scans all class temp directories in ./storage/uploads
 * and deletes temporary files older than maxAgeMs (default: 2 hours = 7,200,000 ms).
 * Never throws exceptions to caller; returns complete cleanup statistics.
 */
export async function cleanupExpiredTempFiles(options?: {
  maxAgeMs?: number;
  customStoragePath?: string;
}): Promise<TempCleanupResult> {
  const maxAgeMs = options?.maxAgeMs ?? 2 * 60 * 60 * 1000; // 2 hours
  const storageBase = path.resolve(options?.customStoragePath || process.env.STORAGE_PATH || "./storage/uploads");

  const result: TempCleanupResult = {
    scannedCount: 0,
    deletedCount: 0,
    freedBytes: 0,
    errors: [],
  };

  if (!fs.existsSync(storageBase)) {
    return result;
  }

  const now = Date.now();

  try {
    const classDirs = fs.readdirSync(storageBase, { withFileTypes: true });

    for (const classDir of classDirs) {
      if (!classDir.isDirectory()) continue;
      // Skip reserved directories
      if (classDir.name === "system" || classDir.name === "legacy") continue;

      const tempDir = path.join(storageBase, classDir.name, "temp");
      if (!fs.existsSync(tempDir)) continue;

      try {
        const files = fs.readdirSync(tempDir, { withFileTypes: true });

        for (const file of files) {
          if (!file.isFile()) continue;
          if (!file.name.endsWith(".webp") && !file.name.endsWith(".tmp")) continue;

          const filePath = path.join(tempDir, file.name);
          result.scannedCount++;

          try {
            const stat = fs.statSync(filePath);
            const ageMs = now - stat.mtimeMs;

            if (ageMs > maxAgeMs) {
              fs.unlinkSync(filePath);
              result.deletedCount++;
              result.freedBytes += stat.size;
            }
          } catch (fileErr) {
            const errMsg = `Gagal memeriksa/menghapus ${filePath}: ${
              fileErr instanceof Error ? fileErr.message : String(fileErr)
            }`;
            result.errors.push(errMsg);
          }
        }
      } catch (dirErr) {
        result.errors.push(
          `Gagal membaca direktori temp kelas ${classDir.name}: ${
            dirErr instanceof Error ? dirErr.message : String(dirErr)
          }`
        );
      }
    }
  } catch (err) {
    result.errors.push(
      `Gagal menjalankan cleanupExpiredTempFiles pada ${storageBase}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  return result;
}
