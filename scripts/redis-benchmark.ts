// Native Node 20+ env file loader
try {
  process.loadEnvFile("/opt/surat-ijin/.env");
} catch {
  // Best-effort
}

import { db } from "@/db";
import { classes } from "@/db/schema";
import { getClassDashboardData, getAdminOverviewData } from "@/db/queries";
import { checkRateLimit } from "@/lib/rate-limiter";
import {
  initializeRedis,
  disconnectRedis,
  getCache,
  setCache,
  deleteCache,
  getRedisClient,
  isRedisConnected,
} from "@/lib/redis";

function calculatePercentiles(latencies: number[]) {
  const sorted = [...latencies].sort((a, b) => a - b);
  const count = sorted.length;
  const p50 = sorted[Math.floor(count * 0.5)] || 0;
  const p90 = sorted[Math.floor(count * 0.9)] || 0;
  const p95 = sorted[Math.floor(count * 0.95)] || 0;
  const p99 = sorted[Math.floor(count * 0.99)] || 0;
  const avg = sorted.reduce((sum, val) => sum + val, 0) / count;
  const min = sorted[0] || 0;
  const max = sorted[count - 1] || 0;

  return { avg, p50, p90, p95, p99, min, max };
}

async function runBenchmark() {
  console.log("==========================================================");
  console.log("🚀 REDIS CACHING & PERFORMANCE QUANTITATIVE BENCHMARK");
  console.log("==========================================================");

  // Ensure Redis is initialized
  await initializeRedis("redis://127.0.0.1:6379");
  const redis = getRedisClient();

  if (!redis || !isRedisConnected()) {
    console.error("❌ Redis is not connected. Benchmark aborted.");
    process.exit(1);
  }

  // Fetch test class
  const testClass = await db.query.classes.findFirst();
  if (!testClass) {
    console.error("❌ No class found for benchmark.");
    process.exit(1);
  }

  console.log(`📌 Target Class: ${testClass.name} (ID: ${testClass.id})`);
  const ITERATIONS = 50;

  // ----------------------------------------------------
  // TEST 1: Class Dashboard Data (MySQL MISS vs Redis HIT)
  // ----------------------------------------------------
  console.log(`\n[1/3] Benchmarking getClassDashboardData (${ITERATIONS} iterations)...`);
  const missLatencies: number[] = [];
  const hitLatencies: number[] = [];

  // Warmup & ensure cache clean for MISS
  const cacheKey = `cache:dashboard:class:${testClass.id}:all`;

  for (let i = 0; i < ITERATIONS; i++) {
    // Force cache MISS by deleting key before query
    await deleteCache(cacheKey);
    const startMiss = performance.now();
    await getClassDashboardData(testClass.id, {});
    const endMiss = performance.now();
    missLatencies.push(endMiss - startMiss);

    // Now key is cached -> measure HIT
    const startHit = performance.now();
    await getClassDashboardData(testClass.id, {});
    const endHit = performance.now();
    hitLatencies.push(endHit - startHit);
  }

  const missStats = calculatePercentiles(missLatencies);
  const hitStats = calculatePercentiles(hitLatencies);
  const dashboardSpeedup = missStats.avg / hitStats.avg;

  // ----------------------------------------------------
  // TEST 2: Admin Overview Data (MySQL MISS vs Redis HIT)
  // ----------------------------------------------------
  console.log(`[2/3] Benchmarking getAdminOverviewData (${ITERATIONS} iterations)...`);
  const adminMissLatencies: number[] = [];
  const adminHitLatencies: number[] = [];
  const adminCacheKey = "cache:dashboard:admin:overview";

  for (let i = 0; i < ITERATIONS; i++) {
    await deleteCache(adminCacheKey);
    const startMiss = performance.now();
    await getAdminOverviewData();
    const endMiss = performance.now();
    adminMissLatencies.push(endMiss - startMiss);

    const startHit = performance.now();
    await getAdminOverviewData();
    const endHit = performance.now();
    adminHitLatencies.push(endHit - startHit);
  }

  const adminMissStats = calculatePercentiles(adminMissLatencies);
  const adminHitStats = calculatePercentiles(adminHitLatencies);
  const adminSpeedup = adminMissStats.avg / adminHitStats.avg;

  // ----------------------------------------------------
  // TEST 3: Distributed Rate Limiter Latency
  // ----------------------------------------------------
  console.log(`[3/3] Benchmarking Sliding Window Rate Limiter (100 operations)...`);
  const rateLimitLatencies: number[] = [];
  const rateLimitKey = "benchmark-client-ip-test";

  for (let i = 0; i < 100; i++) {
    const start = performance.now();
    await checkRateLimit(rateLimitKey);
    const end = performance.now();
    rateLimitLatencies.push(end - start);
  }

  const rateLimitStats = calculatePercentiles(rateLimitLatencies);

  // ----------------------------------------------------
  // Memory & Redis Info
  // ----------------------------------------------------
  const memoryInfo = await redis.info("memory");
  const usedMemoryMatch = memoryInfo.match(/used_memory_human:(.*)/);
  const usedMemoryPeakMatch = memoryInfo.match(/used_memory_peak_human:(.*)/);

  const usedMemory = usedMemoryMatch ? usedMemoryMatch[1].trim() : "N/A";
  const usedMemoryPeak = usedMemoryPeakMatch ? usedMemoryPeakMatch[1].trim() : "N/A";

  const statsInfo = await redis.info("stats");
  const totalCommandsMatch = statsInfo.match(/total_commands_processed:(.*)/);
  const totalCommands = totalCommandsMatch ? totalCommandsMatch[1].trim() : "N/A";

  // Print Summary Table
  console.log("\n==========================================================");
  console.log("📊 QUANTITATIVE BENCHMARK RESULTS (Summary)");
  console.log("==========================================================");

  console.table([
    {
      Workload: "Class Dashboard (MySQL Direct)",
      Avg_ms: missStats.avg.toFixed(2),
      p50_ms: missStats.p50.toFixed(2),
      p95_ms: missStats.p95.toFixed(2),
      p99_ms: missStats.p99.toFixed(2),
      Speedup: "1.00x (Baseline)",
    },
    {
      Workload: "Class Dashboard (Redis HIT)",
      Avg_ms: hitStats.avg.toFixed(2),
      p50_ms: hitStats.p50.toFixed(2),
      p95_ms: hitStats.p95.toFixed(2),
      p99_ms: hitStats.p99.toFixed(2),
      Speedup: `${dashboardSpeedup.toFixed(2)}x Faster 🚀`,
    },
    {
      Workload: "Admin Overview (MySQL Direct)",
      Avg_ms: adminMissStats.avg.toFixed(2),
      p50_ms: adminMissStats.p50.toFixed(2),
      p95_ms: adminMissStats.p95.toFixed(2),
      p99_ms: adminMissStats.p99.toFixed(2),
      Speedup: "1.00x (Baseline)",
    },
    {
      Workload: "Admin Overview (Redis HIT)",
      Avg_ms: adminHitStats.avg.toFixed(2),
      p50_ms: adminHitStats.p50.toFixed(2),
      p95_ms: adminHitStats.p95.toFixed(2),
      p99_ms: adminHitStats.p99.toFixed(2),
      Speedup: `${adminSpeedup.toFixed(2)}x Faster 🚀`,
    },
    {
      Workload: "Distributed Rate Limiter",
      Avg_ms: rateLimitStats.avg.toFixed(2),
      p50_ms: rateLimitStats.p50.toFixed(2),
      p95_ms: rateLimitStats.p95.toFixed(2),
      p99_ms: rateLimitStats.p99.toFixed(2),
      Speedup: "Sub-millisecond Ops",
    },
  ]);

  console.log("----------------------------------------------------------");
  console.log(`💾 Redis Used Memory:      ${usedMemory}`);
  console.log(`📈 Redis Peak Memory:      ${usedMemoryPeak}`);
  console.log(`⚡ Total Commands Processed: ${totalCommands}`);
  console.log("==========================================================");

  await disconnectRedis();
  process.exit(0);
}

runBenchmark().catch((err) => {
  console.error("Benchmark failed with error:", err);
  process.exit(1);
});
