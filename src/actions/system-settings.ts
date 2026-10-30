"use server";

import { z } from "zod";
import { db } from "@/db";
import { systemSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import path from "path";
import fs from "fs";
import sharp from "sharp";
import { ThemeColor, BgTheme, invalidateSystemSettingsCache } from "@/lib/system-settings";
import { testAiRouterConnection, AiRouterConfig } from "@/lib/ai-router";

const validThemes: [ThemeColor, ...ThemeColor[]] = [
  "terracotta",
  "emerald",
  "ocean",
  "indigo",
  "burgundy",
];

const validBgThemes: [BgTheme, ...BgTheme[]] = [
  "warm-zinc",
  "clean-slate",
  "subtle-cream",
  "deep-charcoal",
  "nordic-cool",
];

function revalidateSettings() {
  invalidateSystemSettingsCache();
  try {
    revalidatePath("/", "layout");
  } catch {
    // In unit test or offline environment, revalidatePath may not have a request store
  }
}

const updateThemeSchema = z.object({
  themeColor: z.enum(validThemes),
});

const updateBgThemeSchema = z.object({
  bgTheme: z.enum(validBgThemes),
});

const updateSystemIdentitySchema = z.object({
  appName: z
    .string()
    .trim()
    .min(2, "Nama aplikasi minimal 2 karakter.")
    .max(120, "Nama aplikasi maksimal 120 karakter."),
  footerText: z
    .string()
    .trim()
    .max(255, "Teks footer maksimal 255 karakter.")
    .optional(),
});

const updateAppNameSchema = z.object({
  appName: z
    .string()
    .trim()
    .min(2, "Nama aplikasi minimal 2 karakter.")
    .max(120, "Nama aplikasi maksimal 120 karakter."),
});

export async function updateSystemIdentityAction(input: {
  appName: string;
  footerText?: string;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") {
    return { success: false, error: "Hanya Superadmin yang berwenang mengubah identitas sistem." };
  }

  const parse = updateSystemIdentitySchema.safeParse(input);
  if (!parse.success) {
    return {
      success: false,
      error: parse.error.issues[0]?.message || "Data identitas sistem tidak valid.",
    };
  }

  const appName = parse.data.appName;
  const footerText = parse.data.footerText?.trim() || "Sistem Surat Izin & Ketidakhadiran Siswa.";

  await db
    .insert(systemSettings)
    .values({
      id: 1,
      appName,
      footerText,
      updatedById: user.id,
    })
    .onDuplicateKeyUpdate({
      set: {
        appName,
        footerText,
        updatedById: user.id,
      },
    });

  revalidateSettings();
  return { success: true, appName, footerText };
}

export async function updateFooterTextAction(footerText: string) {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") {
    return { success: false, error: "Hanya Superadmin yang berwenang mengubah teks footer." };
  }

  const sanitized = footerText.trim() || "Sistem Surat Izin & Ketidakhadiran Siswa.";
  if (sanitized.length > 255) {
    return { success: false, error: "Teks footer maksimal 255 karakter." };
  }

  await db
    .insert(systemSettings)
    .values({
      id: 1,
      footerText: sanitized,
      updatedById: user.id,
    })
    .onDuplicateKeyUpdate({
      set: {
        footerText: sanitized,
        updatedById: user.id,
      },
    });

  revalidateSettings();
  return { success: true, footerText: sanitized };
}

export async function updateAppNameAction(appName: string) {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") {
    return { success: false, error: "Hanya Superadmin yang berwenang mengubah nama aplikasi." };
  }

  const parse = updateAppNameSchema.safeParse({ appName });
  if (!parse.success) {
    return {
      success: false,
      error: parse.error.issues[0]?.message || "Nama aplikasi tidak valid.",
    };
  }

  await db
    .insert(systemSettings)
    .values({
      id: 1,
      appName: parse.data.appName,
      updatedById: user.id,
    })
    .onDuplicateKeyUpdate({
      set: {
        appName: parse.data.appName,
        updatedById: user.id,
      },
    });

  revalidateSettings();
  return { success: true, appName: parse.data.appName };
}

export async function updateThemeAction(themeColor: string) {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") {
    return { success: false, error: "Hanya Superadmin yang berwenang mengubah tema." };
  }

  const parse = updateThemeSchema.safeParse({ themeColor });
  if (!parse.success) {
    return { success: false, error: "Pilihan tema tidak valid." };
  }

  await db
    .insert(systemSettings)
    .values({
      id: 1,
      themeColor: parse.data.themeColor,
      updatedById: user.id,
    })
    .onDuplicateKeyUpdate({
      set: {
        themeColor: parse.data.themeColor,
        updatedById: user.id,
      },
    });

  revalidateSettings();
  return { success: true };
}

export async function updateBgThemeAction(bgTheme: string) {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") {
    return { success: false, error: "Hanya Superadmin yang berwenang mengubah tema latar belakang." };
  }

  const parse = updateBgThemeSchema.safeParse({ bgTheme });
  if (!parse.success) {
    return { success: false, error: "Pilihan tema latar belakang tidak valid." };
  }

  await db
    .insert(systemSettings)
    .values({
      id: 1,
      bgTheme: parse.data.bgTheme,
      updatedById: user.id,
    })
    .onDuplicateKeyUpdate({
      set: {
        bgTheme: parse.data.bgTheme,
        updatedById: user.id,
      },
    });

  revalidateSettings();
  return { success: true };
}

