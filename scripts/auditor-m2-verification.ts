/**
 * FORENSIC AUDITOR M2 EMPIRICAL VERIFICATION HARNESS
 * Independently verifies rate limiter Redis execution, TTL, atomic INCR,
 * dual-bucket protection, and silent in-memory fallback.
 */

import {
  initializeRedis,
  disconnectRedis,
  getRedisClient,
  isRedisConnected,
  deleteCachePattern,
  _resetRedisStateForTesting,
} from "../src/lib/redis";
import {
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
  checkDualRateLimit,
  recordDualFailedAttempt,
  resetDualRateLimit,
  _clearRateLimitStoreForTesting,
} from "../src/lib/rate-limiter";

async function runForensicAudit() {
  console.log("===============================================================================");
  console.log("FORENSIC AUDITOR M2: EMPIRICAL VERIFICATION HARNESS");
  console.log("===============================================================================\n");

  const REDIS_URL = "redis://127.0.0.1:6379";
  const checks: { name: string; pass: boolean; details: string }[] = [];

  function recordCheck(name: string, pass: boolean, details: string) {
    checks.push({ name, pass, details });
    console.log(`[${pass ? "PASS" : "FAIL"}] ${name} - ${details}`);
    if (!pass) {
      console.error(`FATAL: Verification failed for check: ${name}`);
    }
  }

  // -------------------------------------------------------------------------
  // TEST 1: Live Redis Connection & Key Format / TTL Validation
  // -------------------------------------------------------------------------
  console.log("\n--- TEST 1: Live Redis Key Format & TTL Validation ---");
  await initializeRedis(REDIS_URL);
  const client = getRedisClient();
  if (!client || !isRedisConnected()) {
    throw new Error("Unable to connect to test Redis instance");
  }

  const testKey1 = "forensic:test:user1";
  const expectedRedisKey = `ratelimit:${testKey1}`;

  await deleteCachePattern("ratelimit:forensic:*");
  _clearRateLimitStoreForTesting();

  // Initial check: not blocked, remaining = 5
  const initialCheck = await checkRateLimit(testKey1, 5, 60 * 1000);
  recordCheck(
    "1.1 Initial check on empty Redis key",
    !initialCheck.isBlocked && initialCheck.remainingAttempts === 5 && initialCheck.retryAfterSeconds === 0,
    `isBlocked=${initialCheck.isBlocked}, remaining=${initialCheck.remainingAttempts}`
  );

  // 1st failed attempt
  const attempt1 = await recordFailedAttempt(testKey1, 5, 60 * 1000);
  const rawVal1 = await client.get(expectedRedisKey);
  const ttl1 = await client.ttl(expectedRedisKey);

  recordCheck(
    "1.2 Raw Redis key created with INCR",
    rawVal1 === "1" && attempt1.remainingAttempts === 4 && !attempt1.isBlocked,
    `rawVal=${rawVal1}, attempt1.remaining=${attempt1.remainingAttempts}`
  );

  recordCheck(
    "1.3 Raw Redis TTL set properly (sliding window)",
    ttl1 > 0 && ttl1 <= 60,
    `ttl=${ttl1}s (window=60s)`
  );

  // -------------------------------------------------------------------------
  // TEST 2: Atomic Concurrency & Brute-Force Blocking on Redis
  // -------------------------------------------------------------------------
  console.log("\n--- TEST 2: Atomic Concurrency & Brute-Force Blocking on Redis ---");
  const testKey2 = "forensic:test:concurrent";
  const redisKey2 = `ratelimit:${testKey2}`;
  await deleteCachePattern("ratelimit:forensic:*");

  // Send 20 concurrent failed attempts at the exact same millisecond
  const results = await Promise.all(
    Array.from({ length: 20 }, () => recordFailedAttempt(testKey2, 5, 60 * 1000))
  );

  const blockedCount = results.filter((r) => r.isBlocked).length;
  const passedCount = results.filter((r) => !r.isBlocked).length;
  const rawFinalVal = await client.get(redisKey2);

  recordCheck(
    "2.1 Atomic INCR count in Redis after 20 concurrent requests",
    rawFinalVal === "20",
    `rawFinalVal in Redis=${rawFinalVal}`
  );

  recordCheck(
    "2.2 Correct blocked vs unblocked distribution (limit=5)",
    passedCount === 4 && blockedCount === 16,
    `unblocked=${passedCount}, blocked=${blockedCount} (out of 20)`
  );

  // Subsequent checkRateLimit must report blocked
  const checkAfterBurst = await checkRateLimit(testKey2, 5, 60 * 1000);
  recordCheck(
    "2.3 Subsequent checkRateLimit reports blocked with 0 remaining",
    checkAfterBurst.isBlocked && checkAfterBurst.remainingAttempts === 0,
    `isBlocked=${checkAfterBurst.isBlocked}, remaining=${checkAfterBurst.remainingAttempts}`
  );

  // -------------------------------------------------------------------------
  // TEST 3: Genuine Redis Purge on resetRateLimit
  // -------------------------------------------------------------------------
  console.log("\n--- TEST 3: Genuine Redis Purge on resetRateLimit ---");
  await resetRateLimit(testKey2);
  const existsAfterReset = await client.exists(redisKey2);
  const checkAfterReset = await checkRateLimit(testKey2, 5, 60 * 1000);

  recordCheck(
    "3.1 Raw Redis key deleted upon resetRateLimit",
    existsAfterReset === 0,
    `exists=${existsAfterReset}`
  );

  recordCheck(
    "3.2 Quota fully restored after resetRateLimit",
    !checkAfterReset.isBlocked && checkAfterReset.remainingAttempts === 5,
    `isBlocked=${checkAfterReset.isBlocked}, remaining=${checkAfterReset.remainingAttempts}`
  );

  // -------------------------------------------------------------------------
  // TEST 4: Dual-Bucket Rate Limiting (IP + Target Protection)
  // -------------------------------------------------------------------------
  console.log("\n--- TEST 4: Dual-Bucket Rate Limiting Protection ---");
  const targetAccountKey = "forensic:dual:target:teacher1";
  const config = { maxAttempts: 5, windowMs: 60 * 1000 };

  // Attacker uses 4 rotating IPs
  for (let i = 1; i <= 4; i++) {
    const ipKey = `forensic:dual:ip:10.0.99.${i}`;
    const res = await recordDualFailedAttempt(ipKey, targetAccountKey, config, config);
    if (res.isBlocked) {
      throw new Error(`Unexpectedly blocked at attempt ${i}`);
    }
  }

  // 5th attempt from a brand-new IP targeting the same account
  const ipKey5 = "forensic:dual:ip:10.0.99.5";
  const blockedFifth = await recordDualFailedAttempt(ipKey5, targetAccountKey, config, config);

  recordCheck(
    "4.1 Target account bucket blocks rotating attacker IPs on 5th attempt",
    blockedFifth.isBlocked && blockedFifth.remainingAttempts === 0,
    `isBlocked=${blockedFifth.isBlocked}, remaining=${blockedFifth.remainingAttempts}`
  );

  // Check from fresh 6th IP
  const freshIpCheck = await checkDualRateLimit("forensic:dual:ip:10.0.99.6", targetAccountKey, config, config);
  recordCheck(
    "4.2 Target account check blocks 6th unattempted IP",
    freshIpCheck.isBlocked,
    `isBlocked=${freshIpCheck.isBlocked}`
  );

  // Reset dual rate limit
  await resetDualRateLimit(ipKey5, targetAccountKey);
  const postResetCheck = await checkDualRateLimit(ipKey5, targetAccountKey, config, config);
  recordCheck(
    "4.3 Dual reset restores quota across both buckets",
    !postResetCheck.isBlocked && postResetCheck.remainingAttempts === 5,
    `isBlocked=${postResetCheck.isBlocked}, remaining=${postResetCheck.remainingAttempts}`
  );

  // -------------------------------------------------------------------------
  // TEST 5: Silent Soft Fallback to In-Memory Map when Redis Disconnected
  // -------------------------------------------------------------------------
  console.log("\n--- TEST 5: Silent Soft Fallback to In-Memory Map ---");
  await disconnectRedis();
  _resetRedisStateForTesting();
  _clearRateLimitStoreForTesting();

  recordCheck(
    "5.1 Redis disconnected verification",
    !isRedisConnected(),
    `isRedisConnected=${isRedisConnected()}`
  );

  const fallbackKey = "fallback:standalone:user";
  for (let i = 1; i <= 4; i++) {
    const res = await recordFailedAttempt(fallbackKey, 5, 60 * 1000);
    recordCheck(
      `5.2 In-memory attempt ${i} recorded`,
      !res.isBlocked && res.remainingAttempts === 5 - i,
      `remaining=${res.remainingAttempts}`
    );
  }

  const fallbackBlocked = await recordFailedAttempt(fallbackKey, 5, 60 * 1000);
  recordCheck(
    "5.3 In-memory fallback blocks on 5th attempt",
    fallbackBlocked.isBlocked && fallbackBlocked.remainingAttempts === 0,
    `isBlocked=${fallbackBlocked.isBlocked}, remaining=${fallbackBlocked.remainingAttempts}`
  );

  await resetRateLimit(fallbackKey);
  const fallbackRestored = await checkRateLimit(fallbackKey, 5, 60 * 1000);
  recordCheck(
    "5.4 In-memory fallback unblocks on resetRateLimit",
    !fallbackRestored.isBlocked && fallbackRestored.remainingAttempts === 5,
    `isBlocked=${fallbackRestored.isBlocked}, remaining=${fallbackRestored.remainingAttempts}`
  );

  // -------------------------------------------------------------------------
  // SUMMARY VERDICT
  // -------------------------------------------------------------------------
  console.log("\n===============================================================================");
  const allPassed = checks.every((c) => c.pass);
  console.log(`TOTAL CHECKS: ${checks.length}`);
  console.log(`PASSED: ${checks.filter((c) => c.pass).length}`);
  console.log(`FAILED: ${checks.filter((c) => !c.pass).length}`);
  console.log(`OVERALL VERDICT: ${allPassed ? "CLEAN" : "INTEGRITY VIOLATION"}`);
  console.log("===============================================================================\n");

  if (!allPassed) {
    process.exit(1);
  }
}

runForensicAudit()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Forensic audit error:", err);
    process.exit(1);
  });
