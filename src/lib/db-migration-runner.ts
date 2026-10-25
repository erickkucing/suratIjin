import mysql from "mysql2/promise";
import { RemoteDbConfig, createRemoteConnection } from "./db-remote";
import { db } from "@/db";
import { users, classes, students, attendanceRecords, systemSettings } from "@/db/schema";
import bcrypt from "bcryptjs";

export interface MigrationOptions {
  copyExistingData?: boolean;
  dropExistingTables?: boolean;
}

export interface MigrationResult {
  success: boolean;
  logs: string[];
  stats?: {
    usersCount: number;
    classesCount: number;
    studentsCount: number;
    recordsCount: number;
    settingsCount: number;
  };
  error?: string;
}

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
        \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        \`updated_by_id\` int,
        CONSTRAINT \`system_settings_id\` PRIMARY KEY(\`id\`),
        CONSTRAINT \`system_settings_updated_by_id_users_id_fk\` FOREIGN KEY (\`updated_by_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
  },
];

export async function runRemoteMigration(
  config: RemoteDbConfig,
  options: MigrationOptions = {}
): Promise<MigrationResult> {
  const logs: string[] = [];
  let conn: mysql.Connection | null = null;

  try {
    logs.push("==> Membuka koneksi ke server database target...");
    conn = await createRemoteConnection(config);
    logs.push("✓ Berhasil terhubung ke database target.");

    // 1. Temporarily disable foreign key checks for clean DDL execution
    await conn.query("SET FOREIGN_KEY_CHECKS = 0;");
    await conn.query("SET NAMES utf8mb4;");

    if (options.dropExistingTables) {
      logs.push("--> Menghapus tabel lama di database target (dropExistingTables aktif)...");
      const tables = ["attendance_records", "students", "classes", "system_settings", "users"];
      for (const t of tables) {
        await conn.query(`DROP TABLE IF EXISTS \`${t}\`;`);
      }
      logs.push("✓ Tabel lama berhasil dibersihkan.");
    }

    // 2. Create tables
    logs.push("--> Membuat skema tabel (DDL)...");
    for (const def of TABLE_DEFINITIONS) {
      await conn.query(def.ddl);
      logs.push(`✓ Tabel \`${def.name}\` siap.`);
    }

    let stats = {
      usersCount: 0,
      classesCount: 0,
      studentsCount: 0,
      recordsCount: 0,
      settingsCount: 0,
    };

    // 3. Optional Data Copy from local DB to remote DB
    if (options.copyExistingData) {
      logs.push("--> Memulai penyalinan data dari database lokal...");

      // A. Users
      const localUsers = await db.query.users.findMany();
      if (localUsers.length > 0) {
        for (const u of localUsers) {
          await conn.query(
            `INSERT INTO \`users\` (\`id\`, \`username\`, \`display_name\`, \`password_hash\`, \`role\`, \`is_active\`, \`created_at\`)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE \`display_name\` = VALUES(\`display_name\`), \`password_hash\` = VALUES(\`password_hash\`), \`role\` = VALUES(\`role\`), \`is_active\` = VALUES(\`is_active\`);`,
            [u.id, u.username, u.displayName, u.passwordHash, u.role, u.isActive, u.createdAt]
          );
        }
        stats.usersCount = localUsers.length;
        logs.push(`✓ Berhasil menyalin ${localUsers.length} akun pengguna/wali kelas.`);
      }

      // B. Classes
      const localClasses = await db.query.classes.findMany();
      if (localClasses.length > 0) {
        for (const c of localClasses) {
          await conn.query(
            `INSERT INTO \`classes\` (\`id\`, \`slug\`, \`name\`, \`academic_year\`, \`period_title\`, \`wali_kelas_id\`, \`parent_password_hash\`, \`parent_show_letter_file\`, \`is_active\`, \`created_at\`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`), \`academic_year\` = VALUES(\`academic_year\`), \`period_title\` = VALUES(\`period_title\`), \`wali_kelas_id\` = VALUES(\`wali_kelas_id\`), \`parent_password_hash\` = VALUES(\`parent_password_hash\`), \`parent_show_letter_file\` = VALUES(\`parent_show_letter_file\`);`,
            [c.id, c.slug, c.name, c.academicYear, c.periodTitle, c.waliKelasId, c.parentPasswordHash, c.parentShowLetterFile, c.isActive, c.createdAt]
          );
        }
        stats.classesCount = localClasses.length;
        logs.push(`✓ Berhasil menyalin ${localClasses.length} data kelas.`);
      }

      // C. Students
      const localStudents = await db.query.students.findMany();
      if (localStudents.length > 0) {
        for (const s of localStudents) {
          await conn.query(
            `INSERT INTO \`students\` (\`id\`, \`class_id\`, \`nis\`, \`name\`, \`is_active\`, \`created_at\`)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`), \`nis\` = VALUES(\`nis\`), \`is_active\` = VALUES(\`is_active\`);`,
            [s.id, s.classId, s.nis, s.name, s.isActive, s.createdAt]
          );
        }
        stats.studentsCount = localStudents.length;
        logs.push(`✓ Berhasil menyalin ${localStudents.length} data siswa.`);
      }

      // D. Attendance Records
      const localRecords = await db.query.attendanceRecords.findMany();
      if (localRecords.length > 0) {
        for (const r of localRecords) {
          await conn.query(
            `INSERT INTO \`attendance_records\` (\`id\`, \`class_id\`, \`student_id\`, \`attendance_date\`, \`status\`, \`info_source\`, \`description\`, \`letter_file_path\`, \`letter_mime_type\`, \`letter_status\`, \`created_by_id\`, \`created_at\`, \`updated_at\`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE \`status\` = VALUES(\`status\`), \`description\` = VALUES(\`description\`), \`letter_file_path\` = VALUES(\`letter_file_path\`), \`letter_status\` = VALUES(\`letter_status\`);`,
            [r.id, r.classId, r.studentId, r.attendanceDate, r.status, r.infoSource, r.description, r.letterFilePath, r.letterMimeType, r.letterStatus, r.createdById, r.createdAt, r.updatedAt]
          );
        }
        stats.recordsCount = localRecords.length;
        logs.push(`✓ Berhasil menyalin ${localRecords.length} catatan presensi & izin.`);
      }

      // E. System Settings
      const localSettings = await db.query.systemSettings.findFirst();
      if (localSettings) {
        await conn.query(
          `INSERT INTO \`system_settings\` (\`id\`, \`app_name\`, \`logo_url\`, \`theme_color\`, \`updated_at\`, \`updated_by_id\`)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE \`app_name\` = VALUES(\`app_name\`), \`logo_url\` = VALUES(\`logo_url\`), \`theme_color\` = VALUES(\`theme_color\`);`,
          [localSettings.id, localSettings.appName, localSettings.logoUrl, localSettings.themeColor, localSettings.updatedAt, localSettings.updatedById]
        );
        stats.settingsCount = 1;
        logs.push("✓ Pengaturan sistem (branding & tema) berhasil disalin.");
      }
    }

    // 4. Fallback / Superadmin check: ensure at least one superadmin exists
    const [userRows] = await conn.query<mysql.RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM `users` WHERE `role` = 'superadmin';"
    );
    const superadminCount = Number(userRows[0]?.total || 0);

    if (superadminCount === 0) {
      logs.push("--> Membuat akun superadmin bawaan di database target...");
      const defaultPasswordHash = await bcrypt.hash("feelgood6969", 10);
      await conn.query(
        `INSERT INTO \`users\` (\`username\`, \`display_name\`, \`password_hash\`, \`role\`, \`is_active\`)
         VALUES ('admin', 'Administrator Utama', ?, 'superadmin', true);`,
        [defaultPasswordHash]
      );
      logs.push("✓ Akun superadmin 'admin' dengan password 'feelgood6969' berhasil dibuat.");
    }

    // 5. System Settings initialization if still empty
    const [settingsRows] = await conn.query<mysql.RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM `system_settings`;"
    );
    if (Number(settingsRows[0]?.total || 0) === 0) {
      await conn.query(
        `INSERT INTO \`system_settings\` (\`id\`, \`app_name\`, \`theme_color\`)
         VALUES (1, 'Sistem Surat Izin Siswa', 'terracotta');`
      );
      logs.push("✓ Pengaturan sistem default berhasil diinisialisasi.");
    }

    // 6. Restore foreign key checks
    await conn.query("SET FOREIGN_KEY_CHECKS = 1;");
    logs.push("✓ Validasi Foreign Key diaktifkan kembali.");
    logs.push("==> Migrasi skema dan penyiapan database berhasil 100% tanpa galat.");

    return {
      success: true,
      logs,
      stats,
    };
  } catch (err: unknown) {
    const errorObj = err as { code?: string; message?: string };
    const errMsg = errorObj.message || "Terjadi kesalahan saat migrasi skema database.";
    logs.push(`✗ Galat: ${errMsg}`);

    return {
      success: false,
      logs,
      error: errMsg,
    };
  } finally {
    if (conn) {
      await conn.query("SET FOREIGN_KEY_CHECKS = 1;").catch(() => {});
      await conn.end().catch(() => {});
    }
  }
}
