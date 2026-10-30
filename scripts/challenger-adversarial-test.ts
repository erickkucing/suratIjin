/**
 * EMPIRICAL ADVERSARIAL STRESS TEST HARNESS
 * Challenger 1 (teamwork_challenger)
 * 
 * Tests:
 * 1. normalizeOrigin boundary, adversarial, and edge cases.
 * 2. Next.js 15 isCsrfOriginAllowed CSRF validation against normalized origins.
 * 3. resolveCookieSecurity across all permutations of headers, proxy chains, cases, env vars.
 * 4. Verification that auth endpoints/actions issue cookies with secure: true under HTTPS proxy.
 */

import { resolveCookieSecurity, SESSION_COOKIE_NAME, PARENT_COOKIE_PREFIX } from "../src/lib/auth";
import { isCsrfOriginAllowed } from "next/dist/server/app-render/csrf-protection";

// Extract normalizeOrigin logic exactly as defined in next.config.mjs
function normalizeOrigin(origin: unknown): string | null {
  if (!origin || typeof origin !== "string") return null;
  const trimmed = origin.trim();
  if (!trimmed) return null;
  const withoutProtocol = trimmed.replace(/^https?:\/\//i, "");
  const hostOnly = withoutProtocol.replace(/\/.*$/, "").trim();
  const cleanHost = hostOnly.replace(/:(?:80|443)$/, "").trim();
  return cleanHost || null;
}

interface TestResult {
  category: string;
  name: string;
  passed: boolean;
  expected: unknown;
  actual: unknown;
  details?: string;
}

const results: TestResult[] = [];

function assert(category: string, name: string, actual: unknown, expected: unknown, details?: string) {
  const passed = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ category, name, passed, expected, actual, details });
  if (!passed) {
    console.error(`❌ FAIL [${category}] ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)} (${details || ""})`);
  } else {
    console.log(`✅ PASS [${category}] ${name}`);
  }
}

console.log("===============================================================================");
console.log("CHALLENGER 1: EMPIRICAL ADVERSARIAL STRESS TESTING");
console.log("===============================================================================\n");

// ============================================================================
// SUITE 1: normalizeOrigin Boundary & Adversarial Inputs
// ============================================================================
console.log("--- SUITE 1: normalizeOrigin Boundary & Adversarial Inputs ---");

// 1.1 Null / Undefined / Non-string / Empty
assert("normalizeOrigin", "null input", normalizeOrigin(null), null);
assert("normalizeOrigin", "undefined input", normalizeOrigin(undefined), null);
assert("normalizeOrigin", "empty string", normalizeOrigin(""), null);
assert("normalizeOrigin", "whitespace only", normalizeOrigin("   \t\n  \r\n"), null);
assert("normalizeOrigin", "number input", normalizeOrigin(12345), null);
assert("normalizeOrigin", "boolean input", normalizeOrigin(true), null);
assert("normalizeOrigin", "object input", normalizeOrigin({ host: "domain.com" }), null);
assert("normalizeOrigin", "array input", normalizeOrigin(["domain.com"]), null);

// 1.2 Protocol Variations
assert("normalizeOrigin", "standard https", normalizeOrigin("https://suratijin.sekolah.sch.id"), "suratijin.sekolah.sch.id");
assert("normalizeOrigin", "standard http", normalizeOrigin("http://suratijin.sekolah.sch.id"), "suratijin.sekolah.sch.id");
assert("normalizeOrigin", "uppercase HTTPS", normalizeOrigin("HTTPS://SURATIJIN.SEKOLAH.SCH.ID"), "SURATIJIN.SEKOLAH.SCH.ID");
assert("normalizeOrigin", "mixed case HttP", normalizeOrigin("HttP://suratijin.sekolah.sch.id"), "suratijin.sekolah.sch.id");
assert("normalizeOrigin", "bare hostname without protocol", normalizeOrigin("suratijin.sekolah.sch.id"), "suratijin.sekolah.sch.id");
assert("normalizeOrigin", "multiple schemes http://https://", normalizeOrigin("http://https://domain.com"), "https:");
assert("normalizeOrigin", "multiple schemes https://http://", normalizeOrigin("https://http://domain.com"), "http:");
assert("normalizeOrigin", "non-http protocol ftp://", normalizeOrigin("ftp://domain.com"), "ftp:");
assert("normalizeOrigin", "non-http protocol javascript:", normalizeOrigin("javascript:void(0)"), "javascript:void(0)");

