import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../status/route";
import * as authModule from "@/lib/auth";
import * as aiRouterModule from "@/lib/ai-router";

describe("GET /api/ai/status", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should return 401 when unauthenticated", async () => {
    vi.spyOn(authModule, "getCurrentUser").mockResolvedValue(null);
    const req = new Request("http://localhost:3000/api/ai/status");
    const res = await GET(req as any);
    expect(res.status).toBe(401);
  });

  it("should return enabled=false and isConnected=false when AI is disabled", async () => {
    vi.spyOn(authModule, "getCurrentUser").mockResolvedValue({
      id: 1,
      username: "admin",
      displayName: "Administrator",
      role: "superadmin",
    } as any);

    vi.spyOn(aiRouterModule, "getAiRouterConfig").mockResolvedValue({
      enabled: false,
      baseUrl: "http://127.0.0.1:20128/v1",
      apiKey: null,
      model: "gemini/gemini-3.8-flash",
    });

    const req = new Request("http://localhost:3000/api/ai/status");
    const res = await GET(req as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.enabled).toBe(false);
    expect(json.isConnected).toBe(false);
  });

  it("should return connection test result when AI is enabled", async () => {
    vi.spyOn(authModule, "getCurrentUser").mockResolvedValue({
      id: 1,
      username: "admin",
      displayName: "Administrator",
      role: "superadmin",
    } as any);

    vi.spyOn(aiRouterModule, "getAiRouterConfig").mockResolvedValue({
      enabled: true,
      baseUrl: "http://127.0.0.1:20128/v1",
      apiKey: "test-key",
      model: "gemini/gemini-3.8-flash",
    });

    vi.spyOn(aiRouterModule, "testAiRouterConnection").mockResolvedValue({
      isConnected: true,
      latencyMs: 35,
      models: ["gemini/gemini-3.8-flash", "gemini/gemini-3.7-flash"],
    });

    const req = new Request("http://localhost:3000/api/ai/status");
    const res = await GET(req as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.enabled).toBe(true);
    expect(json.isConnected).toBe(true);
    expect(json.latencyMs).toBe(35);
    expect(json.models).toContain("gemini/gemini-3.8-flash");
  });
});
