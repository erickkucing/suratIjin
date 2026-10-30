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

export async function processFileBeforeUpload(
  file: File,
  onProgress?: (progress: number) => void,
  customOptions?: CompressionOptions
): Promise<CompressionResult> {
  const originalSize = file.size;

  // 1. If PDF, pass through without compression (just validate max 15MB)
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    if (file.size > 15 * 1024 * 1024) {
      throw new Error("Ukuran file PDF melebihi batas maksimal 15 MB.");
    }
    return {
      file,
      originalSize,
      compressedSize: file.size,
      reductionPercentage: 0,
    };
  }

  let fileToCompress = file;

  // 2. Check for iOS HEIC / HEIF format
  const isHeic =
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    file.name.toLowerCase().endsWith(".heic") ||
    file.name.toLowerCase().endsWith(".heif");

  if (isHeic) {
    onProgress?.(10);
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

  onProgress?.(30);

  // 3. Compress image with browser-image-compression
  try {
    const imageCompression = (await import("browser-image-compression")).default;
    const options = {
      maxSizeMB: customOptions?.maxSizeMB ?? 0.4, // Max ~400 KB
      maxWidthOrHeight: customOptions?.maxWidthOrHeight ?? 1600, // Keeps text sharp
      useWebWorker: true,
      onProgress: (p: number) => {
        // Map 30% to 90%
        onProgress?.(30 + Math.round(p * 0.6));
      },
    };

    const compressedBlob = await imageCompression(fileToCompress, options);
    const finalFile = new File([compressedBlob], fileToCompress.name, {
      type: fileToCompress.type,
      lastModified: Date.now(),
    });

    onProgress?.(100);

    const compressedSize = finalFile.size;
    const reduction = originalSize > 0 ? Math.round(((originalSize - compressedSize) / originalSize) * 100) : 0;

    return {
      file: finalFile,
      originalSize,
      compressedSize,
      reductionPercentage: Math.max(0, reduction),
    };
  } catch (err) {
    console.error("Compression failed, using uncompressed file:", err);
    onProgress?.(100);
    return {
      file: fileToCompress,
      originalSize,
      compressedSize: fileToCompress.size,
      reductionPercentage: 0,
    };
  }
}