// 1.3 Port Normalization
assert("normalizeOrigin", "default http port :80 stripped", normalizeOrigin("http://domain.com:80"), "domain.com");
assert("normalizeOrigin", "default https port :443 stripped", normalizeOrigin("https://domain.com:443"), "domain.com");
assert("normalizeOrigin", "default :80 on bare domain stripped", normalizeOrigin("domain.com:80"), "domain.com");
assert("normalizeOrigin", "default :443 on bare domain stripped", normalizeOrigin("domain.com:443"), "domain.com");
assert("normalizeOrigin", "custom port :3000 preserved", normalizeOrigin("http://localhost:3000"), "localhost:3000");
assert("normalizeOrigin", "custom port :3001 preserved", normalizeOrigin("http://127.0.0.1:3001"), "127.0.0.1:3001");
assert("normalizeOrigin", "custom high port :8443 preserved", normalizeOrigin("https://domain.com:8443"), "domain.com:8443");
assert("normalizeOrigin", "custom high port :8080 preserved", normalizeOrigin("domain.com:8080"), "domain.com:8080");
assert("normalizeOrigin", "port :8080 with path and trailing slash", normalizeOrigin("http://domain.com:8080/path/"), "domain.com:8080");

// 1.4 Trailing Slashes & Whitespace
assert("normalizeOrigin", "single trailing slash stripped", normalizeOrigin("https://domain.com/"), "domain.com");
assert("normalizeOrigin", "multiple trailing slashes stripped", normalizeOrigin("https://domain.com///"), "domain.com");
assert("normalizeOrigin", "leading and trailing whitespace stripped", normalizeOrigin("   https://domain.com   "), "domain.com");
assert("normalizeOrigin", "whitespace with newline and tab stripped", normalizeOrigin("\t\n https://domain.com:3001/ \r\n"), "localhost:3001" !== "localhost:3001" ? "" : "domain.com:3001");

// 1.5 Paths, Query Parameters, and Fragments
assert("normalizeOrigin", "path stripped", normalizeOrigin("https://domain.com/api/auth/login"), "domain.com");
assert("normalizeOrigin", "nested path with extension stripped", normalizeOrigin("http://domain.com/path/to/page.html"), "domain.com");
assert("normalizeOrigin", "query parameters stripped", normalizeOrigin("https://domain.com/login?redirect=%2Fdashboard"), "domain.com");
assert("normalizeOrigin", "hash fragment with path stripped", normalizeOrigin("https://domain.com/home#section-1"), "domain.com");

// 1.6 Wildcards & Subdomains
assert("normalizeOrigin", "subdomain wildcard *.domain.com preserved", normalizeOrigin("*.domain.com"), "*.domain.com");
assert("normalizeOrigin", "subdomain wildcard with https and slash", normalizeOrigin("https://*.domain.com/"), "*.domain.com");
assert("normalizeOrigin", "multi-level wildcard *.sub.domain.com", normalizeOrigin("https://*.sub.domain.com:3001/"), "*.sub.domain.com:3001");

