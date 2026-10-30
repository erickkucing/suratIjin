import { cache } from "react";
import { db } from "@/db";
import { systemSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  ThemeColor,
  BgTheme,
  SystemSettingsData,
  DEFAULT_SYSTEM_SETTINGS,
} from "./system-settings-constants";
import { getCache, setCache, deleteCache, isRedisConnected, initializeRedis } from "@/lib/redis";

export * from "./system-settings-constants";

export const SETTINGS_CACHE_KEY = "cache:settings:global";
export const SETTINGS_CACHE_TTL = 300; // 300 seconds (5 minutes)

interface CachedSettingsEntry {
  data: SystemSettingsData;
  timestamp: number;
}

let inMemoryCache: CachedSettingsEntry | null = null;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds TTL

export function invalidateSystemSettingsCache(): Promise<void> {
  inMemoryCache = null;
  return deleteCache(SETTINGS_CACHE_KEY).then(() => {}).catch(() => {});
}

export function _resetSystemSettingsCacheForTesting(): Promise<void> {
  inMemoryCache = null;
  return deleteCache(SETTINGS_CACHE_KEY).then(() => {}).catch(() => {});
}

async function fetchSystemSettings(): Promise<SystemSettingsData> {
  const now = Date.now();

  // 1. Try Redis distributed cache first
  try {
    const cached = await getCache<SystemSettingsData>(SETTINGS_CACHE_KEY);
    if (cached) {
      inMemoryCache = {
        data: cached,
        timestamp: now,
      };
      return cached;
    }
  } catch {
    // Soft fallback: proceed to local in-memory/MySQL
  }

  // 2. In-memory fallback if Redis is disconnected
  if (!isRedisConnected() && inMemoryCache && now - inMemoryCache.timestamp < CACHE_TTL_MS) {
    return inMemoryCache.data;
  }

  // 3. Persistent MySQL database query
  try {
    const row = await db.query.systemSettings.findFirst({
      where: eq(systemSettings.id, 1),
    });

    if (!row) {
      return DEFAULT_SYSTEM_SETTINGS;
    }

    const validThemes: ThemeColor[] = ["terracotta", "emerald", "ocean", "indigo", "burgundy"];
    const themeColor: ThemeColor = validThemes.includes(row.themeColor as ThemeColor)
      ? (row.themeColor as ThemeColor)
      : "terracotta";

    const validBgThemes: BgTheme[] = [
      "warm-zinc",
      "clean-slate",
      "subtle-cream",
      "deep-charcoal",
      "nordic-cool",
    ];
    const bgTheme: BgTheme = validBgThemes.includes(row.bgTheme as BgTheme)
      ? (row.bgTheme as BgTheme)
      : "warm-zinc";

    const data: SystemSettingsData = {
      appName: row.appName || DEFAULT_SYSTEM_SETTINGS.appName,
      logoUrl: row.logoUrl || null,
      themeColor,
      bgTheme,
      footerText: row.footerText || DEFAULT_SYSTEM_SETTINGS.footerText,
      aiEnabled:
        row.aiEnabled !== null && row.aiEnabled !== undefined
          ? Boolean(row.aiEnabled)
          : DEFAULT_SYSTEM_SETTINGS.aiEnabled,
      aiRouterUrl: row.aiRouterUrl || DEFAULT_SYSTEM_SETTINGS.aiRouterUrl,
      aiRouterApiKey: row.aiRouterApiKey ?? null,
      aiRouterModel: row.aiRouterModel || DEFAULT_SYSTEM_SETTINGS.aiRouterModel,
      redisEnabled:
        row.redisEnabled !== null && row.redisEnabled !== undefined
          ? Boolean(row.redisEnabled)
          : DEFAULT_SYSTEM_SETTINGS.redisEnabled,
      redisUrl: row.redisUrl ?? null,
    };

    inMemoryCache = {
      data,
      timestamp: now,
    };

    // Auto-connect Redis if enabled and not currently connected
    if (data.redisEnabled && data.redisUrl && !isRedisConnected()) {
      try {
        await initializeRedis(data.redisUrl);
      } catch {
        // Soft fallback: ignore error
      }
    }

    // Populate Redis distributed cache asynchronously
    try {
      await setCache(SETTINGS_CACHE_KEY, data, SETTINGS_CACHE_TTL);
    } catch {
      // Soft fallback: ignore Redis write error
    }

    return data;
  } catch {
    if (inMemoryCache) {
      return inMemoryCache.data;
    }
    return DEFAULT_SYSTEM_SETTINGS;
  }
}

export const getSystemSettings = cache(fetchSystemSettings);
