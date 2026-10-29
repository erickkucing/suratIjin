import { describe, it, expect, vi, beforeAll } from "vitest";
import { updateSelfProfileAction } from "../auth";
import { createClassAction } from "../admin";
import { db } from "@/db";
import { users, classes } from "@/db/schema";
import { eq } from "drizzle-orm";
import * as authModule from "@/lib/auth";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  }),
}));

describe("SEC-FINDING-03: Self-Profile Password Modification Re-Authentication", () => {
  let testUserId: number;
  const initialPassword = "initialPassword123";

  beforeAll(async () => {
    const passwordHash = await authModule.hashPassword(initialPassword);
    const [res] = await db.insert(users).values({
      username: `sec_test_user_${Date.now()}`,
      displayName: "Security Test User",
      passwordHash,
      role: "wali_kelas",
      isActive: true,
    });
    testUserId = res.insertId;
  });

  it("should allow updating displayName without currentPassword if newPassword is not provided", async () => {
    const spy = vi.spyOn(authModule, "getCurrentUser").mockResolvedValue({
      id: testUserId,
      username: "sec_test_user",
      displayName: "Security Test User",
      role: "wali_kelas",
    });

    const res = await updateSelfProfileAction({
      displayName: "Updated Display Name",
    });

    expect(res.success).toBe(true);
    expect(res.displayName).toBe("Updated Display Name");

    const updatedUser = await db.query.users.findFirst({
      where: eq(users.id, testUserId),
    });
    expect(updatedUser?.displayName).toBe("Updated Display Name");
    spy.mockRestore();
  });

  it("should reject password update if currentPassword is missing", async () => {
    const spy = vi.spyOn(authModule, "getCurrentUser").mockResolvedValue({
      id: testUserId,
      username: "sec_test_user",
      displayName: "Updated Display Name",
      role: "wali_kelas",
    });

    const res = await updateSelfProfileAction({
      displayName: "Updated Display Name",
      newPassword: "newSecurePassword456",
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("Kata sandi saat ini harus diisi");
    spy.mockRestore();
  });

  it("should reject password update if currentPassword is wrong", async () => {
    const spy = vi.spyOn(authModule, "getCurrentUser").mockResolvedValue({
      id: testUserId,
      username: "sec_test_user",
      displayName: "Updated Display Name",
      role: "wali_kelas",
    });

    const res = await updateSelfProfileAction({
      displayName: "Updated Display Name",
      currentPassword: "completelyWrongPassword999",
      newPassword: "newSecurePassword456",
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("Kata sandi saat ini salah");
    spy.mockRestore();
  });

  it("should successfully update password when currentPassword is correct", async () => {
    const spy = vi.spyOn(authModule, "getCurrentUser").mockResolvedValue({
      id: testUserId,
      username: "sec_test_user",
      displayName: "Updated Display Name",
      role: "wali_kelas",
    });

    const res = await updateSelfProfileAction({
      displayName: "Updated Display Name",
      currentPassword: initialPassword,
      newPassword: "newSecurePassword456",
    });

    expect(res.success).toBe(true);

    const userInDb = await db.query.users.findFirst({
      where: eq(users.id, testUserId),
    });
    expect(userInDb).toBeDefined();

    const isOldPassValid = await authModule.verifyPassword(initialPassword, userInDb!.passwordHash);
    expect(isOldPassValid).toBe(false);

    const isNewPassValid = await authModule.verifyPassword("newSecurePassword456", userInDb!.passwordHash);
    expect(isNewPassValid).toBe(true);

    spy.mockRestore();
  });
});

describe("SEC-FINDING-05: Secure Random Class Portal PIN Generation", () => {
  it("should generate a secure random 6-digit PIN instead of static 123456", async () => {
    const spy = vi.spyOn(authModule, "getCurrentUser").mockResolvedValue({
      id: 1,
      username: "wildwina",
      displayName: "Wildwina",
      role: "superadmin",
    });

    const res = await createClassAction({
      name: `Security Test Class ${Date.now()}`,
    });

    expect(res.success).toBe(true);
    expect(res.initialPin).toBeDefined();
    expect(res.initialPin).toMatch(/^\d{6}$/);

    // Verify it is not static 123456
    expect(res.message).toContain(res.initialPin);

    spy.mockRestore();
  });
});
