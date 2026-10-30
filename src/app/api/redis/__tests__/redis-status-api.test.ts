import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../status/route";

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
  isRedisConnected: vi.fn(),
  getRedisClient: vi.fn(),
}));

vi.mock("@/lib/system-settings", () => ({
  getSystemSettings: vi.fn(),
}));

import { getCurrentUser } from "@/lib/auth";
import { isRedisConnected, getRedisClient } from "@/lib/redis";
import { getSystemSettings } from "@/lib/system-settings";

describe("GET /api/redis/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 if user is not authenticated as superadmin", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

    const res = await GET();
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("should return enabled: false if redis is not enabled in settings", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: 1,
      username: "admin",
      displayName: "Superadmin",
      role: "superadmin",
    });
    vi.mocked(getSystemSettings).mockResolvedValueOnce({
      appName: "Test App",
      logoUrl: null,
      themeColor: "terracotta",
      aiEnabled: false,
      aiRouterUrl: "",
      aiRouterApiKey: null,
      aiRouterModel: "",
      redisEnabled: false,
      redisUrl: null,
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.enabled).toBe(false);
    expect(json.connected).toBe(false);
  });

  it("should return connected: true and latencyMs when ping succeeds", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: 1,
      username: "admin",
      displayName: "Superadmin",
      role: "superadmin",
    });
    vi.mocked(getSystemSettings).mockResolvedValueOnce({
      appName: "Test App",
      logoUrl: null,
      themeColor: "terracotta",
      aiEnabled: false,
      aiRouterUrl: "",
      aiRouterApiKey: null,
      aiRouterModel: "",
      redisEnabled: true,
      redisUrl: "redis://127.0.0.1:6379",
    });
    vi.mocked(isRedisConnected).mockReturnValue(true);
    const pingMock = vi.fn().mockResolvedValue("PONG");
    vi.mocked(getRedisClient).mockReturnValueOnce({
      ping: pingMock,
    } as any);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.enabled).toBe(true);
    expect(json.connected).toBe(true);
    expect(typeof json.latencyMs).toBe("number");
    expect(pingMock).toHaveBeenCalled();
  });
});
