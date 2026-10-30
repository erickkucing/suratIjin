import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Hoisted ioredis Mock
// ============================================================================
interface MockRedisInstance {
  url: string;
  options: any;
  status: string;
  store: Map<string, string>;
  eventListeners: Map<string, Array<(...args: any[]) => void>>;
  on: any;
  emit: (event: string, ...args: any[]) => boolean;
  connect: any;
  ping: any;
  get: any;
  set: any;
  del: any;
  scan: any;
  quit: any;
  disconnect: any;
  pipeline: any;
  removeAllListeners: any;
}

const mockRedisInstances: MockRedisInstance[] = [];

vi.mock("ioredis", () => {
  const MockRedis = vi.fn().mockImplementation(function (this: any, url: string, options?: any) {
    this.url = url;
    this.options = options || {};
    this.status = "connecting";
    this.eventListeners = new Map<string, Array<(...args: any[]) => void>>();

    this.on = vi.fn().mockImplementation((event: string, handler: (...args: any[]) => void) => {
      if (!this.eventListeners.has(event)) {
        this.eventListeners.set(event, []);
      }
      this.eventListeners.get(event)!.push(handler);
      return this;
    });

    this.emit = (event: string, ...args: any[]) => {
      const handlers = this.eventListeners.get(event) || [];
      for (const h of handlers) {
        h(...args);
      }
      return handlers.length > 0;
    };

    this.removeAllListeners = vi.fn().mockImplementation(() => {
      this.eventListeners.clear();
      return this;
    });

    this.connect = vi.fn().mockImplementation(async () => {
      if (this.url && this.url.includes("bad-host")) {
        throw new Error("Connection timeout");
      }
      if (this.url && this.url.startsWith("invalid-scheme")) {
        throw new Error("Invalid protocol");
      }
      this.status = "ready";
      this.emit("ready");
      return undefined;
    });

    const store = new Map<string, string>();
    this.store = store;

    this.ping = vi.fn().mockResolvedValue("PONG");
    this.get = vi.fn().mockImplementation((key: string) => Promise.resolve(store.get(key) ?? null));
    this.set = vi.fn().mockImplementation((key: string, val: string) => {
      store.set(key, val);
      return Promise.resolve("OK");
    });
    this.del = vi.fn().mockImplementation((...keys: string[]) => {
      let count = 0;
      for (const k of keys) {
        if (store.delete(k)) count++;
      }
      return Promise.resolve(count);
    });
    this.scan = vi.fn().mockResolvedValue(["0", []]);

    this.quit = vi.fn().mockImplementation(async () => {
      this.status = "end";
      this.emit("end");
      return "OK";
    });

    this.disconnect = vi.fn().mockImplementation(() => {
      this.status = "end";
      this.emit("end");
    });

    this.pipeline = vi.fn().mockImplementation(() => {
      const commands: Array<{ method: string; args: any[] }> = [];
      const pipeObj = {
        incr: vi.fn().mockImplementation((key: string) => {
          commands.push({ method: "incr", args: [key] });
          return pipeObj;
        }),
        expire: vi.fn().mockImplementation((key: string, ttl: number) => {
          commands.push({ method: "expire", args: [key, ttl] });
          return pipeObj;
        }),
        exec: vi.fn().mockImplementation(async () => {
          return commands.map((c) => {
            if (c.method === "incr") return [null, 1];
            if (c.method === "expire") return [null, 1];
            return [null, "OK"];
          });
        }),
      };
      return pipeObj;
    });

    mockRedisInstances.push(this);
  });

  return {
    default: MockRedis,
    Redis: MockRedis,
  };
});

// Import redis module under test
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
} from "../redis";

