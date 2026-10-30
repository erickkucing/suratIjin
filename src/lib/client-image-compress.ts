"use client";

export interface CompressionResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  reductionPercentage: number;
}

export interface CompressionOptions {
  maxWidthOrHeight?: number;
  maxSizeMB?: number;
  quality?: number;
}

/**
 * Single-pass hardware-accelerated image resize and compression.
 * Avoids CPU-heavy binary search loops by directly calculating target dimensions
 * and rendering via hardware-accelerated Canvas / ImageBitmap in a single pass (<400ms).
 */
export async function processFileBeforeUpload(
  file: File,
  onProgress?: (progress: number) => void,
  customOptions?: CompressionOptions
): Promise<CompressionResult> {
  const originalSize = file.size;

  // 1. If PDF, pass through without compression (validate max 15MB)
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    if (file.size > 15 * 1024 * 1024) {
      throw new Error("Ukuran file PDF melebihi batas maksimal 15 MB.");
    }
    onProgress?.(100);
    return {
      file,
      originalSize,
      compressedSize: file.size,
      reductionPercentage: 0,
    };
  }

  let fileToCompress = file;
  const isHeic =
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    file.name.toLowerCase().endsWith(".heic") ||
    file.name.toLowerCase().endsWith(".heif");

  // 2. Decode HEIC if required (primarily iOS Safari / Chrome uploads)
  if (isHeic) {
    onProgress?.(15);
    try {
      const { heicTo } = await import("heic-to");
      const jpegBlob = await heicTo({
        blob: file,
        type: "image/jpeg",
        quality: customOptions?.quality ?? 0.85,
      });
      const newName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
      fileToCompress = new File([jpegBlob], newName, { type: "image/jpeg" });
    } catch (err) {
      console.warn("HEIC conversion fallback:", err);
    }
  }

  onProgress?.(40);

  const maxDimension = customOptions?.maxWidthOrHeight ?? 1600;
  const targetQuality = customOptions?.quality ?? 0.82;

  // 3. Single-Pass Canvas / ImageBitmap Downscaling
  try {
    const compressedBlob = await downscaleImageSinglePass(fileToCompress, maxDimension, targetQuality);
    onProgress?.(90);

    const baseName = fileToCompress.name.replace(/\.[^/.]+$/, "");
    const finalFile = new File([compressedBlob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });

    onProgress?.(100);

    const compressedSize = finalFile.size;
    const reduction =
      originalSize > 0 ? Math.round(((originalSize - compressedSize) / originalSize) * 100) : 0;

    return {
      file: finalFile,
      originalSize,
      compressedSize,
      reductionPercentage: Math.max(0, reduction),
    };
  } catch (err) {
    console.warn("Single-pass canvas compression fallback to original file:", err);
    onProgress?.(100);
    return {
      file: fileToCompress,
      originalSize,
      compressedSize: fileToCompress.size,
      reductionPercentage: 0,
    };
  }
}

/**
 * Internal single-pass canvas downscaler.
 * Calculates exact aspect ratio scale once and encodes directly to JPEG.
 */
async function downscaleImageSinglePass(
  file: File | Blob,
  maxDimension: number,
  quality: number
): Promise<Blob> {
  // Strategy A: Modern hardware-accelerated createImageBitmap
  if (typeof createImageBitmap === "function") {
    try {
      const sourceBitmap = await createImageBitmap(file);
      const { width: srcW, height: srcH } = sourceBitmap;
      const longest = Math.max(srcW, srcH);

      let targetW = srcW;
      let targetH = srcH;

      if (longest > maxDimension) {
        const scale = maxDimension / longest;
        targetW = Math.max(1, Math.round(srcW * scale));
        targetH = Math.max(1, Math.round(srcH * scale));
      }

      // If already within dimensions, we can still transcode to JPEG for compact payload
      let finalBitmap = sourceBitmap;
      if (typeof createImageBitmap === "function" && (targetW !== srcW || targetH !== srcH)) {
        try {
          finalBitmap = await createImageBitmap(file, {
            resizeWidth: targetW,
            resizeHeight: targetH,
            resizeQuality: "medium",
          });
          sourceBitmap.close();
        } catch {
          // Keep sourceBitmap if resize in options not supported
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not acquire 2D canvas context");

      ctx.drawImage(finalBitmap, 0, 0, targetW, targetH);
      finalBitmap.close();

      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error("Canvas toBlob failed"));
          },
          "image/jpeg",
          quality
        );
      });
    } catch (bitmapErr) {
      console.warn("createImageBitmap failed, falling back to HTMLImageElement:", bitmapErr);
    }
  }

  // Strategy B: Classic HTMLImageElement fallback
  return new Promise<Blob>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const srcW = img.naturalWidth || img.width;
      const srcH = img.naturalHeight || img.height;
      const longest = Math.max(srcW, srcH);

      let targetW = srcW;
      let targetH = srcH;
      if (longest > maxDimension) {
        const scale = maxDimension / longest;
        targetW = Math.max(1, Math.round(srcW * scale));
        targetH = Math.max(1, Math.round(srcH * scale));
      }

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not acquire 2D canvas context"));
        return;
      }

      ctx.drawImage(img, 0, 0, targetW, targetH);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Canvas toBlob failed"));
        },
        "image/jpeg",
        quality
      );
    };

    img.onerror = (e) => {
      URL.revokeObjectURL(objectUrl);
      reject(e);
    };

    img.src = objectUrl;
  });
}
