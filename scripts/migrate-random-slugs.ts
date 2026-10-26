import mysql from "mysql2/promise";
import { generateRandomClassCode } from "../src/lib/string-utils";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile();
  } catch {}
}

async function run() {
  const dbUrl = process.env.DATABASE_URL || "mysql://root:@localhost:3306/db_suratizin";
  const connection = await mysql.createConnection(dbUrl);

  try {
    console.log("Checking classes table for legacy slugs...");
    const [rows] = await connection.query<any[]>("SELECT id, name, slug FROM classes");

    for (const cls of rows) {
      // Check if slug is already a 3-character letter code
      const is3CharLetter = /^[a-zA-Z]{3}$/.test(cls.slug);
      if (!is3CharLetter) {
        let newSlug = "";
        let isUnique = false;

        while (!isUnique) {
          newSlug = generateRandomClassCode(3);
          const [existing] = await connection.query<any[]>(
            "SELECT id FROM classes WHERE slug = ? AND id != ?",
            [newSlug, cls.id]
          );
          if (existing.length === 0) {
            isUnique = true;
          }
        }

        console.log(`Migrating class [${cls.id}] "${cls.name}": "${cls.slug}" -> "${newSlug}"`);
        await connection.query("UPDATE classes SET slug = ? WHERE id = ?", [newSlug, cls.id]);
      } else {
        console.log(`Class [${cls.id}] "${cls.name}" already has 3-letter slug: "${cls.slug}"`);
      }
    }

    console.log("Migration complete!");
  } finally {
    await connection.end();
  }
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
