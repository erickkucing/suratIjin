import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getRedisClient, isRedisConnected, initializeRedis } from "@/lib/redis";
import { getSystemSettings } from "@/lib/system-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "superadmin") {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const settings = await getSystemSettings();
    if (!settings.redisEnabled) {
      return NextResponse.json({
        enabled: false,
        connected: false,
        latencyMs: 0,
      });
    }

    if (!isRedisConnected() && settings.redisUrl) {
      try {
        await initializeRedis(settings.redisUrl);
      } catch {}
    }

    const connected = isRedisConnected();
    let latencyMs = 0;

    if (connected) {
      const client = getRedisClient();
      if (client) {
        try {
          const start = performance.now();
          const reply = await client.ping();
          if (reply === "PONG") {
            latencyMs = Math.round(performance.now() - start);
          }
        } catch {
          // If ping fails, report as not connected
          return NextResponse.json({
            enabled: true,
            connected: false,
            latencyMs: 0,
            error: "Koneksi Redis terputus saat ping.",
          });
        }
      }
    }

    return NextResponse.json({
      enabled: true,
      connected,
      latencyMs,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        enabled: false,
        connected: false,
        latencyMs: 0,
        error: msg,
      },
      { status: 500 }
    );
  }
}
