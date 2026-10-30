/**
 * EMPIRICAL LIVE REDIS & CHAOS STRESS TEST HARNESS
 * Challenger M1-2 (teamwork_challenger_m1_2)
 *
 * Verifies src/lib/redis.ts against live Redis at 127.0.0.1:6379 and chaos disconnect scenarios.
 */

import {
  getRedisClient,
  isRedisConnected,
  getCache,
  setCache,
  deleteCache,
  deleteCachePattern,
  redisIncr,
  testRedisConnection,
  initializeRedis,
  disconnectRedis,
  _resetRedisStateForTesting,
} from "../src/lib/redis";
import Redis from "ioredis";

interface TestResult {
  category: string;
  name: string;
  passed: boolean;
  expected: unknown;
  actual: unknown;
  details?: string;
}

const results: TestResult[] = [];

function assert(
  category: string,
  name: string,
  actual: unknown,
  expected: unknown,
  details?: string
) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  const passed = actualStr === expectedStr;
  results.push({ category, name, passed, expected, actual, details });
  if (!passed) {
    console.error(
      `❌ FAIL [${category}] ${name}: expected ${expectedStr}, got ${actualStr} ${
        details ? `(${details})` : ""
      }`
    );
  } else {
    console.log(`✅ PASS [${category}] ${name}`);
  }
}

function assertTrue(
  category: string,
  name: string,
  condition: boolean,
  details?: string
) {
  results.push({
    category,
    name,
    passed: condition,
    expected: true,
    actual: condition,
    details,
  });
  if (!condition) {
    console.error(`❌ FAIL [${category}] ${name} ${details ? `(${details})` : ""}`);
  } else {
    console.log(`✅ PASS [${category}] ${name}`);
  }
}

