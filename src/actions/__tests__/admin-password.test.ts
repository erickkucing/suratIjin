import { describe, it, expect, vi, beforeAll } from "vitest";
import { updateAdminSelfPasswordAction } from "../admin";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import * as authModule from "@/lib/auth";

const mockDeleteCookie = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockImplementation(async () => ({
    set: vi.fn(),
    get: vi.fn(),
    delete: mockDeleteCookie,
  })),
}));

describe("updateAdminSelfPasswordAction", () => {
  let adminUserId: number;
  let nonAdminUserId: number;

  beforeAll(async () => {
    const passwordHash = await authModule.hashPassword("oldAdminPassword123");
    const [res] = await db.insert(users).values({
      username: `admin_pwd_test_${Date.now()}`,
      displayName: "Admin Password Tester",
      passwordHash,
      role: "superadmin",
      isActive: true,
    });
    adminUserId = res.insertId;

    const [res2] = await db.insert(users).values({
      username: `teacher_pwd_test_${Date.now()}`,
      displayName: "Teacher Tester",
      passwordHash,
      role: "wali_kelas",
      isActive: true,
    });
    nonAdminUserId = res2.insertId;
  });

  it("should successfully update admin password, hash it, and delete session cookie for auto-logout", async () => {
    vi.spyOn(authModule, "getCurrentUser").mockResolvedValue({
      id: adminUserId,
      username: "admin_tester",
      displayName: "Admin Password Tester",
      role: "superadmin",
    });

    const newPass = "newStrongAdminPass456";
    const res = await updateAdminSelfPasswordAction({
      newPassword: newPass,
      confirmPassword: newPass,
    });

    expect(res.success).toBe(true);
    expect(res.redirectUrl).toBe("/login");
    expect(mockDeleteCookie).toHaveBeenCalledWith(authModule.SESSION_COOKIE_NAME);

    // Verify hash changed and is valid against new password
    const userInDb = await db.query.users.findFirst({
      where: eq(users.id, adminUserId),
    });
    expect(userInDb).toBeDefined();
    const isNewValid = await authModule.verifyPassword(newPass, userInDb!.passwordHash);
    expect(isNewValid).toBe(true);
  });

  it("should reject if user is not authenticated", async () => {
    vi.spyOn(authModule, "getCurrentUser").mockResolvedValue(null);

    const res = await updateAdminSelfPasswordAction({
      newPassword: "secretPassword999",
      confirmPassword: "secretPassword999",
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Hanya Superadmin/);
  });

  it("should reject if user role is not superadmin", async () => {
    vi.spyOn(authModule, "getCurrentUser").mockResolvedValue({
      id: nonAdminUserId,
      username: "teacher_tester",
      displayName: "Teacher Tester",
      role: "wali_kelas",
    });

    const res = await updateAdminSelfPasswordAction({
      newPassword: "secretPassword999",
      confirmPassword: "secretPassword999",
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Hanya Superadmin/);
  });

  it("should reject if password is shorter than 6 characters", async () => {
    vi.spyOn(authModule, "getCurrentUser").mockResolvedValue({
      id: adminUserId,
      username: "admin_tester",
      displayName: "Admin Password Tester",
      role: "superadmin",
    });

    const res = await updateAdminSelfPasswordAction({
      newPassword: "123",
      confirmPassword: "123",
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/minimal 6 karakter/);
  });

  it("should reject if confirmPassword does not match newPassword", async () => {
    vi.spyOn(authModule, "getCurrentUser").mockResolvedValue({
      id: adminUserId,
      username: "admin_tester",
      displayName: "Admin Password Tester",
      role: "superadmin",
    });

    const res = await updateAdminSelfPasswordAction({
      newPassword: "validPassword123",
      confirmPassword: "mismatchedPassword456",
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/tidak cocok/);
  });
});
