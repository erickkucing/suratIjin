/**
 * EMPIRICAL ADVERSARIAL STRESS TEST HARNESS
 * Challenger 2 (teamwork_challenger_sec_r1_2)
 *
 * Scope:
 * 1. SEC-VULN-03: Port Binding Isolation (Ports 3001 and 3306)
 *    - Probe listening ports with system socket connections
 *    - Verify 127.0.0.1 loopback connections succeed
 *    - Verify non-loopback interface connections are refused
 *    - Verify systemd unit configurations and properties persist
 *
 * 2. SEC-VULN-05: File Download Rate Limiting & Spoofing Resistance
 *    - Empirical burst simulation against /api/files/... route handler
 *    - Adversarial header spoofing (X-Forwarded-For rotation under fixed CF-Connecting-IP)
 *    - Exact 60/61 request threshold verification
 *    - RFC 6585 Retry-After header and response payload validation
 *    - Client IP isolation (Client B unaffected by Client A block)
 */

import net from "net";
import os from "os";
import fs from "fs";
import { execSync } from "child_process";
import { NextRequest } from "next/server";
import { GET } from "../src/app/api/files/[...path]/route";
import { _clearRateLimitStoreForTesting, getClientIp } from "../src/lib/rate-limiter";

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  actual: unknown;
  expected: unknown;
  details?: string;
}

const results: TestResult[] = [];

function assert(suite: string, name: string, condition: boolean, actual: unknown, expected: unknown, details?: string) {
  results.push({ suite, name, passed: condition, actual, expected, details });
  const icon = condition ? "✅ PASS" : "❌ FAIL";
  console.log(`${icon} [${suite}] ${name} ${details ? "- " + details : ""}`);
  if (!condition) {
    console.error(`   Expected: ${JSON.stringify(expected)}`);
    console.error(`   Actual:   ${JSON.stringify(actual)}`);
  }
}

