import { db } from "@/db";
import { systemSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  ThemeColor,
  SystemSettingsData,
  DEFAULT_SYSTEM_SETTINGS,
} from "./system-settings-constants";

export * from "./system-settings-constants";

export async function getSystemSettings(): Promise<SystemSettingsData> {
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

    return {
      appName: row.appName || DEFAULT_SYSTEM_SETTINGS.appName,
      logoUrl: row.logoUrl || null,
      themeColor,
    };
  } catch {
    return DEFAULT_SYSTEM_SETTINGS;
  }
}
