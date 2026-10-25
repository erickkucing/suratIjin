CREATE TABLE `attendance_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`class_id` int NOT NULL,
	`student_id` int NOT NULL,
	`attendance_date` date NOT NULL,
	`status` enum('Izin','Sakit','Alpa') NOT NULL,
	`info_source` varchar(100) NOT NULL DEFAULT 'Orang tua',
	`description` varchar(255) NOT NULL DEFAULT '',
	`letter_file_path` varchar(255),
	`letter_mime_type` varchar(50),
	`letter_status` enum('Sudah','Belum') NOT NULL DEFAULT 'Belum',
	`created_by_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attendance_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `classes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(50) NOT NULL,
	`name` varchar(100) NOT NULL,
	`academic_year` varchar(20) NOT NULL DEFAULT '2026/2027',
	`period_title` varchar(100) NOT NULL DEFAULT 'Semester Genap',
	`wali_kelas_id` int,
	`parent_password_hash` varchar(255),
	`parent_show_letter_file` boolean NOT NULL DEFAULT false,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `classes_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_classes_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` int AUTO_INCREMENT NOT NULL,
	`class_id` int NOT NULL,
	`nis` varchar(30),
	`name` varchar(100) NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `students_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `system_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`app_name` varchar(150) NOT NULL DEFAULT 'Sistem Surat Izin Siswa',
	`logo_url` varchar(255),
	`theme_color` varchar(50) NOT NULL DEFAULT 'terracotta',
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`updated_by_id` int,
	CONSTRAINT `system_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(50) NOT NULL,
	`display_name` varchar(100) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`role` enum('superadmin','wali_kelas') NOT NULL DEFAULT 'wali_kelas',
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_users_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_created_by_id_users_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `classes` ADD CONSTRAINT `classes_wali_kelas_id_users_id_fk` FOREIGN KEY (`wali_kelas_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `students` ADD CONSTRAINT `students_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `system_settings` ADD CONSTRAINT `system_settings_updated_by_id_users_id_fk` FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_attendance_class_date_status` ON `attendance_records` (`class_id`,`attendance_date`,`status`,`letter_status`);--> statement-breakpoint
CREATE INDEX `idx_attendance_class_student_date` ON `attendance_records` (`class_id`,`student_id`,`attendance_date`);--> statement-breakpoint
CREATE INDEX `idx_classes_wali_kelas_id` ON `classes` (`wali_kelas_id`);--> statement-breakpoint
CREATE INDEX `idx_students_class_active_name` ON `students` (`class_id`,`is_active`,`name`);