import { describe, it, expect } from "vitest";
import {
  parseRedisConnection,
  buildRedisUrl,
  formatMaskedRedisUrl,
} from "../redis-utils";

describe("Redis Connection Utilities", () => {
  describe("parseRedisConnection", () => {
    it("should parse standard default redis://127.0.0.1:6379", () => {
      const res = parseRedisConnection("redis://127.0.0.1:6379");
      expect(res).toEqual({
        host: "127.0.0.1",
        port: "6379",
        password: "",
      });
    });

    it("should parse URI with password redis://:mysecret@192.168.47.20:6379", () => {
      const res = parseRedisConnection("redis://:mysecret@192.168.47.20:6379");
      expect(res).toEqual({
        host: "192.168.47.20",
        port: "6379",
        password: "mysecret",
      });
    });

    it("should parse URI with default user and password", () => {
      const res = parseRedisConnection("redis://default:mysecret@10.0.0.5:6380");
      expect(res).toEqual({
        host: "10.0.0.5",
        port: "6380",
        password: "mysecret",
      });
    });

    it("should handle null or empty string gracefully", () => {
      expect(parseRedisConnection("")).toEqual({
        host: "127.0.0.1",
        port: "6379",
        password: "",
      });
      expect(parseRedisConnection(null)).toEqual({
        host: "127.0.0.1",
        port: "6379",
        password: "",
      });
    });
  });

  describe("buildRedisUrl", () => {
    it("should assemble clean URL without password", () => {
      const url = buildRedisUrl("192.168.1.50", "6379");
      expect(url).toBe("redis://192.168.1.50:6379");
    });

    it("should assemble URL with encoded password", () => {
      const url = buildRedisUrl("192.168.1.50", "6379", "p@ssword!#");
      expect(url).toBe("redis://:p%40ssword!%23@192.168.1.50:6379");
    });

    it("should fallback to 127.0.0.1:6379 if empty", () => {
      const url = buildRedisUrl("", "");
      expect(url).toBe("redis://127.0.0.1:6379");
    });
  });

  describe("formatMaskedRedisUrl", () => {
    it("should show plain URL when password is empty", () => {
      const masked = formatMaskedRedisUrl("127.0.0.1", "6379", "");
      expect(masked).toBe("redis://127.0.0.1:6379");
    });

    it("should mask password when present", () => {
      const masked = formatMaskedRedisUrl("192.168.47.20", "6379", "mysecret");
      expect(masked).toBe("redis://:••••••••@192.168.47.20:6379");
    });
  });
});
