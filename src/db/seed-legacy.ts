import { db } from "./index";
import { users, classes, students, attendanceRecords } from "./schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import sharp from "sharp";

async function createSampleLetterImage(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (fs.existsSync(filePath)) return;

  const svg = `
  <svg width="800" height="1100" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#FDFBF7"/>
    <rect x="40" y="40" width="720" height="1020" fill="none" stroke="#D1D5DB" stroke-width="2"/>
    
    <text x="400" y="100" font-family="sans-serif" font-size="22" font-weight="bold" text-anchor="middle" fill="#1F2937">
      SURAT KETERANGAN DOKTER / IZIN ORANG TUA
    </text>
    <line x1="100" y1="120" x2="700" y2="120" stroke="#1F6F54" stroke-width="3"/>
    
    <text x="80" y="180" font-family="sans-serif" font-size="16" fill="#374151">Yang bertanda tangan di bawah ini menerangkan bahwa:</text>
    <text x="80" y="230" font-family="sans-serif" font-size="16" font-weight="bold" fill="#111827">Nama Siswa: Siswa Terkait</text>
    <text x="80" y="270" font-family="sans-serif" font-size="16" fill="#374151">Kelas: XII TKJ 2</text>
    <text x="80" y="310" font-family="sans-serif" font-size="16" fill="#374151">Perihal: Permohonan Izin / Istirahat Sakit</text>
    
    <text x="80" y="380" font-family="sans-serif" font-size="15" fill="#4B5563">
      Benar-benar sedang berhalangan hadir mengikuti kegiatan belajar mengajar
    </text>
    <text x="80" y="410" font-family="sans-serif" font-size="15" fill="#4B5563">
      di sekolah dikarenakan kondisi kesehatan / keperluan keluarga yang mendesak.
    </text>
    
    <rect x="80" y="460" width="640" height="160" fill="#F3F4F6" rx="8"/>
    <text x="100" y="500" font-family="sans-serif" font-size="14" font-weight="bold" fill="#1F2937">Catatan Pemeriksaan:</text>
    <text x="100" y="535" font-family="sans-serif" font-size="14" fill="#4B5563">Memerlukan istirahat dan pemulihan kesehatan di rumah.</text>
    <text x="100" y="570" font-family="sans-serif" font-size="14" fill="#4B5563">Demikian surat keterangan ini dibuat untuk dipergunakan sebagaimana mestinya.</text>
    
    <text x="550" y="750" font-family="sans-serif" font-size="15" fill="#374151">Hormat Kami,</text>
    <rect x="530" y="770" width="140" height="70" fill="none" stroke="#9CA3AF" stroke-dasharray="4"/>
    <text x="600" y="810" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#9CA3AF">[ Cap &amp; Tanda Tangan ]</text>
    <text x="600" y="870" font-family="sans-serif" font-size="14" font-weight="bold" text-anchor="middle" fill="#111827">Wali Murid / Dokter</text>
  </svg>
  `;

  await sharp(Buffer.from(svg))
    .webp({ quality: 90 })
    .toFile(filePath);
}

