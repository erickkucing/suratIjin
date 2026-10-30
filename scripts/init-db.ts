import { db } from "../src/db";
import { sql } from "drizzle-orm";
import { users } from "../src/db/schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";

const TABLE_DEFINITIONS: { name: string; ddl: string }[] = [
  {
    name: "users",
    ddl: `
      CREATE TABLE IF NOT EXISTS \`users\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`username\` varchar(50) NOT NULL,
        \`display_name\` varchar(100) NOT NULL,
        \`password_hash\` varchar(255) NOT NULL,
        \`role\` enum('superadmin','wali_kelas') NOT NULL DEFAULT 'wali_kelas',
        \`is_active\` boolean NOT NULL DEFAULT true,
        \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT \`users_id\` PRIMARY KEY(\`id\`),
        CONSTRAINT \`idx_users_username_unique\` UNIQUE(\`username\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
  },
  {
    name: "classes",
    ddl: `
      CREATE TABLE IF NOT EXISTS \`classes\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`slug\` varchar(50) NOT NULL,
        \`name\` varchar(100) NOT NULL,
        \`academic_year\` varchar(20) NOT NULL DEFAULT '2026/2027',
        \`period_title\` varchar(100) NOT NULL DEFAULT 'Semester Genap',
        \`wali_kelas_id\` int,
        \`parent_password_hash\` varchar(255),
        \`parent_show_letter_file\` boolean NOT NULL DEFAULT false,
        \`is_active\` boolean NOT NULL DEFAULT true,
        \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT \`classes_id\` PRIMARY KEY(\`id\`),
        CONSTRAINT \`idx_classes_slug_unique\` UNIQUE(\`slug\`),
        KEY \`idx_classes_wali_kelas_id\` (\`wali_kelas_id\`),
        CONSTRAINT \`classes_wali_kelas_id_users_id_fk\` FOREIGN KEY (\`wali_kelas_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
  },
  {
    name: "students",
    ddl: `
      CREATE TABLE IF NOT EXISTS \`students\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`class_id\` int NOT NULL,
        \`nis\` varchar(30),
        \`name\` varchar(100) NOT NULL,
        \`is_active\` boolean NOT NULL DEFAULT true,
        \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT \`students_id\` PRIMARY KEY(\`id\`),
        KEY \`idx_students_class_active_name\` (\`class_id\`,\`is_active\`,\`name\`),
        CONSTRAINT \`students_class_id_classes_id_fk\` FOREIGN KEY (\`class_id\`) REFERENCES \`classes\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
  },
  {
    name: "attendance_records",
    ddl: `
      CREATE TABLE IF NOT EXISTS \`attendance_records\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`class_id\` int NOT NULL,
        \`student_id\` int NOT NULL,
        \`attendance_date\` date NOT NULL,
        \`status\` enum('Izin','Sakit','Alpa') NOT NULL,
        \`info_source\` varchar(100) NOT NULL DEFAULT 'Orang tua',
        \`description\` varchar(255) NOT NULL DEFAULT '',
        \`letter_file_path\` varchar(255),
        \`letter_mime_type\` varchar(50),
        \`letter_status\` enum('Sudah','Belum') NOT NULL DEFAULT 'Belum',
        \`created_by_id\` int,
        \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`attendance_records_id\` PRIMARY KEY(\`id\`),
        KEY \`idx_attendance_class_date_status\` (\`class_id\`,\`attendance_date\`,\`status\`,\`letter_status\`),
        KEY \`idx_attendance_class_student_date\` (\`class_id\`,\`student_id\`,\`attendance_date\`),
        CONSTRAINT \`attendance_records_class_id_classes_id_fk\` FOREIGN KEY (\`class_id\`) REFERENCES \`classes\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`attendance_records_student_id_students_id_fk\` FOREIGN KEY (\`student_id\`) REFERENCES \`students\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`attendance_records_created_by_id_users_id_fk\` FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
  },
  {
    name: "system_settings",
    ddl: `
      CREATE TABLE IF NOT EXISTS \`system_settings\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`app_name\` varchar(150) NOT NULL DEFAULT 'Sistem Surat Izin Siswa',
        \`logo_url\` varchar(255),
        \`theme_color\` varchar(50) NOT NULL DEFAULT 'terracotta',
        \`bg_theme\` varchar(50) NOT NULL DEFAULT 'warm-zinc',
        \`footer_text\` varchar(255) DEFAULT 'Sistem Surat Izin & Ketidakhadiran Siswa.',
        \`ai_enabled\` tinyint(1) NOT NULL DEFAULT 0,
        \`ai_router_url\` varchar(255) NOT NULL DEFAULT 'http://127.0.0.1:20128/v1',
        \`ai_router_api_key\` varchar(255),
        \`ai_router_model\` varchar(100) NOT NULL DEFAULT 'gemini/gemini-3.8-flash',
        \`redis_enabled\` tinyint(1) NOT NULL DEFAULT 0,
        \`redis_url\` varchar(255),
        \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        \`updated_by_id\` int,
        CONSTRAINT \`system_settings_id\` PRIMARY KEY(\`id\`),
        CONSTRAINT \`system_settings_updated_by_id_users_id_fk\` FOREIGN KEY (\`updated_by_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
  },
];

async function initDatabase() {
  console.log("==> Menginisialisasi skema database (CREATE TABLE IF NOT EXISTS)...");
  await db.execute(sql.raw("SET FOREIGN_KEY_CHECKS = 0;"));

  for (const def of TABLE_DEFINITIONS) {
    await db.execute(sql.raw(def.ddl));
    console.log(`✓ Tabel '${def.name}' siap.`);
  }

  await db.execute(sql.raw("SET FOREIGN_KEY_CHECKS = 1;"));

  console.log("==> Menerapkan indeks unik...");
  try {
    await db.execute(sql.raw(`
      CREATE UNIQUE INDEX \`idx_students_class_nis_unique\`
      ON \`students\` (\`class_id\`, \`nis\`);
    `));
    console.log("✓ Indeks idx_students_class_nis_unique dibuat.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Duplicate key name")) {
      console.log("✓ Indeks idx_students_class_nis_unique sudah ada.");
    } else {
      console.warn("Peringatan saat membuat idx_students_class_nis_unique:", msg);
    }
  }

  try {
    await db.execute(sql.raw(`
      CREATE UNIQUE INDEX \`idx_attendance_class_student_date_unique\`
      ON \`attendance_records\` (\`class_id\`, \`student_id\`, \`attendance_date\`);
    `));
    console.log("✓ Indeks idx_attendance_class_student_date_unique dibuat.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Duplicate key name")) {
      console.log("✓ Indeks idx_attendance_class_student_date_unique sudah ada.");
    } else {
      console.warn("Peringatan saat membuat idx_attendance_class_student_date_unique:", msg);
    }
  }

  console.log("==> Memeriksa dan memperbarui kolom tabel system_settings...");
  try {
    await db.execute(sql.raw(`
      ALTER TABLE \`system_settings\`
        ADD COLUMN IF NOT EXISTS \`redis_enabled\` tinyint(1) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS \`redis_url\` varchar(255) NULL;
    `));
    console.log("✓ Kolom redis_enabled & redis_url pada system_settings siap.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Duplicate column name") || (err as any)?.errno === 1060) {
      console.log("✓ Kolom redis_enabled & redis_url pada system_settings sudah ada.");
    } else {
      try {
        await db.execute(sql.raw("ALTER TABLE `system_settings` ADD COLUMN `redis_enabled` tinyint(1) NOT NULL DEFAULT 0;"));
      } catch (e: any) {
        if (!e.message?.includes("Duplicate column") && e.errno !== 1060) console.warn("Peringatan redis_enabled:", e.message);
      }
      try {
        await db.execute(sql.raw("ALTER TABLE `system_settings` ADD COLUMN `redis_url` varchar(255) NULL;"));
      } catch (e: any) {
        if (!e.message?.includes("Duplicate column") && e.errno !== 1060) console.warn("Peringatan redis_url:", e.message);
      }
    }
  }

  console.log("==> Memeriksa ketersediaan akun superadmin...");
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
    console.log(`✓ Akun superadmin aktif ditemukan: '${existingSuperadmin[0].username}' (${existingSuperadmin[0].displayName}).`);
  } else {
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
    console.log("✓ AKUN SUPERADMIN AWAL BERHASIL DIBUAT!");
    console.log(`  Username: ${defaultUsername}`);
    console.log(`  Password: ${defaultPassword}`);
    console.log("=================================================================");
  }
}

initDatabase()
  .then(() => {
    console.log("Inisialisasi database dan verifikasi akun berhasil!");
    process.exit(0);
  })
  .catch((err: any) => {
    console.error("Gagal menginisialisasi database:", err);
    if (
      err &&
      (err.code === "ER_ACCESS_DENIED_ERROR" ||
        err.code === "ER_ACCESS_DENIED_NO_PASSWORD_ERROR" ||
        err.errno === 1698 ||
        err.errno === 1045)
    ) {
      console.error("\n[PETUNJUK PERBAIKAN]");
      console.error("Kredensial database di .env ditolak oleh MariaDB/MySQL.");
      console.error("Jalankan skrip deploy dengan hak akses root/sudo agar user dan database dibuat otomatis:");
      console.error("  sudo ./scripts/deploy.sh");
      console.error("Atau jalankan skrip provisioning database:");
      console.error("  sudo node ./scripts/provision-db.mjs");
    }
    process.exit(1);
  });
