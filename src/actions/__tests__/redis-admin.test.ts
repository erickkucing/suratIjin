import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  testRedisConnectionAction,
  updateRedisSettingsAction,
  getRedisStatusAction,
} from "../redis-admin";

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onDuplicateKeyUpdate: vi.fn().mockResolvedValue({}),
      }),
    }),
  },
}));

vi.mock("@/lib/redis", () => ({
  testRedisConnection: vi.fn(),
  initializeRedis: vi.fn(),
  disconnectRedis: vi.fn(),
  isRedisConnected: vi.fn(),
}));

vi.mock("@/lib/system-settings", () => ({
  invalidateSystemSettingsCache: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { getCurrentUser } from "@/lib/auth";
import {
  testRedisConnection,
  initializeRedis,
  disconnectRedis,
  isRedisConnected,
} from "@/lib/redis";
import { invalidateSystemSettingsCache } from "@/lib/system-settings";

describe("redis-admin server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("testRedisConnectionAction", () => {
    it("should reject non-superadmin users", async () => {
      vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
      const res = await testRedisConnectionAction("redis://127.0.0.1:6379");
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Superadmin/i);
    });

    it("should reject non-superadmin role", async () => {
      vi.mocked(getCurrentUser).mockResolvedValueOnce({
        id: 2,
        username: "guru",
        displayName: "Wali Kelas",
        role: "wali_kelas",
      });
      const res = await testRedisConnectionAction("redis://127.0.0.1:6379");
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Superadmin/i);
    });

    it("should reject empty url", async () => {
      vi.mocked(getCurrentUser).mockResolvedValueOnce({
        id: 1,
        username: "admin",
        displayName: "Superadmin",
        role: "superadmin",
      });
      const res = await testRedisConnectionAction("   ");
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/URL koneksi Redis/i);
    });

    it("should call testRedisConnection and return success result", async () => {
      vi.mocked(getCurrentUser).mockResolvedValueOnce({
        id: 1,
        username: "admin",
        displayName: "Superadmin",
        role: "superadmin",
      });
      vi.mocked(testRedisConnection).mockResolvedValueOnce({
        connected: true,
        latencyMs: 2,
      });

      const res = await testRedisConnectionAction("redis://127.0.0.1:6379");
      expect(res.success).toBe(true);
      expect(res.connected).toBe(true);
      expect(res.latencyMs).toBe(2);
      expect(testRedisConnection).toHaveBeenCalledWith("redis://127.0.0.1:6379");
    });
  });

  describe("updateRedisSettingsAction", () => {
    it("should reject non-superadmin", async () => {
      vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
      const res = await updateRedisSettingsAction({
        redisEnabled: true,
        redisUrl: "redis://127.0.0.1:6379",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Superadmin/i);
    });

    it("should require url when redisEnabled is true", async () => {
      vi.mocked(getCurrentUser).mockResolvedValueOnce({
        id: 1,
        username: "admin",
        displayName: "Superadmin",
        role: "superadmin",
      });
      const res = await updateRedisSettingsAction({
        redisEnabled: true,
        redisUrl: "",
      });
      expect(res.success).toBe(false);
    });

    it("should save settings and initialize redis when enabled", async () => {
      vi.mocked(getCurrentUser).mockResolvedValueOnce({
        id: 1,
        username: "admin",
        displayName: "Superadmin",
        role: "superadmin",
      });
      vi.mocked(initializeRedis).mockResolvedValueOnce(true);

      const res = await updateRedisSettingsAction({
        redisEnabled: true,
        redisUrl: "redis://127.0.0.1:6379",
      });

      expect(res.success).toBe(true);
      expect(initializeRedis).toHaveBeenCalledWith("redis://127.0.0.1:6379");
      expect(invalidateSystemSettingsCache).toHaveBeenCalled();
    });

    it("should disconnect redis when disabled", async () => {
      vi.mocked(getCurrentUser).mockResolvedValueOnce({
        id: 1,
        username: "admin",
        displayName: "Superadmin",
        role: "superadmin",
      });
      vi.mocked(disconnectRedis).mockResolvedValueOnce();

      const res = await updateRedisSettingsAction({
        redisEnabled: false,
        redisUrl: null,
      });

      expect(res.success).toBe(true);
      expect(disconnectRedis).toHaveBeenCalled();
      expect(invalidateSystemSettingsCache).toHaveBeenCalled();
    });
  });

  describe("getRedisStatusAction", () => {
    it("should return connection status for superadmin", async () => {
      vi.mocked(getCurrentUser).mockResolvedValueOnce({
        id: 1,
        username: "admin",
        displayName: "Superadmin",
        role: "superadmin",
      });
      vi.mocked(isRedisConnected).mockReturnValueOnce(true);

      const res = await getRedisStatusAction();
      expect(res.success).toBe(true);
      expect(res.connected).toBe(true);
    });
  });
});
