import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  initializeRedis,
  disconnectRedis,
  getCache,
  setCache,
  deleteCache,
  deleteCachePattern,
  redisIncr,
  testRedisConnection,
  isRedisConnected,
  getRedisClient,
  _resetRedisStateForTesting,
} from "../redis";

describe("Adversarial Challenge & Stress Tests for src/lib/redis.ts", () => {
  const REAL_REDIS_URL = "redis://127.0.0.1:6379";

  afterEach(async () => {
    await disconnectRedis();
    _resetRedisStateForTesting();
  });

  // ==========================================================================
  // CHALLENGE 1: String Cache Retrieval Asymmetry (Critical Flaw Investigation)
  // ==========================================================================
  describe("Challenge 1: String Cache Retrieval Asymmetry", () => {
    it("EMPIRICAL TEST: setCache with plain string then getCache", async () => {
      const initialized = await initializeRedis(REAL_REDIS_URL);
      expect(initialized).toBe(true);

      const testKey = "adv:test:string:1";
      const testVal = "hello_world_surat_ijin";

      // Store a plain string
      const setOk = await setCache(testKey, testVal, 60);
      expect(setOk).toBe(true);

      // Retrieve via getCache
      const retrieved = await getCache<string>(testKey);

      // EXPECTED: "hello_world_surat_ijin"
      // ACTUAL: If redis.ts does typeof value === "string" ? value : JSON.stringify(value),
      // raw is "hello_world_surat_ijin", JSON.parse throws SyntaxError, and getCache returns null!
      console.log("[EMPIRICAL RESULT] getCache with plain string returned:", retrieved);
      expect(retrieved).toBe(testVal);
    });

    it("EMPIRICAL TEST: setCache with file path string (M3 upload dedup scenario)", async () => {
      await initializeRedis(REAL_REDIS_URL);
      const testKey = "adv:dedup:file:1";
      const filePath = "/uploads/surat/2026/10/surat-izin-sakit.pdf";

      await setCache(testKey, filePath, 60);
      const retrieved = await getCache<string>(testKey);

      console.log("[EMPIRICAL RESULT] getCache with filePath returned:", retrieved);
      expect(retrieved).toBe(filePath);
    });

    it("EMPIRICAL TEST: setCache with JSON-like strings vs plain strings", async () => {
      await initializeRedis(REAL_REDIS_URL);

      // A numeric string "123"
      await setCache("adv:str:num", "123", 60);
      const numResult = await getCache<any>("adv:str:num");
      console.log("[EMPIRICAL RESULT] getCache with '123' returned:", typeof numResult, numResult);

      // A boolean string "true"
      await setCache("adv:str:bool", "true", 60);
      const boolResult = await getCache<any>("adv:str:bool");
      console.log("[EMPIRICAL RESULT] getCache with 'true' returned:", typeof boolResult, boolResult);
    });
  });

  // ==========================================================================
  // CHALLENGE 2: Cache Miss during HALF_OPEN Circuit Breaker (Recovery Lockout)
  // ==========================================================================
  describe("Challenge 2: Circuit Breaker Cache Miss & State Transitions", () => {
    it("EMPIRICAL TEST: Cache miss should reset or complete HALF_OPEN probe", async () => {
      await initializeRedis(REAL_REDIS_URL);

      // Inspect global state via globalThis
      const globalState = (globalThis as any).__suratIjinRedisState;
      expect(globalState).toBeDefined();

      // Simulate circuit breaker in HALF_OPEN
      globalState.circuitBreaker.state = "HALF_OPEN";
      globalState.circuitBreaker.failures = 3;
      globalState.circuitBreaker.openedAt = Date.now() - 35000;

      // Execute getCache for a NON-EXISTENT key (Cache Miss)
      const missKey = "adv:nonexistent:key:" + Date.now();
      const result = await getCache(missKey);
      expect(result).toBeNull();

      console.log(
        "[EMPIRICAL RESULT] Circuit state after cache miss in HALF_OPEN:",
        globalState.circuitBreaker.state,
        "failures:",
        globalState.circuitBreaker.failures
      );

      // In a proper circuit breaker, a successful execution (even a cache miss) proves Redis is healthy!
      // If line 122 returns null before recordSuccess(), the breaker remains stuck in HALF_OPEN!
      expect(globalState.circuitBreaker.state).toBe("CLOSED");
    });

    it("EMPIRICAL TEST: Cache miss after 2 errors should reset failure counter", async () => {
      await initializeRedis(REAL_REDIS_URL);
      const globalState = (globalThis as any).__suratIjinRedisState;

      // Simulate 2 previous errors
      globalState.circuitBreaker.failures = 2;
      globalState.circuitBreaker.state = "CLOSED";

      // Execute a normal cache miss
      await getCache("adv:nonexistent:counter:test");

      console.log(
        "[EMPIRICAL RESULT] Circuit failures after cache miss:",
        globalState.circuitBreaker.failures
      );

      // A successful Redis roundtrip should reset failures counter!
      expect(globalState.circuitBreaker.failures).toBe(0);
    });
  });

  // ==========================================================================
  // CHALLENGE 3: Extreme & Malformed Inputs / Payload Stress
  // ==========================================================================
  describe("Challenge 3: Extreme Inputs & Malformed Payloads", () => {
    it("should handle huge 5MB payload without crashing", async () => {
      await initializeRedis(REAL_REDIS_URL);

      const hugeString = "x".repeat(5 * 1024 * 1024); // 5 MB
      const hugeObject = {
        title: "Huge Report",
        data: hugeString,
        timestamp: Date.now(),
      };

      const setOk = await setCache("adv:huge:payload", hugeObject, 30);
      expect(setOk).toBe(true);

      const retrieved = await getCache<typeof hugeObject>("adv:huge:payload");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.data.length).toBe(hugeString.length);

      await deleteCache("adv:huge:payload");
    });

    it("should handle serialization error (circular reference) without breaking breaker", async () => {
      await initializeRedis(REAL_REDIS_URL);
      const globalState = (globalThis as any).__suratIjinRedisState;
      const initialFailures = globalState.circuitBreaker.failures;

      // Circular reference object
      const circularObj: any = { name: "loop" };
      circularObj.self = circularObj;

      const setOk = await setCache("adv:circular", circularObj);
      expect(setOk).toBe(false);

      console.log(
        "[EMPIRICAL RESULT] Circuit failures after circular object serialization error:",
        globalState.circuitBreaker.failures
      );

      // Serialization is a client caller error, NOT a Redis infrastructure outage!
      // If failures increased, 3 client formatting errors would trip the entire Redis circuit breaker!
      expect(globalState.circuitBreaker.failures).toBe(initialFailures);
    });

    it("should handle invalid TTL values (negative, zero, NaN, Infinity) safely", async () => {
      await initializeRedis(REAL_REDIS_URL);

      // Negative TTL
      const resNeg = await setCache("adv:ttl:neg", { a: 1 }, -10);
      expect(typeof resNeg).toBe("boolean");

      // Zero TTL
      const resZero = await setCache("adv:ttl:zero", { a: 1 }, 0);
      expect(typeof resZero).toBe("boolean");

      // NaN TTL in redisIncr
      const incrNaN = await redisIncr("adv:incr:nan", NaN);
      console.log("[EMPIRICAL RESULT] redisIncr with NaN TTL:", incrNaN);

      // Negative TTL in redisIncr
      const incrNeg = await redisIncr("adv:incr:neg", -5);
      console.log("[EMPIRICAL RESULT] redisIncr with negative TTL:", incrNeg);
    });

    it("should handle empty string, whitespace, and special characters in testRedisConnection", async () => {
      // Empty string
      const resEmpty = await testRedisConnection("");
      console.log("[EMPIRICAL RESULT] testRedisConnection('') result:", resEmpty);

      // Whitespace
      const resWhitespace = await testRedisConnection("   ");
      console.log("[EMPIRICAL RESULT] testRedisConnection('   ') result:", resWhitespace);

      // Invalid protocol
      const resHttp = await testRedisConnection("http://127.0.0.1:6379");
      console.log("[EMPIRICAL RESULT] testRedisConnection('http://...') result:", resHttp);
      expect(resHttp.connected).toBe(false);

      // Completely invalid string
      const resGibberish = await testRedisConnection("gibberish-not-a-url");
      console.log("[EMPIRICAL RESULT] testRedisConnection('gibberish') result:", resGibberish);
      expect(resGibberish.connected).toBe(false);
    });
  });

  // ==========================================================================
  // CHALLENGE 4: Rapid Consecutive Lifecycle & Concurrency
  // ==========================================================================
  describe("Challenge 4: Rapid Consecutive Lifecycle & Concurrency", () => {
    it("should survive rapid concurrent initializeRedis calls without crashing", async () => {
      // Launch 20 concurrent initialize calls
      const promises = Array.from({ length: 20 }, (_, i) =>
        initializeRedis(REAL_REDIS_URL)
      );

      const results = await Promise.allSettled(promises);
      const allSucceeded = results.every(
        (r) => r.status === "fulfilled" && r.value === true
      );

      console.log(
        "[EMPIRICAL RESULT] 20 concurrent initialize calls:",
        results.map((r) => (r.status === "fulfilled" ? r.value : "rejected"))
      );

      expect(isRedisConnected()).toBe(true);
      expect(getRedisClient()).not.toBeNull();
    });

    it("should survive rapid alternating initialize and disconnect calls", async () => {
      for (let i = 0; i < 15; i++) {
        await initializeRedis(REAL_REDIS_URL);
        expect(isRedisConnected()).toBe(true);
        await disconnectRedis();
        expect(isRedisConnected()).toBe(false);
      }
    });

    it("should survive interleaved parallel initialize and disconnect", async () => {
      const ops = [
        initializeRedis(REAL_REDIS_URL),
        disconnectRedis(),
        initializeRedis(REAL_REDIS_URL),
        disconnectRedis(),
        initializeRedis(REAL_REDIS_URL),
      ];

      await Promise.allSettled(ops);
      // Ensure state is clean and deterministically resettable
      await disconnectRedis();
      expect(isRedisConnected()).toBe(false);
      expect(getRedisClient()).toBeNull();
    });
  });

  // ==========================================================================
  // CHALLENGE 5: Soft Fallback Guarantees Under Error Storms
  // ==========================================================================
  describe("Challenge 5: Soft Fallback Under Error Storms", () => {
    it("should guarantee soft fallback when Redis server is unreachable", async () => {
      // Connect to dead port
      const initDead = await initializeRedis("redis://127.0.0.1:49999");
      expect(initDead).toBe(false);
      expect(isRedisConnected()).toBe(false);

      // Verify all operations gracefully fallback
      expect(await getCache("adv:dead:key")).toBeNull();
      expect(await setCache("adv:dead:key", "val")).toBe(false);
      expect(await deleteCache("adv:dead:key")).toBe(false);
      expect(await deleteCachePattern("adv:dead:*")).toBe(0);
      expect(await redisIncr("adv:dead:key", 60)).toBeNull();
    });

    it("should trip circuit breaker after 3 failures and immediately soft fallback", async () => {
      await initializeRedis(REAL_REDIS_URL);
      const globalState = (globalThis as any).__suratIjinRedisState;

      // Force mock error on client.get
      const client = globalState.client;
      expect(client).not.toBeNull();

      const origGet = client.get.bind(client);
      client.get = vi.fn().mockRejectedValue(new Error("Simulated Redis Failure"));

      // 1st error
      await getCache("err:1");
      expect(globalState.circuitBreaker.failures).toBe(1);
      expect(globalState.circuitBreaker.state).toBe("CLOSED");

      // 2nd error
      await getCache("err:2");
      expect(globalState.circuitBreaker.failures).toBe(2);
      expect(globalState.circuitBreaker.state).toBe("CLOSED");

      // 3rd error -> should OPEN breaker
      await getCache("err:3");
      expect(globalState.circuitBreaker.failures).toBe(3);
      expect(globalState.circuitBreaker.state).toBe("OPEN");
      expect(isRedisConnected()).toBe(false);

      // 4th call while OPEN: should short-circuit without calling client.get!
      const callsBefore = client.get.mock.calls.length;
      const resShortCircuit = await getCache("err:4");
      expect(resShortCircuit).toBeNull();
      expect(client.get.mock.calls.length).toBe(callsBefore);

      console.log(
        "[EMPIRICAL RESULT] Circuit Breaker successfully OPEN and short-circuited call 4."
      );

      // Restore client.get
      client.get = origGet;
    });
  });
});