async function run() {
  console.log("===============================================================================");
  console.log("CHALLENGER M1-2: LIVE REDIS & CHAOS TEST HARNESS (127.0.0.1:6379)");
  console.log("===============================================================================\n");

  const LIVE_URL = "redis://127.0.0.1:6379";
  const INVALID_PORT_URL = "redis://127.0.0.1:6399";
  const INVALID_SCHEME_URL = "http://127.0.0.1:6379";

  // Clean raw client for test inspection
  const rawClient = new Redis(LIVE_URL);

  try {
    // --------------------------------------------------------------------------
    // SUITE 1: Connection & Lifecycle against Live Redis
    // --------------------------------------------------------------------------
    console.log("\n--- SUITE 1: Connection & Lifecycle (Live 127.0.0.1:6379) ---");
    await disconnectRedis();

    assert("Lifecycle", "Default uninitialized isConnected", isRedisConnected(), false);
    assert("Lifecycle", "Default uninitialized getRedisClient", getRedisClient(), null);

    const initSuccess = await initializeRedis(LIVE_URL);
    assert("Lifecycle", "initializeRedis with valid URL returns true", initSuccess, true);
    assert("Lifecycle", "isRedisConnected is true after init", isRedisConnected(), true);

    const client = getRedisClient();
    assertTrue("Lifecycle", "getRedisClient returns non-null Redis instance", client !== null);
    if (client) {
      assert("Lifecycle", "client status is ready", client.status, "ready");
    }

    // Idempotent re-initialization with same URL
    const reinitSuccess = await initializeRedis(LIVE_URL);
    assert("Lifecycle", "Re-init with same URL is idempotent", reinitSuccess, true);
    assert("Lifecycle", "Connection stays active after re-init", isRedisConnected(), true);

    // --------------------------------------------------------------------------
    // SUITE 2: testRedisConnection Utility
    // --------------------------------------------------------------------------
    console.log("\n--- SUITE 2: testRedisConnection Utility ---");

    const validTest = await testRedisConnection(LIVE_URL);
    assert("testRedisConnection", "Valid URL connected is true", validTest.connected, true);
    assertTrue(
      "testRedisConnection",
      "Valid URL latencyMs is non-negative number",
      typeof validTest.latencyMs === "number" && validTest.latencyMs >= 0,
      `latencyMs was ${validTest.latencyMs}`
    );
    assert("testRedisConnection", "Valid URL error is undefined", validTest.error, undefined);

    const badPortTest = await testRedisConnection(INVALID_PORT_URL);
    assert("testRedisConnection", "Invalid port connected is false", badPortTest.connected, false);
    assert("testRedisConnection", "Invalid port latencyMs is 0", badPortTest.latencyMs, 0);
    assertTrue(
      "testRedisConnection",
      "Invalid port reports error message",
      typeof badPortTest.error === "string" && badPortTest.error.length > 0,
      `error was: ${badPortTest.error}`
    );

    const badSchemeTest = await testRedisConnection(INVALID_SCHEME_URL);
    assert("testRedisConnection", "Invalid scheme connected is false", badSchemeTest.connected, false);

    // Empty string URL check
    const emptyUrlTest = await testRedisConnection("");
    console.log(`[Diagnostic] testRedisConnection("") result:`, emptyUrlTest);

    // Whitespace only URL check
    const whitespaceTest = await testRedisConnection("   ");
    console.log(`[Diagnostic] testRedisConnection("   ") result:`, whitespaceTest);

    // --------------------------------------------------------------------------
    // SUITE 3: Real Redis Data Store Operations & Types
    // --------------------------------------------------------------------------
    console.log("\n--- SUITE 3: Real Redis Operations & Types ---");

    // Clean keys beforehand
    await rawClient.del(
      "test:obj",
      "test:str",
      "test:num",
      "test:bool",
      "test:arr",
      "test:ttl",
      "test:empty_str",
      "test:zero"
    );

    // 3.1 Complex Object
    const testObj = { id: 101, name: "SMKN 1 Surabaya", tags: ["tech", "vocational"], meta: { active: true } };
    const setObjOk = await setCache("test:obj", testObj, 60);
    assert("Operations", "setCache object returns true", setObjOk, true);
    const getObj = await getCache<typeof testObj>("test:obj");
    assert("Operations", "getCache object matches original deep", getObj, testObj);

    // 3.2 Number & Zero
    await setCache("test:num", 42, 60);
    assert("Operations", "getCache number 42", await getCache<number>("test:num"), 42);
    await setCache("test:zero", 0, 60);
    assert("Operations", "getCache zero preserved as 0 (falsy)", await getCache<number>("test:zero"), 0);

    // 3.3 Boolean
    await setCache("test:bool", false, 60);
    assert("Operations", "getCache false preserved as false", await getCache<boolean>("test:bool"), false);

    // 3.4 Array
    const testArr = [1, "two", { three: 3 }];
    await setCache("test:arr", testArr, 60);
    assert("Operations", "getCache array matches", await getCache<typeof testArr>("test:arr"), testArr);

    // 3.5 Plain String (CRITICAL EMPIRICAL CHALLENGE)
    const testStr = "my-plain-string-value-12345";
    const setStrOk = await setCache("test:str", testStr, 60);
    assert("Operations", "setCache string returns true", setStrOk, true);

    // Check what is stored in raw Redis
    const rawStored = await rawClient.get("test:str");
    console.log(`[Diagnostic] Raw Redis content for "test:str":`, JSON.stringify(rawStored));

    const getStr = await getCache<string>("test:str");
    console.log(`[Diagnostic] getCache("test:str") returned:`, JSON.stringify(getStr));
    assert("Operations", "getCache string matches original", getStr, testStr, "BUG CHECK: string caching round-trip");

    // 3.6 TTL Expiration
    await setCache("test:ttl", { expiring: true }, 1);
    const ttlImmediate = await getCache<{ expiring: boolean }>("test:ttl");
    assert("Operations", "TTL immediate getCache returns object", ttlImmediate, { expiring: true });
    console.log("Waiting 1.2s for TTL expiration...");
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const ttlExpired = await getCache("test:ttl");
    assert("Operations", "TTL expired getCache returns null", ttlExpired, null);

    // 3.7 deleteCache
    await setCache("test:del", { toDelete: true });
    const delOk = await deleteCache("test:del");
    assert("Operations", "deleteCache existing key returns true", delOk, true);
    assert("Operations", "Key deleted returns null in getCache", await getCache("test:del"), null);

    const delNonExistent = await deleteCache("test:non_existent_key_999");
    assert("Operations", "deleteCache non-existent returns true (idempotent)", delNonExistent, true);

    // 3.8 deleteCachePattern across > 100 keys (cursor pagination test)
    console.log("Seeding 150 pattern keys...");
    const pipeline = rawClient.pipeline();
    for (let i = 0; i < 150; i++) {
      pipeline.set(`test:patt:${i}`, `val-${i}`);
    }
    pipeline.set("test:other:survivor", "keep-me");
    await pipeline.exec();

    const deletedPattCount = await deleteCachePattern("test:patt:*");
    console.log(`deleteCachePattern("test:patt:*") deleted: ${deletedPattCount}`);
    assert("Operations", "deleteCachePattern deleted all 150 keys across pages", deletedPattCount, 150);

    const survivor = await rawClient.get("test:other:survivor");
    assert("Operations", "deleteCachePattern preserves non-matching keys", survivor, "keep-me");
    await rawClient.del("test:other:survivor");

    // 3.9 redisIncr
    await rawClient.del("test:rate:incr");
    const count1 = await redisIncr("test:rate:incr", 60);
    assert("Operations", "redisIncr first call returns 1", count1, 1);
    const count2 = await redisIncr("test:rate:incr", 60);
    assert("Operations", "redisIncr second call returns 2", count2, 2);
    const ttlIncr = await rawClient.ttl("test:rate:incr");
    assertTrue("Operations", "redisIncr sets TTL > 0 and <= 60", ttlIncr > 0 && ttlIncr <= 60, `TTL was ${ttlIncr}`);

    // --------------------------------------------------------------------------
    // SUITE 4: Chaos & Disconnect Testing (Resilience & Soft Fallback)
    // --------------------------------------------------------------------------
    console.log("\n--- SUITE 4: Chaos & Disconnect Testing ---");

    // 4.1 Corrupted JSON recovery on live Redis
    await rawClient.set("test:corrupted", "{ malformed json: not valid }");
    const corruptedRes = await getCache("test:corrupted");
    assert("Chaos", "Corrupted JSON in Redis returns null without throwing", corruptedRes, null);
    await rawClient.del("test:corrupted");

    // 4.2 Graceful disconnect
    await disconnectRedis();
    assert("Chaos", "isRedisConnected is false after disconnectRedis()", isRedisConnected(), false);
    assert("Chaos", "getRedisClient is null after disconnectRedis()", getRedisClient(), null);

    // Verify 100% soft fallback when disconnected
    assert("Chaos", "Soft fallback getCache returns null", await getCache("any:key"), null);
    assert("Chaos", "Soft fallback setCache returns false", await setCache("any:key", "val"), false);
    assert("Chaos", "Soft fallback deleteCache returns false", await deleteCache("any:key"), false);
    assert("Chaos", "Soft fallback deleteCachePattern returns 0", await deleteCachePattern("any:*"), 0);
    assert("Chaos", "Soft fallback redisIncr returns null", await redisIncr("any:key", 60), null);

    // 4.3 Reconnect after disconnect
    const reconnectOk = await initializeRedis(LIVE_URL);
    assert("Chaos", "Reconnect after disconnect succeeds", reconnectOk, true);
    assert("Chaos", "isRedisConnected is true after reconnect", isRedisConnected(), true);

    // 4.4 Abrupt socket destruction / kill simulation
    const activeClient = getRedisClient();
    assertTrue("Chaos", "Active client exists before socket chaos", activeClient !== null);
    if (activeClient) {
      console.log("Simulating abrupt socket destruction...");
      activeClient.disconnect(); // force drop connection
      // Wait small tick for close event
      await new Promise((r) => setTimeout(r, 50));
      assert("Chaos", "isRedisConnected becomes false after abrupt disconnect", isRedisConnected(), false);

      // Verify soft fallback immediately kicks in without throwing
      const chaosGet = await getCache("test:obj");
      assert("Chaos", "getCache returns null during connection drop", chaosGet, null);
      const chaosSet = await setCache("test:obj", { val: 1 });
      assert("Chaos", "setCache returns false during connection drop", chaosSet, false);
    }

    // 4.5 initializeRedis with unreachable port (ECONNREFUSED)
    console.log("Testing initializeRedis against unreachable port 6399...");
    const badInit = await initializeRedis(INVALID_PORT_URL);
    assert("Chaos", "initializeRedis with unreachable port returns false", badInit, false);
    assert("Chaos", "isRedisConnected is false after failed init", isRedisConnected(), false);
    assert("Chaos", "getRedisClient is null after failed init", getRedisClient(), null);

    // Soft fallback still works
    assert("Chaos", "Soft fallback getCache returns null after failed init", await getCache("any:key"), null);

    // 4.6 Recovery from failed init to live Redis
    console.log("Testing recovery from failed init back to live Redis...");
    const recoverInit = await initializeRedis(LIVE_URL);
    assert("Chaos", "Recovery to live Redis returns true", recoverInit, true);
    assert("Chaos", "isRedisConnected returns true after recovery", isRedisConnected(), true);

    // 4.7 High Concurrency Burst (50 concurrent requests)
    console.log("Executing high concurrency burst (50 parallel operations)...");
    const burstPromises = Array.from({ length: 50 }, (_, i) =>
      setCache(`test:burst:${i}`, { idx: i }, 30).then((ok) => {
        if (!ok) return false;
        return getCache<{ idx: number }>(`test:burst:${i}`).then((val) => val?.idx === i);
      })
    );
    const burstResults = await Promise.all(burstPromises);
    const burstAllPassed = burstResults.every((r) => r === true);
    assert("Chaos", "50 concurrent set/get operations all succeed", burstAllPassed, true);

    // Clean up burst keys
    await deleteCachePattern("test:burst:*");

  } finally {
    await disconnectRedis();
    rawClient.disconnect();
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log("\n===============================================================================");
  console.log("EMPIRICAL TEST SUMMARY");
  console.log("===============================================================================");
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`Total assertions: ${results.length}`);
  console.log(`Passed: ${passedCount}`);
  console.log(`Failed: ${failedCount}`);

  if (failedCount > 0) {
    console.log("\nFAILED ASSERTIONS:");
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`- [${r.category}] ${r.name}`);
        console.log(`  Expected: ${JSON.stringify(r.expected)}`);
        console.log(`  Actual:   ${JSON.stringify(r.actual)}`);
        if (r.details) console.log(`  Details:  ${r.details}`);
      });
  }

  process.exit(failedCount > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("FATAL UNCAUGHT ERROR IN TEST HARNESS:", err);
  process.exit(2);
});
