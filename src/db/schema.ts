import {
  mysqlTable,
  int,
  varchar,
  boolean,
  timestamp,
  mysqlEnum,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";

export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    username: varchar("username", { length: 50 }).notNull(),
    displayName: varchar("display_name", { length: 100 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    role: mysqlEnum("role", ["superadmin", "wali_kelas"]).notNull().default("wali_kelas"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_users_username_unique").on(table.username),
  ]
);

export const classes = mysqlTable(
  "classes",
  {
    id: int("id").autoincrement().primaryKey(),
    slug: varchar("slug", { length: 50 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    academicYear: varchar("academic_year", { length: 20 }).notNull().default("2026/2027"),
    periodTitle: varchar("period_title", { length: 100 }).notNull().default("Semester Genap"),
    waliKelasId: int("wali_kelas_id").references(() => users.id, { onDelete: "set null" }),
    parentPasswordHash: varchar("parent_password_hash", { length: 255 }),
    parentShowLetterFile: boolean("parent_show_letter_file").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_classes_slug_unique").on(table.slug),
    index("idx_classes_wali_kelas_id").on(table.waliKelasId),
  ]
);

export const students = mysqlTable(
  "students",
  {
    id: int("id").autoincrement().primaryKey(),
    classId: int("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    nis: varchar("nis", { length: 30 }),
    name: varchar("name", { length: 100 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_students_class_active_name").on(table.classId, table.isActive, table.name),
  ]
);

export const attendanceRecords = mysqlTable(
  "attendance_records",
  {
    id: int("id").autoincrement().primaryKey(),
    classId: int("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    studentId: int("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    attendanceDate: date("attendance_date", { mode: "string" }).notNull(),
    status: mysqlEnum("status", ["Izin", "Sakit", "Alpa"]).notNull(),
    infoSource: varchar("info_source", { length: 100 }).notNull().default("Orang tua"),
    description: varchar("description", { length: 255 }).notNull().default(""),
    letterFilePath: varchar("letter_file_path", { length: 255 }),
    letterMimeType: varchar("letter_mime_type", { length: 50 }),
    letterStatus: mysqlEnum("letter_status", ["Sudah", "Belum"]).notNull().default("Belum"),
    createdById: int("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    index("idx_attendance_class_date_status").on(
      table.classId,
      table.attendanceDate,
      table.status,
      table.letterStatus
    ),
    index("idx_attendance_class_student_date").on(
      table.classId,
      table.studentId,
      table.attendanceDate
    ),
  ]
);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  classes: many(classes),
  attendanceRecords: many(attendanceRecords),
}));

export const classesRelations = relations(classes, ({ one, many }) => ({
  waliKelas: one(users, {
    fields: [classes.waliKelasId],
    references: [users.id],
  }),
  students: many(students),
  attendanceRecords: many(attendanceRecords),
}));

export const studentsRelations = relations(students, ({ one, many }) => ({
  class: one(classes, {
    fields: [students.classId],
    references: [classes.id],
  }),
  attendanceRecords: many(attendanceRecords),
}));

export const attendanceRecordsRelations = relations(attendanceRecords, ({ one }) => ({
  class: one(classes, {
    fields: [attendanceRecords.classId],
    references: [classes.id],
  }),
  student: one(students, {
    fields: [attendanceRecords.studentId],
    references: [students.id],
  }),
  createdBy: one(users, {
    fields: [attendanceRecords.createdById],
    references: [users.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type ClassItem = typeof classes.$inferSelect;
export type NewClassItem = typeof classes.$inferInsert;
export type Student = typeof students.$inferSelect;
export type NewStudent = typeof students.$inferInsert;
export type AttendanceRecord = typeof attendanceRecords.$inferSelect;
export type NewAttendanceRecord = typeof attendanceRecords.$inferInsert;