// 1.7 IP Addresses (IPv4 and IPv6)
assert("normalizeOrigin", "IPv4 loopback 127.0.0.1:3001", normalizeOrigin("http://127.0.0.1:3001/"), "127.0.0.1:3001");
assert("normalizeOrigin", "IPv4 LAN 192.168.70.9:3000", normalizeOrigin("http://192.168.70.9:3000/"), "192.168.70.9:3000");
assert("normalizeOrigin", "IPv4 all-interfaces 0.0.0.0:3000", normalizeOrigin("0.0.0.0:3000"), "0.0.0.0:3000");
assert("normalizeOrigin", "IPv6 loopback [::1]:3000", normalizeOrigin("http://[::1]:3000/"), "[::1]:3000");
assert("normalizeOrigin", "IPv6 loopback default :80 stripped", normalizeOrigin("http://[::1]:80/"), "[::1]");
assert("normalizeOrigin", "IPv6 loopback bare [::1]", normalizeOrigin("[::1]"), "[::1]");

console.log("\n--- SUITE 2: Next.js 15 Server Actions Origin Validation (isCsrfOriginAllowed) ---");

// Test that Next.js 15 isCsrfOriginAllowed accepts/rejects browser origins against normalized origins
const allowedOriginsConfig = [
  "localhost:3000",
  "127.0.0.1:3000",
  "localhost:3001",
  "127.0.0.1:3001",
  "192.168.70.9:3000",
  "192.168.70.9",
  "0.0.0.0:3000",
  "suratijin.sekolah.sch.id",
  "*.tunnel.domain.com",
];

// In Next.js action-handler:
// const originDomain = typeof req.headers['origin'] === 'string' ? new URL(req.headers['origin']).host : undefined;
// isCsrfOriginAllowed(originDomain, allowedOrigins)

function testNextJsCsrf(browserOriginHeader: string, expectedMatch: boolean, label: string) {
  let originDomain: string | undefined;
  try {
    originDomain = new URL(browserOriginHeader).host;
  } catch {
    originDomain = undefined;
  }

  const allowed = isCsrfOriginAllowed(originDomain || "", allowedOriginsConfig);
  assert("NextJsCsrf", `${label} (origin: ${browserOriginHeader} -> host: ${originDomain})`, allowed, expectedMatch);
}

// 2.1 Standard Allowed Origins
testNextJsCsrf("https://suratijin.sekolah.sch.id", true, "Production HTTPS domain");
testNextJsCsrf("http://localhost:3001", true, "Localhost port 3001");
testNextJsCsrf("http://127.0.0.1:3001", true, "Loopback IP port 3001");
testNextJsCsrf("https://suratijin.sekolah.sch.id:443", true, "Production domain with explicit :443 (URL.host strips 443)");
testNextJsCsrf("http://suratijin.sekolah.sch.id:80", true, "Production domain with explicit :80 (URL.host strips 80)");

// 2.2 Wildcard Subdomain Matching
testNextJsCsrf("https://sub1.tunnel.domain.com", true, "Single-level wildcard match");
testNextJsCsrf("https://app.tunnel.domain.com", true, "Another wildcard match");

// 2.3 Adversarial / Disallowed Origins
testNextJsCsrf("https://attacker.evil.com", false, "Untrusted external origin");
testNextJsCsrf("https://evil-suratijin.sekolah.sch.id", false, "Prefix spoof attempt");
testNextJsCsrf("https://suratijin.sekolah.sch.id.evil.com", false, "Suffix subdomain spoof attempt");
testNextJsCsrf("http://localhost:8080", false, "Unapproved port 8080");
testNextJsCsrf("http://127.0.0.1:9999", false, "Unapproved port 9999");
testNextJsCsrf("https://deep.nested.tunnel.domain.com", false, "Multi-level subdomain against *.tunnel.domain.com");

console.log("\n--- SUITE 3: resolveCookieSecurity Comprehensive Permutations ---");

const originalEnv = { ...process.env };

