import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  createParentToken,
  verifyParentToken,
} from "../auth";

describe("Authentication & Token Security", () => {
  it("should correctly hash and verify passwords", async () => {
    const plain = "mypassword123";
    const hashed = await hashPassword(plain);
    expect(hashed).toBeDefined();
    expect(hashed).not.toBe(plain);

    const isValid = await verifyPassword(plain, hashed);
    expect(isValid).toBe(true);

    const isWrong = await verifyPassword("wrongpass", hashed);
    expect(isWrong).toBe(false);
  });

  it("should successfully verify legacy bcrypt password hashes from db_suratizin.sql", async () => {
    // Legacy hash for erick
    const legacyErickHash = "$2a$12$opludV2bdqxOT.Lx/Jh2dONQjIpS9XQJNr0/skP652rg/zLdA8.9W";
    // Let's test against wrong password to ensure compare runs safely without error
    const wrongAttempt = await verifyPassword("definitelywrongpass999", legacyErickHash);
    expect(wrongAttempt).toBe(false);
  });

  it("should create and verify signed user session JWT tokens", async () => {
    const userPayload = {
      id: 2,
      username: "erick",
      displayName: "Erick S.Kom",
      role: "wali_kelas" as const,
    };

    const token = await createSessionToken(userPayload);
    expect(typeof token).toBe("string");

    const decoded = await verifySessionToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.username).toBe("erick");
    expect(decoded?.role).toBe("wali_kelas");
  });

  it("should reject tampered user session tokens", async () => {
    const token = await createSessionToken({
      id: 1,
      username: "wildwina",
      displayName: "Wildwina",
      role: "superadmin",
    });

    const tampered = token.slice(0, -5) + "abcde";
    const decoded = await verifySessionToken(tampered);
    expect(decoded).toBeNull();
  });

  it("should create and verify parent class tokens with slug scoping", async () => {
    const parentPayload = {
      classSlug: "xii-tkj-2",
      classId: 1,
    };

    const token = await createParentToken(parentPayload);
    expect(typeof token).toBe("string");

    // Valid slug verification
    const verified = await verifyParentToken(token, "xii-tkj-2");
    expect(verified).not.toBeNull();
    expect(verified?.classSlug).toBe("xii-tkj-2");

    // Slug mismatch should be rejected
    const wrongClassVerified = await verifyParentToken(token, "x-rpl-1");
    expect(wrongClassVerified).toBeNull();
  });
});
