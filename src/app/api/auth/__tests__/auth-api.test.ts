import { describe, it, expect } from "vitest";
import { POST as loginPost } from "../login/route";
import { POST as unlockPost } from "../unlock/route";

describe("API Auth Endpoints", () => {
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
      body: JSON.stringify({ username: "erick", password: "namamu123" }),
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
});