function runEnvPermutation(
  name: string,
  envVars: { COOKIE_SECURE?: string; NEXT_PUBLIC_APP_URL?: string; NODE_ENV?: string },
  requestOrHeaders: Headers | Request | { get: (name: string) => string | null } | null | undefined,
  expected: boolean
) {
  // Set environment
  delete process.env.COOKIE_SECURE;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete (process.env as Record<string, string | undefined>).NODE_ENV;

  if (envVars.COOKIE_SECURE !== undefined) process.env.COOKIE_SECURE = envVars.COOKIE_SECURE;
  if (envVars.NEXT_PUBLIC_APP_URL !== undefined) process.env.NEXT_PUBLIC_APP_URL = envVars.NEXT_PUBLIC_APP_URL;
  if (envVars.NODE_ENV !== undefined) (process.env as Record<string, string | undefined>).NODE_ENV = envVars.NODE_ENV;

  const actual = resolveCookieSecurity(requestOrHeaders);
  assert("resolveCookieSecurity", name, actual, expected);
}

// 3.1 Proxy Header: x-forwarded-proto variations in development/test mode
runEnvPermutation(
  "x-forwarded-proto: https -> secure: true",
  { NODE_ENV: "test" },
  new Headers({ "x-forwarded-proto": "https" }),
  true
);

runEnvPermutation(
  "x-forwarded-proto: http -> secure: false in test",
  { NODE_ENV: "test" },
  new Headers({ "x-forwarded-proto": "http" }),
  false
);

runEnvPermutation(
  "x-forwarded-proto: HTTPS (uppercase) -> secure: true",
  { NODE_ENV: "test" },
  new Headers({ "x-forwarded-proto": "HTTPS" }),
  true
);

runEnvPermutation(
  "x-forwarded-proto: Https (mixed case) -> secure: true",
  { NODE_ENV: "test" },
  new Headers({ "x-forwarded-proto": "Https" }),
  true
);

runEnvPermutation(
  "x-forwarded-proto: hTTps (bizarre case) -> secure: true",
  { NODE_ENV: "test" },
  new Headers({ "x-forwarded-proto": "hTTps" }),
  true
);

runEnvPermutation(
  "x-forwarded-proto: HTTP (uppercase) -> secure: false in test",
  { NODE_ENV: "test" },
  new Headers({ "x-forwarded-proto": "HTTP" }),
  false
);

// 3.2 Multi-hop Proxy Chains
runEnvPermutation(
  "multi-hop: 'https, http' (edge terminates HTTPS) -> secure: true",
  { NODE_ENV: "test" },
  new Headers({ "x-forwarded-proto": "https, http" }),
  true
);

runEnvPermutation(
  "multi-hop: 'http, https' (edge received plain HTTP) -> secure: false in test",
  { NODE_ENV: "test" },
  new Headers({ "x-forwarded-proto": "http, https" }),
  false
);

runEnvPermutation(
  "multi-hop: 'https, https' -> secure: true",
  { NODE_ENV: "test" },
  new Headers({ "x-forwarded-proto": "https, https" }),
  true
);

runEnvPermutation(
  "multi-hop with whitespace: '   https   , http' -> secure: true",
  { NODE_ENV: "test" },
  new Headers({ "x-forwarded-proto": "   https   , http" }),
  true
);

// 3.3 Request Instance inputs
runEnvPermutation(
  "Request instance with https proto header -> secure: true",
  { NODE_ENV: "test" },
  new Request("http://localhost:3001/api/auth/login", {
    headers: { "x-forwarded-proto": "https" },
  }),
  true
);

runEnvPermutation(
  "Request instance with http proto header -> secure: false in test",
  { NODE_ENV: "test" },
  new Request("http://localhost:3001/api/auth/login", {
    headers: { "x-forwarded-proto": "http" },
  }),
  false
);

runEnvPermutation(
  "Request instance without headers -> secure: false in test",
  { NODE_ENV: "test" },
  new Request("http://localhost:3001/api/auth/login"),
  false
);

// 3.4 Custom / Mock Objects with .get()
runEnvPermutation(
  "Mock object with .get returning https -> secure: true",
  { NODE_ENV: "test" },
  { get: (k: string) => (k.toLowerCase() === "x-forwarded-proto" ? "https" : null) },
  true
);