describe("src/lib/redis.ts - Core Resilient Redis Client", () => {
  beforeEach(async () => {
    await disconnectRedis();
    _resetRedisStateForTesting();
    mockRedisInstances.length = 0;
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Test Case 1: Default uninitialized state
  // --------------------------------------------------------------------------
  describe("1. Default uninitialized state", () => {
    it("should return null for getRedisClient() and false for isRedisConnected()", () => {
      expect(getRedisClient()).toBeNull();
      expect(isRedisConnected()).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Test Case 2: Soft Fallback without throwing when disconnected
  // --------------------------------------------------------------------------
  describe("2. Soft fallback when disconnected", () => {
    it("getCache should return null without throwing", async () => {
      const result = await getCache("test:key");
      expect(result).toBeNull();
    });

    it("setCache should return false without throwing", async () => {
      const result = await setCache("test:key", { data: "test" }, 60);
      expect(result).toBe(false);
    });

    it("deleteCache should return false without throwing", async () => {
      const result = await deleteCache("test:key");
      expect(result).toBe(false);
    });

    it("deleteCachePattern should return 0 without throwing", async () => {
      const result = await deleteCachePattern("test:*");
      expect(result).toBe(0);
    });

    it("redisIncr should return null without throwing", async () => {
      const result = await redisIncr("ratelimit:test", 60);
      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Test Case 3: Cache Operations with JSON Serialization/Deserialization
  // --------------------------------------------------------------------------
  describe("3. Safe getCache / setCache / deleteCache operations", () => {
    beforeEach(async () => {
      await initializeRedis("redis://127.0.0.1:6379");
    });

    it("should serialize objects and store with TTL in setCache", async () => {
      const client = mockRedisInstances[0];
      const payload = { id: 1, name: "SMKN 1 Surabaya", active: true };

      const ok = await setCache("cache:school:1", payload, 300);
      expect(ok).toBe(true);
      expect(client.set).toHaveBeenCalledWith(
        "cache:school:1",
        JSON.stringify(payload),
        "EX",
        300
      );
    });

    it("should serialize objects without TTL if ttlSeconds is omitted", async () => {
      const client = mockRedisInstances[0];
      const payload = ["item1", "item2"];

      const ok = await setCache("cache:list", payload);
      expect(ok).toBe(true);
      expect(client.set).toHaveBeenCalledWith("cache:list", JSON.stringify(payload));
    });

    it("should deserialize valid JSON object in getCache", async () => {
      const client = mockRedisInstances[0];
      const expectedData = { count: 42, label: "Total Students" };
      client.get.mockResolvedValueOnce(JSON.stringify(expectedData));

      const cached = await getCache<{ count: number; label: string }>("cache:stats");
      expect(cached).toEqual(expectedData);
      expect(client.get).toHaveBeenCalledWith("cache:stats");
    });

    it("should correctly preserve falsy JSON values (0, false, empty string)", async () => {
      const client = mockRedisInstances[0];

      client.get.mockResolvedValueOnce(JSON.stringify(0));
      expect(await getCache<number>("key:zero")).toBe(0);

      client.get.mockResolvedValueOnce(JSON.stringify(false));
      expect(await getCache<boolean>("key:false")).toBe(false);

      client.get.mockResolvedValueOnce(JSON.stringify(""));
      expect(await getCache<string>("key:empty")).toBe("");
    });

    it("should return null gracefully on corrupted JSON without throwing SyntaxError", async () => {
      const client = mockRedisInstances[0];
      client.get.mockResolvedValueOnce("malformed_json_{abc:123");

      const result = await getCache("corrupted:key");
      expect(result).toBeNull();
    });

    it("should call client.del and return true on deleteCache", async () => {
      const client = mockRedisInstances[0];
      client.del.mockResolvedValueOnce(1);

      const ok = await deleteCache("cache:target");
      expect(ok).toBe(true);
      expect(client.del).toHaveBeenCalledWith("cache:target");
    });

    it("should scan and delete matching keys in deleteCachePattern", async () => {
      const client = mockRedisInstances[0];
      // Mock 2-page SCAN cursor: "10" then "0"
      client.scan
        .mockResolvedValueOnce(["10", ["cache:dash:1", "cache:dash:2"]])
        .mockResolvedValueOnce(["0", ["cache:dash:3"]]);
      client.del.mockResolvedValue(2);

      const deletedTotal = await deleteCachePattern("cache:dash:*");
      expect(deletedTotal).toBeGreaterThan(0);
      expect(client.scan).toHaveBeenCalledTimes(2);
      expect(client.del).toHaveBeenCalledWith("cache:dash:1", "cache:dash:2");
      expect(client.del).toHaveBeenCalledWith("cache:dash:3");
    });

    it("should handle 0 matches in deleteCachePattern without calling del with empty list", async () => {
      const client = mockRedisInstances[0];
      client.scan.mockResolvedValueOnce(["0", []]);

      const count = await deleteCachePattern("cache:empty:*");
      expect(count).toBe(0);
      expect(client.del).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Test Case 4: Network Error Handling & Circuit Breaker
  // --------------------------------------------------------------------------
  describe("4. Error handling and circuit breaker", () => {
    beforeEach(async () => {
      await initializeRedis("redis://127.0.0.1:6379");
    });

    it("getCache should return null and not throw when Redis command rejects", async () => {
      const client = mockRedisInstances[0];
      client.get.mockRejectedValueOnce(new Error("ECONNRESET: Connection lost"));

      const result = await getCache("any:key");
      expect(result).toBeNull();
    });

    it("setCache should return false and not throw when Redis command rejects", async () => {
      const client = mockRedisInstances[0];
      client.set.mockRejectedValueOnce(new Error("Command timed out after 1000ms"));

      const result = await setCache("any:key", "value", 60);
      expect(result).toBe(false);
    });

    it("deleteCache should return false and not throw when Redis command rejects", async () => {
      const client = mockRedisInstances[0];
      client.del.mockRejectedValueOnce(new Error("CLUSTERDOWN The cluster is down"));

      const result = await deleteCache("any:key");
      expect(result).toBe(false);
    });

    it("deleteCachePattern should return 0 and not throw when scan rejects", async () => {
      const client = mockRedisInstances[0];
      client.scan.mockRejectedValueOnce(new Error("OOM command not allowed"));

      const count = await deleteCachePattern("pattern:*");
      expect(count).toBe(0);
    });

    it("should update isRedisConnected state on connection error/close events", () => {
      const client = mockRedisInstances[0];
      expect(isRedisConnected()).toBe(true);

      // Simulate Redis socket error event
      client.emit("error", new Error("Redis connection dropped"));
      expect(isRedisConnected()).toBe(false);

      // Simulate reconnection
      client.emit("ready");
      expect(isRedisConnected()).toBe(true);

      // Simulate connection close
      client.emit("close");
      expect(isRedisConnected()).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Test Case 5: redisIncr Atomic Increment
  // --------------------------------------------------------------------------
  describe("5. redisIncr atomic increment logic", () => {
    beforeEach(async () => {
      await initializeRedis("redis://127.0.0.1:6379");
    });

    it("should execute increment pipeline and return count", async () => {
      const client = mockRedisInstances[0];
      const count = await redisIncr("ratelimit:login:127.0.0.1", 60);

      expect(count).toBe(1);
      expect(client.pipeline).toHaveBeenCalled();
    });

    it("should return null if pipeline execution fails", async () => {
      const client = mockRedisInstances[0];
      client.pipeline.mockImplementationOnce(() => ({
        incr: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockRejectedValueOnce(new Error("Pipeline failed")),
      }));

      const count = await redisIncr("ratelimit:login:127.0.0.1", 60);
      expect(count).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Test Case 6: testRedisConnection
  // --------------------------------------------------------------------------
  describe("6. testRedisConnection utility", () => {
    it("should return connected=true with latencyMs when connection and ping succeed", async () => {
      const res = await testRedisConnection("redis://127.0.0.1:6379");

      expect(res.connected).toBe(true);
      expect(res.latencyMs).toBeGreaterThanOrEqual(0);
      expect(res.error).toBeUndefined();

      // Check temporary client was quit
      const tempClient = mockRedisInstances[mockRedisInstances.length - 1];
      expect(tempClient.ping).toHaveBeenCalled();
      expect(tempClient.quit).toHaveBeenCalled();
    });

    it("should return connected=false with error message when connection fails", async () => {
      const resPromise = testRedisConnection("redis://invalid-host:6379");
      const tempClient = mockRedisInstances[mockRedisInstances.length - 1];
      tempClient.ping.mockRejectedValueOnce(new Error("ENOTFOUND invalid-host"));

      const res = await resPromise;
      expect(res.connected).toBe(false);
      expect(res.error).toContain("ENOTFOUND invalid-host");
    });

    it("should never throw to caller on unhandled exception", async () => {
      const resPromise = testRedisConnection("invalid-scheme://foo");
      const tempClient = mockRedisInstances[mockRedisInstances.length - 1];
      tempClient.connect.mockRejectedValueOnce(new Error("Invalid protocol"));

      const res = await resPromise;
      expect(res.connected).toBe(false);
      expect(res.error).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Test Case 7: initializeRedis and disconnectRedis Lifecycle
  // --------------------------------------------------------------------------
  describe("7. Lifecycle management (initializeRedis & disconnectRedis)", () => {
    it("should initialize client and mark connected on success", async () => {
      const ok = await initializeRedis("redis://127.0.0.1:6379");
      expect(ok).toBe(true);
      expect(isRedisConnected()).toBe(true);
      expect(getRedisClient()).not.toBeNull();
    });

    it("should return false if connect throws during initializeRedis", async () => {
      const initPromise = initializeRedis("redis://bad-host:6379");
      const pendingClient = mockRedisInstances[mockRedisInstances.length - 1];
      pendingClient.connect.mockRejectedValueOnce(new Error("Connection timeout"));

      const ok = await initPromise;
      expect(ok).toBe(false);
      expect(isRedisConnected()).toBe(false);
      expect(getRedisClient()).toBeNull();
    });

    it("should cleanly disconnect existing client before re-initializing with new URL", async () => {
      await initializeRedis("redis://first-url:6379");
      const firstClient = mockRedisInstances[0];
      expect(isRedisConnected()).toBe(true);

      await initializeRedis("redis://second-url:6379");
      expect(firstClient.quit).toHaveBeenCalled();
      expect(mockRedisInstances.length).toBe(2);
      expect(isRedisConnected()).toBe(true);
    });

    it("should set client to null and isConnected to false on disconnectRedis", async () => {
      await initializeRedis("redis://127.0.0.1:6379");
      const client = mockRedisInstances[0];

      await disconnectRedis();
      expect(client.quit).toHaveBeenCalled();
      expect(isRedisConnected()).toBe(false);
      expect(getRedisClient()).toBeNull();
    });

    it("disconnectRedis should be idempotent when already disconnected", async () => {
      await expect(disconnectRedis()).resolves.not.toThrow();
      expect(isRedisConnected()).toBe(false);
      expect(getRedisClient()).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Test Case 8: String Round-Trip Caching & Serialization Symmetry (Edge Case 1)
  // --------------------------------------------------------------------------
  describe("8. String round-trip caching & serialization symmetry", () => {
    beforeEach(async () => {
      await initializeRedis("redis://127.0.0.1:6379");
    });

    it("should round-trip plain alphanumeric string seamlessly", async () => {
      const ok = await setCache("cache:str:simple", "my-string-value-12345", 60);
      expect(ok).toBe(true);

      const result = await getCache<string>("cache:str:simple");
      expect(result).toBe("my-string-value-12345");
    });

    it("should round-trip file path string for M3 upload deduplication", async () => {
      const filePath = "/uploads/surat/2026/10/surat-izin-sakit.pdf";
      const ok = await setCache("cache:dedup:hash123", filePath, 3600);
      expect(ok).toBe(true);

      const retrieved = await getCache<string>("cache:dedup:hash123");
      expect(retrieved).toBe(filePath);
    });

    it("should round-trip empty string faithfully", async () => {
      const ok = await setCache("cache:str:empty", "", 60);
      expect(ok).toBe(true);

      const retrieved = await getCache<string>("cache:str:empty");
      expect(retrieved).toBe("");
    });

    it("should round-trip multiline OCR text with quotes and special characters", async () => {
      const ocrText = "SURAT IZIN SISWA\nNama: Budi Santoso\nAlasan: \"Sakit Panas\"\nStatus: 'OK'";
      const ok = await setCache("cache:ocr:sha256", ocrText, 86400);
      expect(ok).toBe(true);

      const retrieved = await getCache<string>("cache:ocr:sha256");
      expect(retrieved).toBe(ocrText);
    });

    it("should return null gracefully on unquoted or malformed non-JSON string", async () => {
      const client = mockRedisInstances[mockRedisInstances.length - 1];
      client.get.mockResolvedValueOnce("raw-unquoted-legacy-value");

      const retrieved = await getCache<string>("cache:legacy:raw");
      expect(retrieved).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Test Case 9: Circuit Breaker Cache Miss Recovery (Edge Case 2)
  // --------------------------------------------------------------------------
  describe("9. Circuit breaker recovery on cache miss", () => {
    beforeEach(async () => {
      await initializeRedis("redis://127.0.0.1:6379");
    });

    it("should transition HALF_OPEN probe to CLOSED on cache miss and reset failures", async () => {
      const globalState = (globalThis as any).__suratIjinRedisState;
      expect(globalState).toBeDefined();

      // Simulate HALF_OPEN probing state
      globalState.circuitBreaker.state = "HALF_OPEN";
      globalState.circuitBreaker.failures = 3;
      globalState.circuitBreaker.openedAt = Date.now() - 35000;

      // Cache miss: key does not exist, get returns null
      const client = mockRedisInstances[mockRedisInstances.length - 1];
      client.get.mockResolvedValueOnce(null);

      const result = await getCache("nonexistent:probe:key");
      expect(result).toBeNull();

      // Probing completed successfully -> Redis is healthy -> CLOSED
      expect(globalState.circuitBreaker.state).toBe("CLOSED");
      expect(globalState.circuitBreaker.failures).toBe(0);
    });

    it("should reset accumulated failures to 0 on successful cache miss", async () => {
      const globalState = (globalThis as any).__suratIjinRedisState;
      globalState.circuitBreaker.state = "CLOSED";
      globalState.circuitBreaker.failures = 2;

      const client = mockRedisInstances[mockRedisInstances.length - 1];
      client.get.mockResolvedValueOnce(null);

      const result = await getCache("nonexistent:counter:key");
      expect(result).toBeNull();
      expect(globalState.circuitBreaker.failures).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Test Case 10: Client Serialization Error Isolation (Edge Case 3)
  // --------------------------------------------------------------------------
  describe("10. Client serialization error isolation", () => {
    beforeEach(async () => {
      await initializeRedis("redis://127.0.0.1:6379");
    });

    it("should return false on circular object without incrementing circuit breaker failure count", async () => {
      const globalState = (globalThis as any).__suratIjinRedisState;
      const initialFailures = globalState.circuitBreaker.failures;
      const client = mockRedisInstances[mockRedisInstances.length - 1];

      const circularObj: any = { name: "loop" };
      circularObj.self = circularObj;

      const ok = await setCache("cache:circular:test", circularObj, 60);
      expect(ok).toBe(false);
      expect(globalState.circuitBreaker.failures).toBe(initialFailures);
      expect(globalState.circuitBreaker.state).toBe("CLOSED");
      expect(client.set).not.toHaveBeenCalled();
    });

    it("should not trip circuit breaker after consecutive circular objects", async () => {
      const globalState = (globalThis as any).__suratIjinRedisState;
      const circularObj: any = { title: "bad" };
      circularObj.ref = circularObj;

      for (let i = 0; i < 3; i++) {
        const ok = await setCache(`cache:circular:${i}`, circularObj);
        expect(ok).toBe(false);
      }

      expect(globalState.circuitBreaker.failures).toBe(0);
      expect(globalState.circuitBreaker.state).toBe("CLOSED");
      expect(isRedisConnected()).toBe(true);
    });

    it("should return false when setCache is passed undefined without calling Redis", async () => {
      const globalState = (globalThis as any).__suratIjinRedisState;
      const client = mockRedisInstances[mockRedisInstances.length - 1];

      const ok = await setCache("cache:undefined:test", undefined);
      expect(ok).toBe(false);
      expect(globalState.circuitBreaker.failures).toBe(0);
      expect(client.set).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Test Case 11: Input Validation in testRedisConnection (Edge Case 4)
  // --------------------------------------------------------------------------
  describe("11. Input validation in testRedisConnection", () => {
    it("should return connected=false with error for empty string URL", async () => {
      const res = await testRedisConnection("");
      expect(res.connected).toBe(false);
      expect(res.latencyMs).toBe(0);
      expect(res.error).toBe("URL Redis tidak boleh kosong");
    });

    it("should return connected=false with error for whitespace-only URL", async () => {
      const res = await testRedisConnection("   \t\n  ");
      expect(res.connected).toBe(false);
      expect(res.latencyMs).toBe(0);
      expect(res.error).toBe("URL Redis tidak boleh kosong");
    });

    it("should handle nullish URL safely without throwing", async () => {
      const res = await testRedisConnection(null as unknown as string);
      expect(res.connected).toBe(false);
      expect(res.latencyMs).toBe(0);
      expect(res.error).toBe("URL Redis tidak boleh kosong");
    });
  });

  // --------------------------------------------------------------------------
  // Test Case 12: Robust TTL Validation in redisIncr (Edge Case 5)
  // --------------------------------------------------------------------------
  describe("12. Robust TTL validation and pipeline integrity in redisIncr", () => {
    beforeEach(async () => {
      await initializeRedis("redis://127.0.0.1:6379");
    });

    it("should return null for NaN TTL without executing pipeline", async () => {
      const client = mockRedisInstances[mockRedisInstances.length - 1];
      const res = await redisIncr("ratelimit:test:nan", NaN);
      expect(res).toBeNull();
      expect(client.pipeline).not.toHaveBeenCalled();
    });

    it("should return null for zero or negative TTL without executing pipeline", async () => {
      const client = mockRedisInstances[mockRedisInstances.length - 1];

      expect(await redisIncr("ratelimit:test:zero", 0)).toBeNull();
      expect(await redisIncr("ratelimit:test:neg", -10)).toBeNull();
      expect(client.pipeline).not.toHaveBeenCalled();
    });

    it("should return null for Infinity TTL without executing pipeline", async () => {
      const client = mockRedisInstances[mockRedisInstances.length - 1];
      expect(await redisIncr("ratelimit:test:inf", Infinity)).toBeNull();
      expect(client.pipeline).not.toHaveBeenCalled();
    });

    it("should return null when pipeline expire command returns an error", async () => {
      const client = mockRedisInstances[mockRedisInstances.length - 1];
      client.pipeline.mockImplementationOnce(() => ({
        incr: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValueOnce([
          [null, 1],
          [new Error("ERR value is not an integer or out of range"), null],
        ]),
      }));

      const res = await redisIncr("ratelimit:test:expire_err", 60);
      expect(res).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Test Case 13: Concurrency and Integration with redis-adversarial.test.ts (Edge Case 6)
  // --------------------------------------------------------------------------
  describe("13. Concurrency and integration resilience", () => {
    it("should handle concurrent initializeRedis calls cleanly without socket flaps", async () => {
      const results = await Promise.all([
        initializeRedis("redis://127.0.0.1:6379"),
        initializeRedis("redis://127.0.0.1:6379"),
        initializeRedis("redis://127.0.0.1:6379"),
      ]);

      expect(results).toEqual([true, true, true]);
      expect(isRedisConnected()).toBe(true);
      expect(getRedisClient()).not.toBeNull();
    });
  });
});
