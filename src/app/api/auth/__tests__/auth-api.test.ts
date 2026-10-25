import { describe, it, expect, beforeEach } from "vitest";
import { POST as loginPost } from "../login/route";
import { POST as unlockPost } from "../unlock/route";
import { _clearRateLimitStoreForTesting } from "@/lib/rate-limiter";

describe("API Auth Endpoints", () => {
  beforeEach(() => {
    _clearRateLimitStoreForTesting();
  });
  it("should fail login with invalid credentials", async () => {
    const req = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "wrong_user", password: "wrong_password" }),
    });

    const res = await loginPost(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("salah");
  });

  it("should reject empty login input with 400", async () => {
    const req = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "", password: "" }),
    });

    const res = await loginPost(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("should successfully log in valid wali_kelas and set session cookie", async () => {
    const req = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "erick", password: "feelgood6969" }),
    });

    const res = await loginPost(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.redirectUrl).toBe("/dashboard");
    expect(body.role).toBe("wali_kelas");

    const cookie = res.headers.get("set-cookie");
    expect(cookie).toContain("surat_session=");
  });

  it("should successfully log in valid superadmin", async () => {
    const req = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "wildwina", password: "namamu123" }),
    });

    const res = await loginPost(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.redirectUrl).toBe("/admin");
    expect(body.role).toBe("superadmin");
  });

  it("should handle parent unlock validation", async () => {
    const req = new Request("http://localhost:3000/api/auth/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classSlug: "nonexistent-class", password: "test" }),
    });

    const res = await unlockPost(req);
    expect([404, 401]).toContain(res.status);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("should block login after 5 failed attempts with HTTP 429 and Retry-After", async () => {
    const headers = {
      "Content-Type": "application/json",
      "x-forwarded-for": "198.51.100.99",
    };

    // First 4 failed attempts -> 401
    for (let i = 1; i <= 4; i++) {
      const req = new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers,
        body: JSON.stringify({ username: "erick", password: "wrong_password" }),
      });
      const res = await loginPost(req);
      expect(res.status).toBe(401);
    }

    // 5th failed attempt -> 429 Too Many Requests
    const req5 = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers,
      body: JSON.stringify({ username: "erick", password: "wrong_password" }),
    });
    const res5 = await loginPost(req5);
    expect(res5.status).toBe(429);
    expect(res5.headers.get("retry-after")).toBeDefined();
    const body5 = await res5.json();
    expect(body5.success).toBe(false);
    expect(body5.error).toContain("Terlalu banyak percobaan gagal");

    // 6th attempt -> immediately 429 without querying user
    const req6 = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers,
      body: JSON.stringify({ username: "erick", password: "even_correct_is_blocked" }),
    });
    const res6 = await loginPost(req6);
    expect(res6.status).toBe(429);
  });

  it("should block parent unlock after 5 failed attempts with HTTP 429", async () => {
    const headers = {
      "Content-Type": "application/json",
      "x-forwarded-for": "198.51.100.88",
    };

    for (let i = 1; i <= 4; i++) {
      const req = new Request("http://localhost:3000/api/auth/unlock", {
        method: "POST",
        headers,
        body: JSON.stringify({ classSlug: "xii-tkj-2", password: "wrong_pass" }),
      });
      const res = await unlockPost(req);
      expect(res.status).toBe(401);
    }

    // 5th attempt
    const req5 = new Request("http://localhost:3000/api/auth/unlock", {
      method: "POST",
      headers,
      body: JSON.stringify({ classSlug: "xii-tkj-2", password: "wrong_pass" }),
    });
    const res5 = await unlockPost(req5);
    expect(res5.status).toBe(429);
    const body5 = await res5.json();
    expect(body5.error).toContain("Terlalu banyak percobaan gagal");
  });
});
