import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { getAiRouterConfig, testAiRouterConnection } from "@/lib/ai-router";

export async function GET(request: NextRequest) {
  try {
    let user = await getCurrentUser();
    if (!user) {
      const cookieHeader = request.headers.get("cookie") || "";
      const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
      const token = request.cookies?.get?.(SESSION_COOKIE_NAME)?.value || (match ? match[1] : null);
      if (token) {
        user = await verifySessionToken(token);
      }
    }

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Sesi tidak valid." },
        { status: 401 }
      );
    }

    const config = await getAiRouterConfig();

    if (!config.enabled) {
      return NextResponse.json(
        {
          success: true,
          enabled: false,
          isConnected: false,
          latencyMs: 0,
          model: config.model,
          models: [],
        },
        {
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        }
      );
    }

    const testRes = await testAiRouterConnection(config);

    return NextResponse.json(
      {
        success: true,
        enabled: true,
        isConnected: testRes.isConnected,
        latencyMs: testRes.latencyMs,
        model: config.model,
        models: testRes.models,
        error: testRes.error,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Gagal memeriksa status AI.",
      },
      { status: 500 }
    );
  }
}
