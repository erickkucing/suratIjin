"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { systemSettings } from "@/db/schema";
import {
  testRedisConnection,
  initializeRedis,
  disconnectRedis,
  isRedisConnected,
} from "@/lib/redis";
import { invalidateSystemSettingsCache } from "@/lib/system-settings";
import { revalidatePath } from "next/cache";

const updateRedisSettingsSchema = z.object({
  redisEnabled: z.boolean(),
  redisUrl: z
    .string()
    .trim()
    .min(1, "URL Redis tidak boleh kosong saat diaktifkan.")
    .max(255, "URL Redis maksimal 255 karakter.")
    .nullable()
    .optional()
    .or(z.literal("")),
});

/**
 * Server action to test connection to a Redis server
 * Only accessible by Superadmin.
 */
export async function testRedisConnectionAction(url: string) {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") {
    return {
      success: false,
      error: "Hanya Superadmin yang berwenang menguji koneksi Redis.",
    };
  }

  const trimmed = url ? url.trim() : "";
  if (!trimmed) {
    return {
      success: false,
      error: "URL koneksi Redis tidak boleh kosong.",
    };
  }

  try {
    const result = await testRedisConnection(trimmed);
    return {
      success: result.connected,
      connected: result.connected,
      latencyMs: result.latencyMs,
      error: result.error,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      connected: false,
      latencyMs: 0,
      error: msg,
    };
  }
}

/**
 * Server action to update Redis settings in system_settings table
 * and toggle active Redis client connection.
 * Only accessible by Superadmin.
 */
export async function updateRedisSettingsAction(input: {
  redisEnabled: boolean;
  redisUrl?: string | null;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") {
    return {
      success: false,
      error: "Hanya Superadmin yang berwenang mengubah konfigurasi Redis.",
    };
  }

  const parse = updateRedisSettingsSchema.safeParse(input);
  if (!parse.success) {
    return {
      success: false,
      error: parse.error.issues[0]?.message || "Konfigurasi Redis tidak valid.",
    };
  }

  const { redisEnabled } = parse.data;
  const rawUrl = parse.data.redisUrl ? parse.data.redisUrl.trim() : null;
  const cleanUrl = rawUrl || null;

  if (redisEnabled && !cleanUrl) {
    return {
      success: false,
      error: "URL Redis wajib diisi jika fitur diaktifkan.",
    };
  }

  try {
    // 1. Update database system_settings
    await db
      .insert(systemSettings)
      .values({
        id: 1,
        redisEnabled,
        redisUrl: cleanUrl,
        updatedById: user.id,
      })
      .onDuplicateKeyUpdate({
        set: {
          redisEnabled,
          redisUrl: cleanUrl,
          updatedById: user.id,
        },
      });

    // 2. Adjust live Redis connection
    if (redisEnabled && cleanUrl) {
      await initializeRedis(cleanUrl);
    } else {
      await disconnectRedis();
    }

    // 3. Invalidate local settings cache
    await invalidateSystemSettingsCache();

    try {
      revalidatePath("/admin");
      revalidatePath("/dashboard");
    } catch {}

    return {
      success: true,
      settings: {
        redisEnabled,
        redisUrl: cleanUrl,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Gagal menyimpan konfigurasi Redis: ${msg}`,
    };
  }
}

/**
 * Server action to get current active Redis connection status
 * Only accessible by Superadmin.
 */
export async function getRedisStatusAction() {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") {
    return {
      success: false,
      error: "Unauthorized",
    };
  }

  const connected = isRedisConnected();
  return {
    success: true,
    connected,
  };
}
