import { db } from "../src/db";
import { users } from "../src/db/schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function main() {
  console.log("Memeriksa akun superadmin pada database...");
  try {
    const existingSuperadmin = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
      })
      .from(users)
      .where(and(eq(users.role, "superadmin"), eq(users.isActive, true)))
      .limit(1);

    if (existingSuperadmin.length > 0) {
      console.log(`Akun superadmin aktif ditemukan: '${existingSuperadmin[0].username}' (${existingSuperadmin[0].displayName}).`);
      process.exit(0);
    }

    console.log("Tidak ditemukan akun superadmin aktif. Membuat akun superadmin awal...");
    const defaultUsername = process.env.INITIAL_ADMIN_USERNAME || "admin";
    const defaultPassword = process.env.INITIAL_ADMIN_PASSWORD || "AdminSurat#2026";
    const displayName = "Administrator";
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    await db.insert(users).values({
      username: defaultUsername,
      displayName,
      passwordHash,
      role: "superadmin",
      isActive: true,
    });

    console.log("=================================================================");
    console.log("AKUN SUPERADMIN AWAL BERHASIL DIBUAT!");
    console.log(`Username: ${defaultUsername}`);
    console.log(`Password: ${defaultPassword}`);
    console.log("Harap segera ganti password ini setelah login pertama kali.");
    console.log("=================================================================");
    process.exit(0);
  } catch (error) {
    console.error("Gagal memeriksa atau membuat akun superadmin:", error);
    process.exit(1);
  }
}

main();