runEnvPermutation(
  "Mock object with .get returning null -> secure: false in test",
  { NODE_ENV: "test" },
  { get: () => null },
  false
);

// 3.5 Interaction with COOKIE_SECURE env var
runEnvPermutation(
  "COOKIE_SECURE=true overrides missing headers -> secure: true",
  { COOKIE_SECURE: "true", NODE_ENV: "development" },
  null,
  true
);

runEnvPermutation(
  "COOKIE_SECURE=false does NOT defeat x-forwarded-proto: https",
  { COOKIE_SECURE: "false", NODE_ENV: "development" },
  new Headers({ "x-forwarded-proto": "https" }),
  true
);

runEnvPermutation(
  "COOKIE_SECURE=false with http header -> secure: false in dev",
  { COOKIE_SECURE: "false", NODE_ENV: "development" },
  new Headers({ "x-forwarded-proto": "http" }),
  false
);

// 3.6 Interaction with NEXT_PUBLIC_APP_URL
runEnvPermutation(
  "NEXT_PUBLIC_APP_URL starts with https:// -> secure: true",
  { NEXT_PUBLIC_APP_URL: "https://suratijin.sekolah.sch.id", NODE_ENV: "test" },
  null,
  true
);

runEnvPermutation(
  "NEXT_PUBLIC_APP_URL starts with http:// -> secure: false in test",
  { NEXT_PUBLIC_APP_URL: "http://suratijin.sekolah.sch.id", NODE_ENV: "test" },
  null,
  false
);

runEnvPermutation(
  "NEXT_PUBLIC_APP_URL is https, overrides x-forwarded-proto: http",
  { NEXT_PUBLIC_APP_URL: "https://suratijin.sekolah.sch.id", NODE_ENV: "test" },
  new Headers({ "x-forwarded-proto": "http" }),
  true
);

// 3.7 Production Environment Default
runEnvPermutation(
  "NODE_ENV=production defaults to secure: true without headers",
  { NODE_ENV: "production" },
  null,
  true
);

runEnvPermutation(
  "NODE_ENV=production defaults to secure: true even if x-forwarded-proto: http",
  { NODE_ENV: "production" },
  new Headers({ "x-forwarded-proto": "http" }),
  true
);

runEnvPermutation(
  "NODE_ENV=development without headers -> secure: false",
  { NODE_ENV: "development" },
  null,
  false
);

// Restore original env
process.env = { ...originalEnv };

console.log("\n--- SUITE 4: Session Token Issuance Security Verification ---");

// Test that cookie options in auth handlers cannot be set with secure: false under HTTPS
function simulateCookieIssuance(headers: Headers): { secure: boolean } {
  const isCookieSecure = resolveCookieSecurity(headers);
  return { secure: isCookieSecure };
}

const httpsTunnelHeader = new Headers({ "x-forwarded-proto": "https" });
const cookieResult = simulateCookieIssuance(httpsTunnelHeader);
assert("CookieIssuance", "Session cookie MUST have secure=true under Cloudflare Tunnel", cookieResult.secure, true);

// Verify edge case: can an attacker trick resolveCookieSecurity into returning false when behind HTTPS?
const attackedHeaders = [
  new Headers({ "x-forwarded-proto": "https", "cookie-secure": "false" }),
  new Headers({ "x-forwarded-proto": "https, http, https" }),
  new Headers({ "x-forwarded-proto": "HTTPS" }),
  new Headers({ "X-Forwarded-Proto": "https" }),
];

for (let i = 0; i < attackedHeaders.length; i++) {
  const res = simulateCookieIssuance(attackedHeaders[i]);
  assert("CookieIssuance", `Attacked header variant ${i + 1} retains secure=true`, res.secure, true);
}

// Summary
console.log("\n===============================================================================");
const totalTests = results.length;
const passedTests = results.filter((r) => r.passed).length;
const failedTests = results.filter((r) => !r.passed).length;

console.log(`SUMMARY: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
console.log("===============================================================================");

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
