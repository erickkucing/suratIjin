import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function applyIndexes() {
  console.log("Applying unique index on students(class_id, nis)...");
  try {
    await db.execute(sql.raw(`
      CREATE UNIQUE INDEX \`idx_students_class_nis_unique\`
      ON \`students\` (\`class_id\`, \`nis\`);
    `));
    console.log("Created idx_students_class_nis_unique");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Duplicate key name")) {
      console.log("idx_students_class_nis_unique already exists");
    } else {
      throw err;
    }
  }

  console.log("Applying unique index on attendance_records(class_id, student_id, attendance_date)...");
  try {
    await db.execute(sql.raw(`
      CREATE UNIQUE INDEX \`idx_attendance_class_student_date_unique\`
      ON \`attendance_records\` (\`class_id\`, \`student_id\`, \`attendance_date\`);
    `));
    console.log("Created idx_attendance_class_student_date_unique");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Duplicate key name")) {
      console.log("idx_attendance_class_student_date_unique already exists");
    } else {
      throw err;
    }
  }
}

applyIndexes()
  .then(() => {
    console.log("Indexes applied successfully!");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