export async function uploadLogoAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") {
    return { success: false, error: "Hanya Superadmin yang berwenang mengubah logo." };
  }

  const file = formData.get("logo") as File | null;
  if (!file || file.size === 0) {
    return { success: false, error: "File logo tidak ditemukan." };
  }

  const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
  if (!allowedTypes.includes(file.type)) {
    return { success: false, error: "Format file harus PNG, JPG, WEBP, atau SVG." };
  }

  if (file.size > 2 * 1024 * 1024) {
    return { success: false, error: "Ukuran file logo maksimal 2MB." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storageBase = process.env.STORAGE_PATH || "./storage/uploads";
  const systemDir = path.resolve(storageBase, "system");

  if (!fs.existsSync(systemDir)) {
    fs.mkdirSync(systemDir, { recursive: true });
  }

  const timestamp = Date.now();
  const filename = `logo-${timestamp}.png`;
  const icon192Filename = `icon-192-${timestamp}.png`;
  const icon512Filename = `icon-512-${timestamp}.png`;
  const iconMaskableFilename = `icon-maskable-512-${timestamp}.png`;
  const appleIconFilename = `apple-icon-${timestamp}.png`;

  const targetPath = path.resolve(systemDir, filename);
  const icon192Path = path.resolve(systemDir, icon192Filename);
  const icon512Path = path.resolve(systemDir, icon512Filename);
  const iconMaskablePath = path.resolve(systemDir, iconMaskableFilename);
  const appleIconPath = path.resolve(systemDir, appleIconFilename);

  // 1. Resize and convert to high quality PNG for navbar/favicon
  await sharp(buffer)
    .resize(256, 256, { fit: "inside", withoutEnlargement: true })
    .png({ quality: 90 })
    .toFile(targetPath);

  // 2. Generate standard PWA icons (transparent background, fit: contain, purpose: "any")
  await sharp(buffer)
    .resize(192, 192, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ quality: 90 })
    .toFile(icon192Path);

  await sharp(buffer)
    .resize(512, 512, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ quality: 90 })
    .toFile(icon512Path);

  // 3. Generate Android Maskable Icon (512x512, solid white background #FFFFFF, 80% safe-area = 410x410)
  const maskableInnerSize = 410;
  const maskableInnerBuffer = await sharp(buffer)
    .resize(maskableInnerSize, maskableInnerSize, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: maskableInnerBuffer, gravity: "centre" }])
    .png({ quality: 90 })
    .toFile(iconMaskablePath);

  // 4. Generate Apple Touch Icon (180x180, solid white background #FFFFFF, 80% safe-area = 144x144)
  const appleInnerSize = 144;
  const appleInnerBuffer = await sharp(buffer)
    .resize(appleInnerSize, appleInnerSize, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 180,
      height: 180,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: appleInnerBuffer, gravity: "centre" }])
    .png({ quality: 90 })
    .toFile(appleIconPath);

  const relativeUrl = `/api/files/system/${filename}`;

  await db
    .insert(systemSettings)
    .values({
      id: 1,
      logoUrl: relativeUrl,
      updatedById: user.id,
    })
    .onDuplicateKeyUpdate({
      set: {
        logoUrl: relativeUrl,
        updatedById: user.id,
      },
    });

  revalidateSettings();
  return { success: true, logoUrl: relativeUrl };
}

export async function removeLogoAction() {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") {
    return { success: false, error: "Hanya Superadmin yang berwenang menghapus logo." };
  }

  await db
    .insert(systemSettings)
    .values({
      id: 1,
      logoUrl: null,
      updatedById: user.id,
    })
    .onDuplicateKeyUpdate({
      set: {
        logoUrl: null,
        updatedById: user.id,
      },
    });

  revalidateSettings();
  return { success: true };
}

const updateAiSettingsSchema = z.object({
  aiEnabled: z.boolean(),
  aiRouterUrl: z.string().trim().url("Format URL endpoint 9router tidak valid."),
  aiRouterApiKey: z.string().trim().nullable().optional(),
  aiRouterModel: z.string().trim().min(1, "Nama model tidak boleh kosong."),
});

export async function updateAiSettingsAction(data: {
  aiEnabled: boolean;
  aiRouterUrl: string;
  aiRouterApiKey?: string | null;
  aiRouterModel: string;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") {
    return { success: false, error: "Hanya Superadmin yang berwenang mengubah konfigurasi AI." };
  }

  const parse = updateAiSettingsSchema.safeParse(data);
  if (!parse.success) {
    return {
      success: false,
      error: parse.error.issues[0]?.message || "Konfigurasi AI tidak valid.",
    };
  }

  const cleanUrl = parse.data.aiRouterUrl.replace(/\/+$/, "");
  const cleanKey = parse.data.aiRouterApiKey ? parse.data.aiRouterApiKey.trim() : null;

  await db
    .insert(systemSettings)
    .values({
      id: 1,
      aiEnabled: parse.data.aiEnabled,
      aiRouterUrl: cleanUrl,
      aiRouterApiKey: cleanKey,
      aiRouterModel: parse.data.aiRouterModel,
      updatedById: user.id,
    })
    .onDuplicateKeyUpdate({
      set: {
        aiEnabled: parse.data.aiEnabled,
        aiRouterUrl: cleanUrl,
        aiRouterApiKey: cleanKey,
        aiRouterModel: parse.data.aiRouterModel,
        updatedById: user.id,
      },
    });

  revalidateSettings();
  return {
    success: true,
    settings: {
      aiEnabled: parse.data.aiEnabled,
      aiRouterUrl: cleanUrl,
      aiRouterApiKey: cleanKey,
      aiRouterModel: parse.data.aiRouterModel,
    },
  };
}

export async function testAiConnectionAction(customConfig?: Partial<AiRouterConfig>) {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") {
    return { success: false, error: "Hanya Superadmin yang berwenang menguji koneksi AI." };
  }

  const result = await testAiRouterConnection(customConfig);
  return {
    success: true,
    result,
  };
}
