import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../index";
import {
  getClassDashboardData,
  getAdminOverviewData,
  invalidateClassDashboardCache,
  invalidateAdminOverviewCache,
  getClassDashboardCacheKey,
  ADMIN_OVERVIEW_CACHE_KEY,
} from "../queries";
import {
  initializeRedis,
  disconnectRedis,
  getCache,
  isRedisConnected,
} from "@/lib/redis";

describe("Queries Redis Caching, Invalidation & Soft Fallback", () => {
  let classId: number;

  beforeAll(async () => {
    const cls = await db.query.classes.findFirst();
    if (!cls) {
      throw new Error("No class found. Run db:seed.");
    }
    classId = cls.id;
  });

  afterAll(async () => {
    await disconnectRedis();
  });

  it("should populate Redis cache on getClassDashboardData and hit cache on subsequent call", async () => {
    await initializeRedis("redis://127.0.0.1:6379");
    await invalidateClassDashboardCache(classId);

    const first = await getClassDashboardData(classId);
    expect(first).toBeDefined();

    const expectedKey = getClassDashboardCacheKey(classId);
    const cached = await getCache<any>(expectedKey);
    expect(cached).toBeDefined();
    expect(cached.classInfo.id).toBe(classId);
    expect(cached.totalClassStudents).toBe(first.totalClassStudents);

    // Call again -> returns cached data
    const second = await getClassDashboardData(classId);
    expect(second.totalClassStudents).toBe(first.totalClassStudents);
  });

  it("should cache filtered queries with unique hash keys", async () => {
    await initializeRedis("redis://127.0.0.1:6379");

    const izinData = await getClassDashboardData(classId, { status: "Izin" });
    const izinKey = getClassDashboardCacheKey(classId, { status: "Izin" });
    expect(izinKey).not.toContain(":all");

    const cachedIzin = await getCache<any>(izinKey);
    expect(cachedIzin).toBeDefined();
    expect(cachedIzin.records.length).toBe(izinData.records.length);
  });

  it("should invalidate class dashboard pattern when invalidateClassDashboardCache is called", async () => {
    await initializeRedis("redis://127.0.0.1:6379");

    // Populate "all" and "status: Izin"
    await getClassDashboardData(classId);
    await getClassDashboardData(classId, { status: "Izin" });

    const key1 = getClassDashboardCacheKey(classId);
    const key2 = getClassDashboardCacheKey(classId, { status: "Izin" });

    expect(await getCache(key1)).not.toBeNull();
    expect(await getCache(key2)).not.toBeNull();

    // Invalidate
    await invalidateClassDashboardCache(classId);

    expect(await getCache(key1)).toBeNull();
    expect(await getCache(key2)).toBeNull();
  });

  it("should cache getAdminOverviewData and invalidate on invalidateAdminOverviewCache", async () => {
    await initializeRedis("redis://127.0.0.1:6379");
    await invalidateAdminOverviewCache();

    const overview = await getAdminOverviewData();
    expect(overview.classes.length).toBeGreaterThan(0);

    const cachedOverview = await getCache<any>(ADMIN_OVERVIEW_CACHE_KEY);
    expect(cachedOverview).toBeDefined();
    expect(cachedOverview.classes.length).toBe(overview.classes.length);

    await invalidateAdminOverviewCache();
    expect(await getCache(ADMIN_OVERVIEW_CACHE_KEY)).toBeNull();
  });

  it("should execute queries with 100% soft fallback when Redis is disconnected", async () => {
    await disconnectRedis();
    expect(isRedisConnected()).toBe(false);

    // When disconnected, calling invalidation and queries must not throw errors
    await expect(invalidateClassDashboardCache(classId)).resolves.not.toThrow();
    await expect(invalidateAdminOverviewCache()).resolves.not.toThrow();

    const dashboard = await getClassDashboardData(classId);
    expect(dashboard).toBeDefined();
    expect(dashboard.classInfo.id).toBe(classId);

    const overview = await getAdminOverviewData();
    expect(overview).toBeDefined();
    expect(overview.classes.length).toBeGreaterThan(0);
  });
});
