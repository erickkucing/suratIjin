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
import { ThemeColor } from "@/lib/system-settings";

const validThemes: [ThemeColor, ...ThemeColor[]] = [
  "terracotta",
  "emerald",
  "ocean",
  "indigo",
  "burgundy",
];

const updateThemeSchema = z.object({
  themeColor: z.enum(validThemes),
});

const updateAppNameSchema = z.object({
  appName: z
    .string()
    .trim()
    .min(2, "Nama aplikasi minimal 2 karakter.")
    .max(120, "Nama aplikasi maksimal 120 karakter."),
});

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

  revalidatePath("/", "layout");
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

  revalidatePath("/", "layout");
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
  const targetPath = path.resolve(systemDir, filename);

  // Resize and convert to high quality PNG with sharp
  await sharp(buffer)
    .resize(256, 256, { fit: "inside", withoutEnlargement: true })
    .png({ quality: 90 })
    .toFile(targetPath);

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

  revalidatePath("/", "layout");
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

  revalidatePath("/", "layout");
  return { success: true };
}
