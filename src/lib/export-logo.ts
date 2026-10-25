export interface ExportLogoInfo {
  base64: string;
  extension: "png" | "jpeg";
  width: number;
  height: number;
  aspectRatio: number;
}

export const DEFAULT_SCHOOL_EMBLEM_BASE64 =
  "data:image/png;base64,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";

export function calculateProportionalDimensions(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  const aspect =
    originalWidth > 0 && originalHeight > 0
      ? originalWidth / originalHeight
      : 1;

  let width = maxWidth;
  let height = maxWidth / aspect;

  if (height > maxHeight) {
    height = maxHeight;
    width = maxHeight * aspect;
  }

  return {
    width: Math.max(1, Math.round(width * 100) / 100),
    height: Math.max(1, Math.round(height * 100) / 100),
  };
}

function parseDimensionsFromPngBase64(base64: string): { width: number; height: number } {
  try {
    const raw = base64.split(",")[1] || base64;
    if (typeof Buffer !== "undefined") {
      const buf = Buffer.from(raw, "base64");
      if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
        const width = buf.readUInt32BE(16);
        const height = buf.readUInt32BE(20);
        if (width > 0 && height > 0) return { width, height };
      }
    }
  } catch {}
  return { width: 240, height: 240 };
}

async function getImageDimensionsBrowser(urlOrDataUrl: string): Promise<{ width: number; height: number }> {
  if (typeof Image === "undefined") {
    return parseDimensionsFromPngBase64(urlOrDataUrl);
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || img.width || 240;
      const h = img.naturalHeight || img.height || 240;
      resolve({ width: w, height: h });
    };
    img.onerror = () => {
      resolve(parseDimensionsFromPngBase64(urlOrDataUrl));
    };
    img.src = urlOrDataUrl;
  });
}

export async function resolveExportLogo(
  logoUrl?: string | null
): Promise<ExportLogoInfo> {
  if (logoUrl && typeof logoUrl === "string" && logoUrl.trim().length > 0) {
    const trimmed = logoUrl.trim();

    if (trimmed.startsWith("data:image/")) {
      const isJpeg = trimmed.startsWith("data:image/jpeg") || trimmed.startsWith("data:image/jpg");
      const extension: "png" | "jpeg" = isJpeg ? "jpeg" : "png";
      const dims = await getImageDimensionsBrowser(trimmed);
      return {
        base64: trimmed,
        extension,
        width: dims.width,
        height: dims.height,
        aspectRatio: dims.width / dims.height,
      };
    }

    if (typeof fetch !== "undefined") {
      try {
        const res = await fetch(trimmed);
        if (res.ok) {
          const blob = await res.blob();
          const isJpeg = blob.type.includes("jpeg") || blob.type.includes("jpg");
          const extension: "png" | "jpeg" = isJpeg ? "jpeg" : "png";
          const base64 = await new Promise<string>((resolve, reject) => {
            if (typeof FileReader !== "undefined") {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            } else if (typeof Buffer !== "undefined") {
              blob.arrayBuffer().then((ab) => {
                const b64 = Buffer.from(ab).toString("base64");
                resolve(`data:${blob.type || "image/png"};base64,${b64}`);
              });
            } else {
              reject(new Error("No FileReader or Buffer available"));
            }
          });

          const dims = await getImageDimensionsBrowser(base64);
          return {
            base64,
            extension,
            width: dims.width,
            height: dims.height,
            aspectRatio: dims.width / dims.height,
          };
        }
      } catch {}
    }
  }

  return {
    base64: DEFAULT_SCHOOL_EMBLEM_BASE64,
    extension: "png",
    width: 240,
    height: 240,
    aspectRatio: 1.0,
  };
}
