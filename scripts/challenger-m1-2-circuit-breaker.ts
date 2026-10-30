/**
 * EMPIRICAL CIRCUIT BREAKER STRESS TEST HARNESS
 * Challenger M1-2 (teamwork_challenger_m1_2)
 */

import {
  initializeRedis,
  disconnectRedis,
  getCache,
  setCache,
  isRedisConnected,
  getRedisClient,
  _resetRedisStateForTesting,
} from "../src/lib/redis";

async function testCircuitBreaker() {
  console.log("===============================================================================");
  console.log("CHALLENGER M1-2: CIRCUIT BREAKER STATE TRANSITION TEST");
  console.log("===============================================================================\n");

  const LIVE_URL = "redis://127.0.0.1:6379";
  await initializeRedis(LIVE_URL);

  const client = getRedisClient();
  if (!client) {
    throw new Error("Client not available");
  }

  // 1. Initial State: CLOSED
  console.log("Initial state: isRedisConnected =", isRedisConnected());
  if (!isRedisConnected()) throw new Error("Expected connected");

  // 2. Induce 3 errors by calling a bad command or emitting error on client
  console.log("Simulating 3 consecutive error events...");
  client.emit("error", new Error("Simulated Redis Network Failure 1"));
  client.emit("error", new Error("Simulated Redis Network Failure 2"));
  client.emit("error", new Error("Simulated Redis Network Failure 3"));

  // Verify Circuit Breaker opened
  console.log("After 3 failures: isRedisConnected =", isRedisConnected());
  const circuitIsOpen = !isRedisConnected();
  console.log("Circuit Breaker OPEN test:", circuitIsOpen ? "PASS" : "FAIL");

  // Verify soft fallback while OPEN
  const getWhileOpen = await getCache("test:cb");
  console.log("getCache while circuit OPEN:", getWhileOpen === null ? "PASS (null)" : "FAIL");

  const setWhileOpen = await setCache("test:cb", { data: 1 });
  console.log("setCache while circuit OPEN:", setWhileOpen === false ? "PASS (false)" : "FAIL");

  await disconnectRedis();
}

testCircuitBreaker().catch((err) => {
  console.error("CB Test Error:", err);
  process.exit(1);
});