export async function seedLegacyData() {
  console.log("==> Starting Legacy Migration & Seeding...");

  // 1. Users
  console.log("1. Seeding Users...");
  const existingWildwina = await db.query.users.findFirst({
    where: eq(users.username, "wildwina"),
  });
  let wildwinaId = existingWildwina?.id;
  if (!existingWildwina) {
    const [res] = await db.insert(users).values({
      username: "wildwina",
      displayName: "Wildwina (Superadmin)",
      passwordHash: "$2b$12$occUQovg3h5m5t9dFfKej.vWwZvybKfCFgBJKyq/Mix6MooSsb.Yu",
      role: "superadmin",
      isActive: true,
    });
    wildwinaId = res.insertId;
    console.log("   Created Superadmin: wildwina");
  } else {
    console.log("   Superadmin wildwina already exists");
  }

  const existingErick = await db.query.users.findFirst({
    where: eq(users.username, "erick"),
  });
  let erickId = existingErick?.id;
  if (!existingErick) {
    const [res] = await db.insert(users).values({
      username: "erick",
      displayName: "Erick S.Kom (Wali Kelas)",
      passwordHash: "$2a$12$opludV2bdqxOT.Lx/Jh2dONQjIpS9XQJNr0/skP652rg/zLdA8.9W",
      role: "wali_kelas",
      isActive: true,
    });
    erickId = res.insertId;
    console.log("   Created Wali Kelas: erick");
  } else {
    console.log("   Wali Kelas erick already exists");
  }

  // 2. Class XII TKJ 2
  console.log("2. Seeding Class XII TKJ 2...");
  let targetClass = await db.query.classes.findFirst({
    where: eq(classes.slug, "xii-tkj-2"),
  });
  if (!targetClass) {
    const defaultParentPass = await bcrypt.hash("123456", 10);
    const [res] = await db.insert(classes).values({
      slug: "xii-tkj-2",
      name: "XII TKJ 2",
      academicYear: "2026/2027",
      periodTitle: "Semester Genap",
      waliKelasId: erickId,
      parentPasswordHash: defaultParentPass,
      parentShowLetterFile: false,
      isActive: true,
    });
    targetClass = await db.query.classes.findFirst({
      where: eq(classes.id, res.insertId),
    });
    console.log("   Created class XII TKJ 2 (slug: xii-tkj-2)");
  } else {
    console.log("   Class XII TKJ 2 already exists");
  }

  const classId = targetClass!.id;

  // 3. Students (All 34 students from db_suratizin.sql)
  console.log("3. Seeding 34 Students for XII TKJ 2...");
  const rawStudents = [
    { id: 34, name: "Adrian Manuel Hartono" },
    { id: 35, name: "Alfeus Efata Imanuel" },
    { id: 36, name: "Angela Ardhana Reswari Pradya Paramita" },
    { id: 37, name: "Angelina Thenaya" },
    { id: 38, name: "Christian Felix Sutanto" },
    { id: 39, name: "Davin Immanuel Abraham" },
    { id: 40, name: "Elia Eka Pranata Radius Alam" },
    { id: 41, name: "Fidelis Alledeo Andreananta Rahardja" },
    { id: 42, name: "Filemon Andreanus Yandra" },
    { id: 43, name: "Gabriel Patricio Habel Pattinama" },
    { id: 44, name: "Hubertus Hugo Putra Winarno" },
    { id: 45, name: "Imanuel Hariadi" },
    { id: 46, name: "Imanuel Sandy Lampard Kurniawan" },
    { id: 47, name: "Jasmine Daniela Fadirsair" },
    { id: 48, name: "Jonathan Andros" },
    { id: 49, name: "Jonathan Oswaldo Setiawan" },
    { id: 50, name: "Jovian Alexa Sesar" },
    { id: 51, name: "Krismenda Ekawati" },
    { id: 52, name: "Leon Joseph Violano" },
    { id: 53, name: "Lucky Marvel Goei Jaya" },
    { id: 54, name: "M. Rizqi Aditya Pramono" },
    { id: 55, name: "Maximillian Frederick Limutu" },
    { id: 56, name: "Michael Adrimiwa Tumanan" },
    { id: 57, name: "Nehemia Juenhauw Layantara" },
    { id: 58, name: "Putra Al Ikram Sadewa" },
    { id: 59, name: "Revaldo Benyamin Tano" },
    { id: 60, name: "Reyhan Hartanto" },
    { id: 61, name: "Rizky Akbar Yulian" },
    { id: 62, name: "Tessalonica Widodo" },
    { id: 63, name: "Vincensius Andhika Putra" },
    { id: 64, name: "Vincentius Giovanni Putra Paur" },
    { id: 65, name: "Widhiarto Sanjaya" },
    { id: 66, name: "Wisnu Putra Pratama" },
    { id: 67, name: "Yohanes Elkan Nathanael" },
  ];

  const studentNameToId = new Map<string, number>();

  for (const s of rawStudents) {
    const existing = await db.query.students.findFirst({
      where: (st, { and, eq }) => and(eq(st.classId, classId), eq(st.name, s.name)),
    });
    if (!existing) {
      const [res] = await db.insert(students).values({
        classId,
        name: s.name,
        isActive: true,
      });
      studentNameToId.set(s.name, res.insertId);
    } else {
      studentNameToId.set(s.name, existing.id);
    }
  }
  console.log(`   Processed ${rawStudents.length} students.`);

  // 4. Sample image for legacy letters
  const sampleImagePath = path.resolve("./storage/uploads/legacy/sample_surat_izin.webp");
  await createSampleLetterImage(sampleImagePath);
  const relativeSamplePath = "legacy/sample_surat_izin.webp";

  // 5. Attendance Records (12 records from db_suratizin.sql)
  console.log("4. Seeding 12 Historical Attendance Records...");
  const rawRecords = [
    {
      legacyId: 308,
      nama: "Widhiarto Sanjaya",
      izin_tanggal: "2026-09-02",
      info_dari: "Siswa sendiri",
      keterangan: "Kontrol kecelakaan",
      surat_izin: "1788928313_6aa0e13904e9b_image.jpg",
      status_surat: "Sudah" as const,
      status_kehadiran: "Sakit" as const,
    },
    {
      legacyId: 309,
      nama: "Elia Eka Pranata Radius Alam",
      izin_tanggal: "2026-09-07",
      info_dari: "Orang tua",
      keterangan: "Ijin bikin sim",
      surat_izin: "1790147449_6ab37b798b34c_image.jpg",
      status_surat: "Sudah" as const,
      status_kehadiran: "Izin" as const,
    },
    {
      legacyId: 310,
      nama: "Rizky Akbar Yulian",
      izin_tanggal: "2026-09-09",
      info_dari: "Orang tua",
      keterangan: "Sakit diare",
      surat_izin: "1791348950_6ac5d0d6f1bd3_image.jpg",
      status_surat: "Sudah" as const,
      status_kehadiran: "Sakit" as const,
    },
    {
      legacyId: 311,
      nama: "Jovian Alexa Sesar",
      izin_tanggal: "2026-09-15",
      info_dari: "Orang tua",
      keterangan: "Sakit",
      surat_izin: "1790054539_6ab2108b9ba65_image.jpg",
      status_surat: "Sudah" as const,
      status_kehadiran: "Sakit" as const,
    },
    {
      legacyId: 312,
      nama: "Wisnu Putra Pratama",
      izin_tanggal: "2026-09-18",
      info_dari: "Orang tua",
      keterangan: "Ijin",
      surat_izin: "1790054487_6ab21057ed212_image.jpg",
      status_surat: "Sudah" as const,
      status_kehadiran: "Izin" as const,
    },
    {
      legacyId: 313,
      nama: "Imanuel Hariadi",
      izin_tanggal: "2026-09-18",
      info_dari: "Pengurus kelas",
      keterangan: "Ga ada",
      surat_izin: "1790147490_6ab37ba229f17_image.jpg",
      status_surat: "Sudah" as const,
      status_kehadiran: "Izin" as const,
    },
    {
      legacyId: 314,
      nama: "Revaldo Benyamin Tano",
      izin_tanggal: "2026-09-23",
      info_dari: "Orang tua",
      keterangan: "Ikin event dari La Lisa",
      surat_izin: "1790054616_6ab210d8c6912_image.jpg",
      status_surat: "Sudah" as const,
      status_kehadiran: "Izin" as const,
    },
    {
      legacyId: 315,
      nama: "Jovian Alexa Sesar",
      izin_tanggal: "2026-09-23",
      info_dari: "Orang tua",
      keterangan: "Ikin event dari La Lisa",
      surat_izin: "1790054681_6ab21119c1dee_image.jpg",
      status_surat: "Sudah" as const,
      status_kehadiran: "Izin" as const,
    },
    {
      legacyId: 316,
      nama: "Imanuel Hariadi",
      izin_tanggal: "2026-09-29",
      info_dari: "Orang tua",
      keterangan: "Sakit diare",
      surat_izin: "1791165366_6ac303b68ccd7_image.jpg",
      status_surat: "Sudah" as const,
      status_kehadiran: "Sakit" as const,
    },
    {
      legacyId: 317,
      nama: "Imanuel Hariadi",
      izin_tanggal: "2026-09-30",
      info_dari: "Orang tua",
      keterangan: "Masih Sakit dari sebelumnya",
      surat_izin: "1791165388_6ac303ccab8ed_image.jpg",
      status_surat: "Sudah" as const,
      status_kehadiran: "Sakit" as const,
    },
    {
      legacyId: 318,
      nama: "Revaldo Benyamin Tano",
      izin_tanggal: "2026-10-01",
      info_dari: "Orang tua",
      keterangan: "Sakit demam",
      surat_izin: "-",
      status_surat: "Belum" as const,
      status_kehadiran: "Sakit" as const,
    },
    {
      legacyId: 319,
      nama: "Revaldo Benyamin Tano",
      izin_tanggal: "2026-10-02",
      info_dari: "Orang tua",
      keterangan: "Sakit",
      surat_izin: "1791348887_6ac5d0970bf1e_image.jpg",
      status_surat: "Sudah" as const,
      status_kehadiran: "Sakit" as const,
    },
  ];

  let insertedCount = 0;
  for (const r of rawRecords) {
    const studentId = studentNameToId.get(r.nama);
    if (!studentId) {
      console.warn(`   Warning: Student "${r.nama}" not found for attendance ID ${r.legacyId}`);
      continue;
    }

    const existingRecord = await db.query.attendanceRecords.findFirst({
      where: (att, { and, eq }) =>
        and(
          eq(att.classId, classId),
          eq(att.studentId, studentId),
          eq(att.attendanceDate, r.izin_tanggal)
        ),
    });

    if (!existingRecord) {
      const hasFile = r.status_surat === "Sudah" && r.surat_izin !== "-";
      await db.insert(attendanceRecords).values({
        classId,
        studentId,
        attendanceDate: r.izin_tanggal,
        status: r.status_kehadiran,
        infoSource: r.info_dari,
        description: r.keterangan,
        letterFilePath: hasFile ? relativeSamplePath : null,
        letterMimeType: hasFile ? "image/webp" : null,
        letterStatus: r.status_surat,
        createdById: erickId,
      });
      insertedCount++;
    }
  }

  console.log(`   Seeded ${insertedCount} attendance records.`);
  console.log("==> Legacy Migration & Seeding Completed Successfully!\n");
}

if (process.argv[1] && process.argv[1].endsWith("seed-legacy.ts")) {
  seedLegacyData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration error:", err);
      process.exit(1);
    });
}
