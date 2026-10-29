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

export * from "./system-settings-constants";

interface CachedSettingsEntry {
  data: SystemSettingsData;
  timestamp: number;
}

let inMemoryCache: CachedSettingsEntry | null = null;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds TTL

export function invalidateSystemSettingsCache(): void {
  inMemoryCache = null;
}

export function _resetSystemSettingsCacheForTesting(): void {
  inMemoryCache = null;
}

async function fetchSystemSettings(): Promise<SystemSettingsData> {
  const now = Date.now();
  if (inMemoryCache && now - inMemoryCache.timestamp < CACHE_TTL_MS) {
    return inMemoryCache.data;
  }

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
    };

    inMemoryCache = {
      data,
      timestamp: now,
    };

    return data;
  } catch {
    return DEFAULT_SYSTEM_SETTINGS;
  }
}

export const getSystemSettings = cache(fetchSystemSettings);
