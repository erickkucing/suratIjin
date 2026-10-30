/**
 * EMPIRICAL CHALLENGER M3-1: CACHING INVALIDATION & BENCHMARK STRESS HARNESS
 * Verifies query latency benchmarks, pattern invalidation accuracy (with prefix safety),
 * mutation invalidation, and high-concurrency stress (20-50 simultaneous calls).
 */

import { performance } from "perf_hooks";
import { db } from "../src/db";
import {
  getClassDashboardData,
  getAdminOverviewData,
  invalidateClassDashboardCache,
  invalidateAdminOverviewCache,
  getClassDashboardCacheKey,
  ADMIN_OVERVIEW_CACHE_KEY,
} from "../src/db/queries";
import {
  getSystemSettings,
  invalidateSystemSettingsCache,
  SETTINGS_CACHE_KEY,
} from "../src/lib/system-settings";
import {
  initializeRedis,
  disconnectRedis,
  getRedisClient,
  isRedisConnected,
  getCache,
  setCache,
  deleteCache,
  deleteCachePattern,
} from "../src/lib/redis";

interface CheckResult {
  suite: string;
  test: string;
  passed: boolean;
  details: string;
  metrics?: Record<string, any>;
}

async function runEmpiricalHarness() {
  console.log("===============================================================================");
  console.log("EMPIRICAL CHALLENGER M3-1: CACHING & BENCHMARK STRESS HARNESS");
  console.log("===============================================================================\n");

  const results: CheckResult[] = [];
  const REDIS_URL = "redis://127.0.0.1:6379";

  function record(test: string, suite: string, passed: boolean, details: string, metrics?: Record<string, any>) {
    results.push({ suite, test, passed, details, metrics });
    console.log(`[${passed ? "PASS" : "FAIL"}] [${suite}] ${test}`);
    console.log(`       Details: ${details}`);
    if (metrics) {
      console.log(`       Metrics: ${JSON.stringify(metrics)}`);
    }
  }

  // Connect to Redis
  await initializeRedis(REDIS_URL);
  const redisClient = getRedisClient();
  if (!redisClient || !isRedisConnected()) {
    throw new Error("Unable to connect to Redis at " + REDIS_URL);
  }

  // Discover class in DB
  const sampleClass = await db.query.classes.findFirst();
  if (!sampleClass) {
    throw new Error("No class found in database. Please ensure DB has at least 1 class.");
  }
  const classId = sampleClass.id;
  console.log(`Target class for benchmarking: ID=${classId}, Name=${sampleClass.name}\n`);

  // -------------------------------------------------------------------------
  // SUITE 1: COLD VS WARM QUERY LATENCY BENCHMARK
  // -------------------------------------------------------------------------
  console.log("--- SUITE 1: Cold vs Warm Query Latency Benchmark ---");

  // Benchmark 1.1: getClassDashboardData
  {
    await invalidateClassDashboardCache(classId);
    await new Promise((r) => setTimeout(r, 50));

    // Verify cold
    const cacheKey = getClassDashboardCacheKey(classId);
    const preCheck = await getCache(cacheKey);
    if (preCheck !== null) {
      await deleteCache(cacheKey);
    }

    // Measure Cold
    const t0 = performance.now();
    const coldData = await getClassDashboardData(classId);
    const coldMs = performance.now() - t0;

    // Verify key in Redis & TTL
    const rawTtl = await redisClient.ttl(cacheKey);
    const keyExists = rawTtl > 0 && rawTtl <= 60;

    // Measure 10 Warm calls
    const warmLatencies: number[] = [];
    for (let i = 0; i < 10; i++) {
      const tw0 = performance.now();
      const warmData = await getClassDashboardData(classId);
      const twMs = performance.now() - tw0;
      warmLatencies.push(twMs);
    }

    const avgWarm = warmLatencies.reduce((a, b) => a + b, 0) / warmLatencies.length;
    const minWarm = Math.min(...warmLatencies);
    const maxWarm = Math.max(...warmLatencies);
    const speedup = coldMs / avgWarm;

    record(
      "1.1 getClassDashboardData latency benchmark",
      "Benchmark",
      keyExists && avgWarm < coldMs,
      `Cold: ${coldMs.toFixed(2)}ms, Avg Warm: ${avgWarm.toFixed(2)}ms (${minWarm.toFixed(2)} - ${maxWarm.toFixed(2)}ms). Speedup: ${speedup.toFixed(1)}x. TTL: ${rawTtl}s`,
      { coldMs: Number(coldMs.toFixed(2)), avgWarmMs: Number(avgWarm.toFixed(2)), speedupFactor: Number(speedup.toFixed(2)), ttl: rawTtl }
    );
  }

  // Benchmark 1.2: getAdminOverviewData
  {
    await invalidateAdminOverviewCache();
    await new Promise((r) => setTimeout(r, 50));

    // Measure Cold
    const t0 = performance.now();
    const coldData = await getAdminOverviewData();
    const coldMs = performance.now() - t0;

    // Verify key in Redis & TTL
    const rawTtl = await redisClient.ttl(ADMIN_OVERVIEW_CACHE_KEY);
    const keyExists = rawTtl > 0 && rawTtl <= 30;

    // Measure 10 Warm calls
    const warmLatencies: number[] = [];
    for (let i = 0; i < 10; i++) {
      const tw0 = performance.now();
      const warmData = await getAdminOverviewData();
      const twMs = performance.now() - tw0;
      warmLatencies.push(twMs);
    }

    const avgWarm = warmLatencies.reduce((a, b) => a + b, 0) / warmLatencies.length;
    const minWarm = Math.min(...warmLatencies);
    const maxWarm = Math.max(...warmLatencies);
    const speedup = coldMs / avgWarm;

    record(
      "1.2 getAdminOverviewData latency benchmark",
      "Benchmark",
      keyExists && avgWarm < coldMs,
      `Cold: ${coldMs.toFixed(2)}ms, Avg Warm: ${avgWarm.toFixed(2)}ms (${minWarm.toFixed(2)} - ${maxWarm.toFixed(2)}ms). Speedup: ${speedup.toFixed(1)}x. TTL: ${rawTtl}s`,
      { coldMs: Number(coldMs.toFixed(2)), avgWarmMs: Number(avgWarm.toFixed(2)), speedupFactor: Number(speedup.toFixed(2)), ttl: rawTtl }
    );
  }

  // Benchmark 1.3: getSystemSettings
  {
    await invalidateSystemSettingsCache();
    await new Promise((r) => setTimeout(r, 50));

    // Measure Cold
    const t0 = performance.now();
    const coldSettings = await getSystemSettings();
    const coldMs = performance.now() - t0;

    const rawTtl = await redisClient.ttl(SETTINGS_CACHE_KEY);
    const keyExists = rawTtl > 0 && rawTtl <= 300;

    // Measure 10 Warm calls
    const warmLatencies: number[] = [];
    for (let i = 0; i < 10; i++) {
      const tw0 = performance.now();
      await getSystemSettings();
      const twMs = performance.now() - tw0;
      warmLatencies.push(twMs);
    }

    const avgWarm = warmLatencies.reduce((a, b) => a + b, 0) / warmLatencies.length;
    const speedup = coldMs / (avgWarm || 0.01);

    record(
      "1.3 getSystemSettings latency benchmark",
      "Benchmark",
      keyExists,
      `Cold: ${coldMs.toFixed(2)}ms, Avg Warm: ${avgWarm.toFixed(2)}ms. Speedup: ${speedup.toFixed(1)}x. TTL: ${rawTtl}s`,
      { coldMs: Number(coldMs.toFixed(2)), avgWarmMs: Number(avgWarm.toFixed(2)), speedupFactor: Number(speedup.toFixed(2)), ttl: rawTtl }
    );
  }

  // -------------------------------------------------------------------------
  // SUITE 2: PATTERN INVALIDATION ACCURACY & CLASS ISOLATION
  // -------------------------------------------------------------------------
  console.log("\n--- SUITE 2: Pattern Invalidation Accuracy & Class Isolation ---");

  // Clean test namespace
  await deleteCachePattern("cache:dashboard:class:*");

  // Seed keys for Class 1 (Class A)
  const classA_Keys = [
    "cache:dashboard:class:1:all",
    "cache:dashboard:class:1:filter_alpha_112233",
    "cache:dashboard:class:1:filter_beta_445566",
  ];
  for (const k of classA_Keys) {
    await setCache(k, { classId: 1, key: k, dummy: "classA_data" }, 120);
  }

  // Seed keys for Class 2 (Class B)
  const classB_Keys = [
    "cache:dashboard:class:2:all",
    "cache:dashboard:class:2:filter_alpha_112233",
    "cache:dashboard:class:2:filter_gamma_778899",
  ];
  for (const k of classB_Keys) {
    await setCache(k, { classId: 2, key: k, dummy: "classB_data" }, 120);
  }

  // Seed keys for Class 10 (Prefix collision test: 'class:1:*' must NOT match 'class:10:*')
  const class10_Keys = [
    "cache:dashboard:class:10:all",
    "cache:dashboard:class:10:filter_alpha_112233",
  ];
  for (const k of class10_Keys) {
    await setCache(k, { classId: 10, key: k, dummy: "class10_data" }, 120);
  }

  // Verify all keys are present before invalidation
  let preCountClassA = 0;
  for (const k of classA_Keys) {
    if ((await getCache(k)) !== null) preCountClassA++;
  }
  let preCountClassB = 0;
  for (const k of classB_Keys) {
    if ((await getCache(k)) !== null) preCountClassB++;
  }
  let preCountClass10 = 0;
  for (const k of class10_Keys) {
    if ((await getCache(k)) !== null) preCountClass10++;
  }

  record(
    "2.1 Setup multi-class dashboard cache keys",
    "PatternInvalidation",
    preCountClassA === 3 && preCountClassB === 3 && preCountClass10 === 2,
    `Class A: ${preCountClassA}/3, Class B: ${preCountClassB}/3, Class 10: ${preCountClass10}/2 initialized`
  );

  // Invalidate ONLY Class 1
  console.log("Calling invalidateClassDashboardCache(1)...");
  await invalidateClassDashboardCache(1);

  // Check Class A keys (must be purged)
  let postCountClassA = 0;
  for (const k of classA_Keys) {
    if ((await getCache(k)) !== null) postCountClassA++;
  }

  // Check Class B keys (must be preserved)
  let postCountClassB = 0;
  for (const k of classB_Keys) {
    if ((await getCache(k)) !== null) postCountClassB++;
  }

  // Check Class 10 keys (must be preserved - anti-prefix bug check)
  let postCountClass10 = 0;
  for (const k of class10_Keys) {
    if ((await getCache(k)) !== null) postCountClass10++;
  }

  record(
    "2.2 Class A keys purged after invalidateClassDashboardCache(1)",
    "PatternInvalidation",
    postCountClassA === 0,
    `Class A remaining keys: ${postCountClassA}/3 (Expected: 0)`
  );

  record(
    "2.3 Class B keys preserved after invalidateClassDashboardCache(1)",
    "PatternInvalidation",
    postCountClassB === 3,
    `Class B remaining keys: ${postCountClassB}/3 (Expected: 3)`
  );

  record(
    "2.4 Class 10 keys preserved (Prefix Isolation Guard)",
    "PatternInvalidation",
    postCountClass10 === 2,
    `Class 10 remaining keys: ${postCountClass10}/2 (Expected: 2, no regex/glob prefix bleed)`
  );

  // Invalidate ALL classes without classId
  console.log("Calling invalidateClassDashboardCache() [all classes]...");
  await invalidateClassDashboardCache();

  let remainingAfterAll = 0;
  for (const k of [...classA_Keys, ...classB_Keys, ...class10_Keys]) {
    if ((await getCache(k)) !== null) remainingAfterAll++;
  }

  record(
    "2.5 Wildcard invalidateClassDashboardCache() purges all class keys",
    "PatternInvalidation",
    remainingAfterAll === 0,
    `Remaining keys after wildcard purge: ${remainingAfterAll} (Expected: 0)`
  );

  // -------------------------------------------------------------------------
  // SUITE 3: MUTATION CACHE INVALIDATION
  // -------------------------------------------------------------------------
  console.log("\n--- SUITE 3: Mutation Cache Invalidation ---");

  // Step 3.1: Admin Overview Invalidation
  await getAdminOverviewData();
  const overviewBefore = await getCache(ADMIN_OVERVIEW_CACHE_KEY);
  await invalidateAdminOverviewCache();
  const overviewAfter = await getCache(ADMIN_OVERVIEW_CACHE_KEY);

  record(
    "3.1 invalidateAdminOverviewCache deletes overview key",
    "MutationInvalidation",
    overviewBefore !== null && overviewAfter === null,
    `Key existed before: ${overviewBefore !== null}, purged after: ${overviewAfter === null}`
  );

  // Step 3.2: System Settings Invalidation
  await getSystemSettings();
  const settingsBefore = await getCache(SETTINGS_CACHE_KEY);
  await invalidateSystemSettingsCache();
  const settingsAfter = await getCache(SETTINGS_CACHE_KEY);

  record(
    "3.2 invalidateSystemSettingsCache deletes settings key",
    "MutationInvalidation",
    settingsBefore !== null && settingsAfter === null,
    `Key existed before: ${settingsBefore !== null}, purged after: ${settingsAfter === null}`
  );

  // -------------------------------------------------------------------------
  // SUITE 4: HIGH CONCURRENCY STRESS TEST (20-50 SIMULTANEOUS CALLS)
  // -------------------------------------------------------------------------
  console.log("\n--- SUITE 4: High Concurrency Stress Test ---");

  // Subtest 4.1a: Warm Cache Concurrency (20 simultaneous requests)
  {
    await getClassDashboardData(classId);

    const CONCURRENCY = 20;
    console.log(`Firing ${CONCURRENCY} simultaneous calls to getClassDashboardData on warm cache...`);
    const tStart = performance.now();

    const tasks = Array.from({ length: CONCURRENCY }, (_, idx) =>
      getClassDashboardData(classId).then((data) => ({ idx, data, error: null })).catch((err) => ({ idx, data: null, error: err }))
    );

    const outcomes = await Promise.all(tasks);
    const durationMs = performance.now() - tStart;

    const failed = outcomes.filter((o) => o.error !== null);
    const successful = outcomes.filter((o) => o.data !== null);

    let deepEqualMatches = 0;
    if (successful.length > 0) {
      const baseline = JSON.stringify(successful[0].data);
      for (const item of successful) {
        if (JSON.stringify(item.data) === baseline) {
          deepEqualMatches++;
        }
      }
    }

    const first = successful[0]?.data;
    const structureValid =
      first &&
      first.classInfo &&
      first.classInfo.id === classId &&
      Array.isArray(first.studentsList) &&
      Array.isArray(first.records) &&
      first.summary &&
      typeof first.totalClassStudents === "number";

    record(
      "4.1a Warm concurrency stress (20 parallel requests)",
      "Concurrency",
      failed.length === 0 && deepEqualMatches === CONCURRENCY && Boolean(structureValid),
      `Resolved ${successful.length}/${CONCURRENCY} in ${durationMs.toFixed(2)}ms (${(durationMs / CONCURRENCY).toFixed(2)}ms/req). 100% payload deep equality (${deepEqualMatches}/${CONCURRENCY}). Errors: ${failed.length}`,
      { concurrency: CONCURRENCY, durationMs: Number(durationMs.toFixed(2)), avgPerReqMs: Number((durationMs / CONCURRENCY).toFixed(2)), errors: failed.length }
    );
  }

  // Subtest 4.1b: Warm Cache Concurrency (50 simultaneous requests)
  {
    await getClassDashboardData(classId);

    const CONCURRENCY = 50;
    console.log(`Firing ${CONCURRENCY} simultaneous calls to getClassDashboardData on warm cache...`);
    const tStart = performance.now();

    const tasks = Array.from({ length: CONCURRENCY }, (_, idx) =>
      getClassDashboardData(classId).then((data) => ({ idx, data, error: null })).catch((err) => ({ idx, data: null, error: err }))
    );

    const outcomes = await Promise.all(tasks);
    const durationMs = performance.now() - tStart;

    const failed = outcomes.filter((o) => o.error !== null);
    const successful = outcomes.filter((o) => o.data !== null);

    let deepEqualMatches = 0;
    let baselineSerialized = "";
    if (successful.length > 0) {
      baselineSerialized = JSON.stringify(successful[0].data);
      for (const item of successful) {
        if (JSON.stringify(item.data) === baselineSerialized) {
          deepEqualMatches++;
        }
      }
    }

    const first = successful[0]?.data;
    const structureValid =
      first &&
      first.classInfo &&
      first.classInfo.id === classId &&
      Array.isArray(first.studentsList) &&
      Array.isArray(first.records) &&
      first.summary &&
      typeof first.totalClassStudents === "number";

    record(
      "4.1b Warm concurrency stress (50 parallel requests)",
      "Concurrency",
      failed.length === 0 && deepEqualMatches === CONCURRENCY && Boolean(structureValid),
      `Resolved ${successful.length}/${CONCURRENCY} in ${durationMs.toFixed(2)}ms (${(durationMs / CONCURRENCY).toFixed(2)}ms/req). 100% payload deep equality (${deepEqualMatches}/${CONCURRENCY}). Errors: ${failed.length}`,
      { concurrency: CONCURRENCY, durationMs: Number(durationMs.toFixed(2)), avgPerReqMs: Number((durationMs / CONCURRENCY).toFixed(2)), errors: failed.length }
    );
  }

  // Subtest 4.2: Cold Cache Concurrency (Within MySQL Pool Limit: 5 concurrent DB requests)
  {
    await invalidateClassDashboardCache(classId);
    await new Promise((r) => setTimeout(r, 50));

    const COLD_CONCURRENCY = 5;
    console.log(`Firing ${COLD_CONCURRENCY} simultaneous calls to getClassDashboardData on COLD cache...`);
    const tStart = performance.now();

    const tasks = Array.from({ length: COLD_CONCURRENCY }, (_, idx) =>
      getClassDashboardData(classId).then((data) => ({ idx, data, error: null })).catch((err) => ({ idx, data: null, error: err }))
    );

    const outcomes = await Promise.all(tasks);
    const durationMs = performance.now() - tStart;

    const failed = outcomes.filter((o) => o.error !== null);
    if (failed.length > 0) {
      console.log(`Cold concurrency encountered ${failed.length} errors:`, failed[0].error);
    }
    const successful = outcomes.filter((o) => o.data !== null);

    let deepEqualMatches = 0;
    if (successful.length > 0) {
      const baseline = JSON.stringify(successful[0].data);
      for (const item of successful) {
        if (JSON.stringify(item.data) === baseline) {
          deepEqualMatches++;
        }
      }
    }

    const postStampedeKey = getClassDashboardCacheKey(classId);
    const cacheAfterStampede = await getCache(postStampedeKey);

    record(
      "4.2 Cold concurrency under pool limit (5 parallel DB requests = ~30 queries)",
      "Concurrency",
      failed.length === 0 && deepEqualMatches === COLD_CONCURRENCY && cacheAfterStampede !== null,
      `Resolved ${successful.length}/${COLD_CONCURRENCY} in ${durationMs.toFixed(2)}ms. Deep equality: ${deepEqualMatches}/${COLD_CONCURRENCY}. Resulting cache populated: ${cacheAfterStampede !== null}. Errors: ${failed.length}`,
      { coldConcurrency: COLD_CONCURRENCY, durationMs: Number(durationMs.toFixed(2)), errors: failed.length }
    );
  }

  // -------------------------------------------------------------------------
  // SUITE 5: SOFT FALLBACK & CHAOS RESILIENCE
  // -------------------------------------------------------------------------
  console.log("\n--- SUITE 5: Soft Fallback & Chaos Resilience ---");

  // Disconnect Redis
  await disconnectRedis();
  const disconnected = !isRedisConnected();

  let fallbackClassDataOk = false;
  let fallbackOverviewOk = false;
  let fallbackSettingsOk = false;
  let fallbackInvalidateOk = false;

  try {
    const classData = await getClassDashboardData(classId);
    fallbackClassDataOk = classData && classData.classInfo.id === classId;
  } catch (e) {
    console.error("Soft fallback error on getClassDashboardData:", e);
  }

  try {
    const overview = await getAdminOverviewData();
    fallbackOverviewOk = overview && Array.isArray(overview.classes);
  } catch (e) {
    console.error("Soft fallback error on getAdminOverviewData:", e);
  }

  try {
    const settings = await getSystemSettings();
    fallbackSettingsOk = settings && typeof settings.appName === "string";
  } catch (e) {
    console.error("Soft fallback error on getSystemSettings:", e);
  }

  try {
    await invalidateClassDashboardCache(classId);
    await invalidateAdminOverviewCache();
    await invalidateSystemSettingsCache();
    fallbackInvalidateOk = true;
  } catch (e) {
    console.error("Soft fallback error on invalidation calls:", e);
  }

  record(
    "5.1 Soft Fallback execution when Redis is completely disconnected",
    "SoftFallback",
    disconnected && fallbackClassDataOk && fallbackOverviewOk && fallbackSettingsOk && fallbackInvalidateOk,
    `Disconnected: ${disconnected}, ClassDashboard fallback: ${fallbackClassDataOk}, Overview fallback: ${fallbackOverviewOk}, Settings fallback: ${fallbackSettingsOk}, Invalidation fallback: ${fallbackInvalidateOk}`
  );

  // Reconnect Redis for post-checks
  await initializeRedis(REDIS_URL);

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log("\n===============================================================================");
  console.log("HARNESS EXECUTION SUMMARY");
  console.log("===============================================================================");

  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`Total checks: ${total} | Passed: ${passed} | Failed: ${failed}`);

  // Disconnect clean
  await disconnectRedis();

  if (failed > 0) {
    console.error(`\nFAILED CHECKS COUNT: ${failed}`);
    process.exit(1);
  } else {
    console.log("\nALL EMPIRICAL TESTS PASSED SUCCESSFULLY.");
    process.exit(0);
  }
}

runEmpiricalHarness().catch((err) => {
  console.error("Harness fatal execution error:", err);
  process.exit(1);
});