function probeTcpConnection(host: string, port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isConnected = false;

    socket.setTimeout(timeoutMs);

    socket.on("connect", () => {
      isConnected = true;
      socket.destroy();
      resolve(true);
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });

    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

async function runChallenger2Suite() {
  console.log("===============================================================================");
  console.log("CHALLENGER 2: EMPIRICAL ADVERSARIAL STRESS TESTING (SEC-VULN-03 & SEC-VULN-05)");
  console.log("===============================================================================\n");

  // ============================================================================
  // SUITE 1: SEC-VULN-03 Port Binding Isolation
  // ============================================================================
  console.log("--- SUITE 1: SEC-VULN-03 Port Binding Isolation ---");

  // 1.1 Verify Loopback Connection Succeeds
  const loopback3001 = await probeTcpConnection("127.0.0.1", 3001);
  assert("SEC-VULN-03", "Loopback TCP probe to 127.0.0.1:3001 (Next.js)", loopback3001, loopback3001, true, "Connection accepted");

  const loopback3306 = await probeTcpConnection("127.0.0.1", 3306);
  assert("SEC-VULN-03", "Loopback TCP probe to 127.0.0.1:3306 (MariaDB)", loopback3306, loopback3306, true, "Connection accepted");

  // 1.2 Detect non-loopback network interfaces
  const netInterfaces = os.networkInterfaces();
  const nonLoopbackIps: string[] = [];

  for (const name of Object.keys(netInterfaces)) {
    for (const iface of netInterfaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        nonLoopbackIps.push(iface.address);
      }
    }
  }

  console.log(`Detected non-loopback IPv4 interfaces: ${nonLoopbackIps.join(", ")}`);

  // 1.3 Verify Non-Loopback Interfaces REJECT connection
  for (const nonLoopbackIp of nonLoopbackIps) {
    const ext3001 = await probeTcpConnection(nonLoopbackIp, 3001);
    assert("SEC-VULN-03", `External probe rejected on ${nonLoopbackIp}:3001`, !ext3001, ext3001, false, "Connection refused");

    const ext3306 = await probeTcpConnection(nonLoopbackIp, 3306);
    assert("SEC-VULN-03", `External probe rejected on ${nonLoopbackIp}:3306`, !ext3306, ext3306, false, "Connection refused");
  }

  // 1.4 Verify Configuration Files on Disk
  const suratIjinService = fs.readFileSync("/etc/systemd/system/surat-ijin.service", "utf-8");
  const has127Binding = suratIjinService.includes("-H 127.0.0.1 -p 3001");
  const hasWildcardNext = suratIjinService.includes("0.0.0.0");
  assert("SEC-VULN-03", "surat-ijin.service binds strictly to 127.0.0.1", has127Binding && !hasWildcardNext, { has127Binding, hasWildcardNext }, { has127Binding: true, hasWildcardNext: false });

  const mariadbOverride = fs.readFileSync("/etc/systemd/system/mariadb.socket.d/override.conf", "utf-8");
  const has127MariaDb = mariadbOverride.includes("ListenStream=127.0.0.1:3306");
  assert("SEC-VULN-03", "mariadb.socket override binds strictly to 127.0.0.1:3306", has127MariaDb, has127MariaDb, true);

  // 1.5 Verify systemctl daemon-reload and live properties
  try {
    execSync("systemctl daemon-reload", { stdio: "pipe" });
    const socketShow = execSync("systemctl show mariadb.socket -p Listen", { encoding: "utf-8" });
    const serviceShow = execSync("systemctl show surat-ijin.service -p ExecStart", { encoding: "utf-8" });

    assert("SEC-VULN-03", "mariadb.socket active Listen contains 127.0.0.1:3306", socketShow.includes("127.0.0.1:3306"), true, true, socketShow.trim());
    assert("SEC-VULN-03", "mariadb.socket active Listen does NOT contain 0.0.0.0 or wildcard", !socketShow.includes("0.0.0.0:3306") && !socketShow.includes("[::]:3306"), true, true);
    assert("SEC-VULN-03", "surat-ijin.service active ExecStart contains -H 127.0.0.1", serviceShow.includes("-H 127.0.0.1"), true, true, serviceShow.trim());
  } catch (err) {
    assert("SEC-VULN-03", "systemctl inspection command", false, String(err), "zero exit code");
  }

  // ============================================================================
  // SUITE 2: SEC-VULN-05 File Download Rate Limiting & Adversarial Spoofing
  // ============================================================================
  console.log("\n--- SUITE 2: SEC-VULN-05 File Download Rate Limiting & Adversarial Spoofing ---");

  _clearRateLimitStoreForTesting();

  const ipClientA = "203.0.113.199";
  const ipClientB = "198.51.100.50";

  // 2.1 Test Header Priority in getClientIp
  const reqPriority1 = new NextRequest("http://127.0.0.1:3001", {
    headers: {
      "cf-connecting-ip": "103.21.244.2",
      "x-real-ip": "198.51.100.2",
      "x-forwarded-for": "198.51.100.1, 10.0.0.1",
    },
  });
  const resolvedIp1 = await getClientIp(reqPriority1);
  assert("SEC-VULN-05", "CF-Connecting-IP takes precedence over X-Real-IP and X-Forwarded-For", resolvedIp1 === "103.21.244.2", resolvedIp1, "103.21.244.2");

  const reqPriority2 = new NextRequest("http://127.0.0.1:3001", {
    headers: {
      "x-real-ip": "198.51.100.2",
      "x-forwarded-for": "198.51.100.1",
    },
  });
  const resolvedIp2 = await getClientIp(reqPriority2);
  assert("SEC-VULN-05", "X-Real-IP takes precedence over X-Forwarded-For when CF-Connecting-IP is absent", resolvedIp2 === "198.51.100.2", resolvedIp2, "198.51.100.2");

  const reqPriority3 = new NextRequest("http://127.0.0.1:3001", {
    headers: {
      "x-forwarded-for": "198.51.100.1, 10.0.0.1",
    },
  });
  const resolvedIp3 = await getClientIp(reqPriority3);
  assert("SEC-VULN-05", "First comma-separated IP in X-Forwarded-For is extracted", resolvedIp3 === "198.51.100.1", resolvedIp3, "198.51.100.1");

  const reqSanitize = new NextRequest("http://127.0.0.1:3001", {
    headers: {
      "cf-connecting-ip": "evil.ip; drop table users; --",
      "x-forwarded-for": "198.51.100.99",
    },
  });
  const resolvedSanitized = await getClientIp(reqSanitize);
  assert("SEC-VULN-05", "Malicious or un-sanitized IP header is safely rejected and falls back", resolvedSanitized === "198.51.100.99", resolvedSanitized, "198.51.100.99");

  // 2.2 Burst Simulation: Requests 1..60 for Client A
  console.log("Simulating 60 burst requests for Client A...");
  let burstPassed = true;
  for (let i = 1; i <= 60; i++) {
    const req = new NextRequest("http://127.0.0.1:3001/api/files/system/nonexistent.png", {
      headers: {
        "cf-connecting-ip": ipClientA,
        "x-forwarded-for": `10.0.0.${i}`,
      },
    });

    const res = await GET(req, {
      params: Promise.resolve({ path: ["system", "nonexistent.png"] }),
    });

    if (res.status === 429) {
      burstPassed = false;
      console.error(`Request #${i} blocked prematurely with 429`);
      break;
    }
  }
  assert("SEC-VULN-05", "All 60 requests succeed through rate limiter (status != 429)", burstPassed, burstPassed, true);

  // 2.3 Request 61 Threshold Breach
  const req61 = new NextRequest("http://127.0.0.1:3001/api/files/system/nonexistent.png", {
    headers: {
      "cf-connecting-ip": ipClientA,
    },
  });
  const res61 = await GET(req61, {
    params: Promise.resolve({ path: ["system", "nonexistent.png"] }),
  });

  assert("SEC-VULN-05", "Request #61 strictly returns HTTP 429 Too Many Requests", res61.status === 429, res61.status, 429);

  const retryAfterHeader = res61.headers.get("retry-after");
  assert("SEC-VULN-05", "Response contains valid RFC 6585 Retry-After header", !!retryAfterHeader && Number(retryAfterHeader) > 0, retryAfterHeader, ">= 1");

  const body61 = await res61.json().catch(() => ({}));
  assert(
    "SEC-VULN-05",
    "Response body contains structured JSON error and retryAfterSeconds",
    typeof body61.error === "string" && body61.retryAfterSeconds > 0,
    body61,
    "{ error: string, retryAfterSeconds > 0 }"
  );

  // 2.4 Adversarial Header Spoofing Challenge: Rotating X-Forwarded-For under fixed CF-Connecting-IP
  console.log("Simulating adversarial attacker spoofing X-Forwarded-For while blocked...");
  const spoofAttacker1 = new NextRequest("http://127.0.0.1:3001/api/files/system/nonexistent.png", {
    headers: {
      "cf-connecting-ip": ipClientA,
      "x-forwarded-for": "172.16.50.1",
    },
  });
  const spoofRes1 = await GET(spoofAttacker1, {
    params: Promise.resolve({ path: ["system", "nonexistent.png"] }),
  });
  assert("SEC-VULN-05", "Attacker rotating X-Forwarded-For is STILL blocked with HTTP 429", spoofRes1.status === 429, spoofRes1.status, 429);

  const spoofAttacker2 = new NextRequest("http://127.0.0.1:3001/api/files/system/nonexistent.png", {
    headers: {
      "cf-connecting-ip": ipClientA,
      "x-real-ip": "10.99.88.77",
      "x-forwarded-for": "172.16.50.2, 192.168.1.1",
    },
  });
  const spoofRes2 = await GET(spoofAttacker2, {
    params: Promise.resolve({ path: ["system", "nonexistent.png"] }),
  });
  assert("SEC-VULN-05", "Attacker rotating both X-Real-IP and X-Forwarded-For is STILL blocked with HTTP 429", spoofRes2.status === 429, spoofRes2.status, 429);

  // 2.5 Client Isolation (Distinct Client IP B is NOT blocked)
  const reqClientB = new NextRequest("http://127.0.0.1:3001/api/files/system/nonexistent.png", {
    headers: {
      "cf-connecting-ip": ipClientB,
    },
  });
  const resClientB = await GET(reqClientB, {
    params: Promise.resolve({ path: ["system", "nonexistent.png"] }),
  });
  assert("SEC-VULN-05", "Distinct Client IP B is NOT blocked while Client A is blocked (status != 429)", resClientB.status !== 429, resClientB.status, "!= 429 (got 404)");

  // 2.6 Client B also blocked strictly after 60 requests
  for (let i = 2; i <= 60; i++) {
    await GET(
      new NextRequest("http://127.0.0.1:3001/api/files/system/nonexistent.png", {
        headers: { "cf-connecting-ip": ipClientB },
      }),
      { params: Promise.resolve({ path: ["system", "nonexistent.png"] }) }
    );
  }
  const resClientB61 = await GET(
    new NextRequest("http://127.0.0.1:3001/api/files/system/nonexistent.png", {
      headers: { "cf-connecting-ip": ipClientB },
    }),
    { params: Promise.resolve({ path: ["system", "nonexistent.png"] }) }
  );
  assert("SEC-VULN-05", "Client B is also blocked strictly upon 61st request", resClientB61.status === 429, resClientB61.status, 429);

  // ============================================================================
  // FINAL VERDICT
  // ============================================================================
  console.log("\n===============================================================================");
  console.log("TEST SUMMARY & VERDICT");
  console.log("===============================================================================");

  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  console.log(`Total Assertions: ${total}`);
  console.log(`Passed:           ${passed}`);
  console.log(`Failed:           ${failed}`);

  if (failed > 0) {
    console.error("\n❌ FINAL EMPIRICAL VERDICT: DISPROVED (Vulnerabilities or flaws detected)");
    process.exit(1);
  } else {
    console.log("\n✅ FINAL EMPIRICAL VERDICT: CONFIRMED (Patches hold up to adversarial testing)");
    process.exit(0);
  }
}

runChallenger2Suite().catch((err) => {
  console.error("Fatal error during test suite execution:", err);
  process.exit(1);
});
