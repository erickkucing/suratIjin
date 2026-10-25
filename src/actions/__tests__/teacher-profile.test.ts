import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/db";
import { users, classes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword, createSessionToken, verifySessionToken } from "@/lib/auth";

describe("Wali Kelas Self Profile & Account Settings", () => {
  let testUserId: number;
  let testClassId: number;
  const originalDisplayName = "Erick S.Kom Test";
  const originalPassword = "initialPassword123";

  beforeAll(async () => {
    // 1. Create a dedicated test user for profile updates
    const initialHash = await hashPassword(originalPassword);
    const [userRes] = await db.insert(users).values({
      username: `test_wali_${Date.now()}`,
      displayName: originalDisplayName,
      passwordHash: initialHash,
      role: "wali_kelas",
      isActive: true,
    });
    testUserId = userRes.insertId;

    // 2. Assign to a test class
    const [classRes] = await db.insert(classes).values({
      name: "Kelas Uji Coba Profil",
      slug: `uji-profil-${Date.now()}`,
      teacherId: testUserId,
      isActive: true,
    });
    testClassId = classRes.insertId;
  });

  afterAll(async () => {
    // Cleanup test data
    if (testClassId) {
      await db.delete(classes).where(eq(classes.id, testClassId));
    }
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  it("should update display name in database and preserve username & role", async () => {
    const newName = "Drs. Erick Pratama, M.Kom";

    await db
      .update(users)
      .set({ displayName: newName })
      .where(eq(users.id, testUserId));

    const updatedUser = await db.query.users.findFirst({
      where: eq(users.id, testUserId),
    });

    expect(updatedUser).toBeDefined();
    expect(updatedUser?.displayName).toBe(newName);
    expect(updatedUser?.role).toBe("wali_kelas");
  });

  it("should update password and verify successfully against bcrypt hash", async () => {
    const newPassword = "updatedPassword456";
    const newHash = await hashPassword(newPassword);

    await db
      .update(users)
      .set({ passwordHash: newHash })
      .where(eq(users.id, testUserId));

    const userInDb = await db.query.users.findFirst({
      where: eq(users.id, testUserId),
    });

    expect(userInDb).toBeDefined();
    const isOldValid = await verifyPassword(originalPassword, userInDb!.passwordHash);
    expect(isOldValid).toBe(false);

    const isNewValid = await verifyPassword(newPassword, userInDb!.passwordHash);
    expect(isNewValid).toBe(true);
  });

  it("should issue valid JWT session token containing updated display name", async () => {
    const updatedUser = await db.query.users.findFirst({
      where: eq(users.id, testUserId),
    });

    const token = await createSessionToken({
      id: updatedUser!.id,
      username: updatedUser!.username,
      displayName: updatedUser!.displayName,
      role: updatedUser!.role,
    });

    const verified = await verifySessionToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.displayName).toBe("Drs. Erick Pratama, M.Kom");
    expect(verified?.id).toBe(testUserId);
  });

  it("should verify class name modification independently without affecting portal slug", async () => {
    const testClass = await db.query.classes.findFirst({
      where: eq(classes.id, testClassId),
    });
    expect(testClass).toBeDefined();
    const initialSlug = testClass!.slug;

    // Wali kelas changes class name
    const newClassName = "XII Rekayasa Perangkat Lunak 1";
    await db
      .update(classes)
      .set({ name: newClassName })
      .where(eq(classes.id, testClassId));

    const reloaded = await db.query.classes.findFirst({
      where: eq(classes.id, testClassId),
    });

    expect(reloaded?.name).toBe(newClassName);
    expect(reloaded?.slug).toBe(initialSlug); // Stable URL
  });
});
