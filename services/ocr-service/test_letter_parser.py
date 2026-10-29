import unittest
import datetime
from letter_parser import (
    match_student,
    extract_candidate_name,
    extract_class,
    extract_dates,
    classify_status_and_reason,
    detect_info_source,
    parse_indonesian_date,
    clean_candidate_name,
)

class TestLetterParser(unittest.TestCase):
    def setUp(self):
        self.sample_students = [
            {"id": 1, "name": "Ahmad Dahlan", "nis": "1001"},
            {"id": 2, "name": "Budi Santoso", "nis": "1002"},
            {"id": 3, "name": "Citra Lestari", "nis": "1003"},
            {"id": 4, "name": "Muhammad Rizky Pratama", "nis": "1004"},
        ]

    def test_clean_candidate_name(self):
        self.assertEqual(clean_candidate_name("Nama: Budi Santoso"), "Budi Santoso")
        self.assertEqual(clean_candidate_name("Nama Siswa : Citra Lestari"), "Citra Lestari")
        self.assertEqual(clean_candidate_name("Ananda: Ahmad Dahlan"), "Ahmad Dahlan")
        self.assertEqual(clean_candidate_name("anak kami: Budi Santoso"), "Budi Santoso")

    def test_extract_candidate_name(self):
        lines = [
            "Surat Izin Tidak Masuk Sekolah",
            "Nama Siswa : Doni Darmawan",
            "Kelas : 7A",
        ]
        cand = extract_candidate_name(lines)
        self.assertEqual(cand, "Doni Darmawan")

    def test_extract_class(self):
        self.assertEqual(extract_class("Kepada Yth. Wali Kelas 7A"), "7A")
        self.assertEqual(extract_class("Nama : Budi Santoso\nKelas : VII-A"), "VII-A")
        self.assertEqual(extract_class("Kls: 10 MIPA 1\nNIS: 1001"), "10 MIPA 1")
        self.assertEqual(extract_class("Ruang: 9 B"), "9 B")
        self.assertIsNone(extract_class("Tidak ada info ruangan"))

    def test_match_student_exact(self):
        raw_lines = [
            "Surat Izin",
            "Nama : Budi Santoso",
            "Kelas : 7A",
        ]
        match = match_student(raw_lines, "\n".join(raw_lines), self.sample_students)
        self.assertIsNotNone(match)
        self.assertEqual(match["studentId"], 2)
        self.assertEqual(match["studentName"], "Budi Santoso")
        self.assertGreaterEqual(match["matchConfidence"], 0.90)

    def test_match_student_fuzzy_handwriting_typo(self):
        # Simulated noisy OCR result from handwriting (e.g., '0' instead of 'o')
        raw_lines = [
            "Surat Keterangan Sakit",
            "Nama Siswa : Budi Sant0so",
            "Tidak dapat mengikuti KBM",
        ]
        match = match_student(raw_lines, "\n".join(raw_lines), self.sample_students)
        self.assertIsNotNone(match)
        self.assertEqual(match["studentId"], 2)
        self.assertEqual(match["studentName"], "Budi Santoso")
        self.assertGreaterEqual(match["matchConfidence"], 0.85)

    def test_match_student_by_nis(self):
        raw_lines = [
            "Surat Izin Tidak Masuk",
            "NIS: 1003",
            "Alasan keperluan penting",
        ]
        match = match_student(raw_lines, "\n".join(raw_lines), self.sample_students)
        self.assertIsNotNone(match)
        self.assertEqual(match["studentId"], 3)
        self.assertEqual(match["studentName"], "Citra Lestari")
        self.assertEqual(match["matchConfidence"], 0.99)

    def test_match_student_sliding_window_in_sentence(self):
        raw_lines = [
            "Yang bertanda tangan di bawah ini menerangkan bahwa ananda Citra Lestari sedang sakit",
        ]
        match = match_student(raw_lines, "\n".join(raw_lines), self.sample_students)
        self.assertIsNotNone(match)
        self.assertEqual(match["studentId"], 3)
        self.assertEqual(match["studentName"], "Citra Lestari")

    def test_extract_dates_single_indonesian(self):
        text = "Surat izin pada hari Senin tanggal 26 Oktober 2026 karena ada acara keluarga"
        res = extract_dates(text)
        self.assertEqual(res["startDate"], "2026-10-26")
        self.assertEqual(res["endDate"], "2026-10-26")
        self.assertFalse(res["isMultiDay"])

    def test_extract_dates_range_with_sd(self):
        text = "Mohon izin tidak dapat hadir pada tanggal 26 s/d 28 Oktober 2026"
        res = extract_dates(text)
        self.assertEqual(res["startDate"], "2026-10-26")
        self.assertEqual(res["endDate"], "2026-10-28")
        self.assertTrue(res["isMultiDay"])

    def test_extract_dates_range_with_hyphen(self):
        text = "Izin selama beberapa hari 26 - 28 Oktober 2026"
        res = extract_dates(text)
        self.assertEqual(res["startDate"], "2026-10-26")
        self.assertEqual(res["endDate"], "2026-10-28")
        self.assertTrue(res["isMultiDay"])

    def test_extract_dates_range_without_year(self):
        text = "Mohon izin tidak hadir pada tanggal 26 Oktober s/d 28 Oktober karena sakit"
        res = extract_dates(text)
        curr_year = datetime.date.today().year
        self.assertEqual(res["startDate"], f"{curr_year}-10-26")
        self.assertEqual(res["endDate"], f"{curr_year}-10-28")
        self.assertTrue(res["isMultiDay"])

    def test_extract_dates_range_with_days_of_week(self):
        text = "tidak dapat masuk sekolah pada hari Senin, 26 Oktober s/d Rabu, 28 Oktober 2026"
        res = extract_dates(text)
        self.assertEqual(res["startDate"], "2026-10-26")
        self.assertEqual(res["endDate"], "2026-10-28")
        self.assertTrue(res["isMultiDay"])

    def test_extract_dates_duration_selama_hari(self):
        text = "Tidak dapat hadir mulai tanggal 26 Oktober 2026 selama 3 hari"
        res = extract_dates(text)
        self.assertEqual(res["startDate"], "2026-10-26")
        self.assertEqual(res["endDate"], "2026-10-28")
        self.assertTrue(res["isMultiDay"])

    def test_extract_dates_duration_written_words(self):
        text = "Tidak dapat hadir mulai tanggal 26 Oktober 2026 selama 3 (tiga) hari"
        res = extract_dates(text)
        self.assertEqual(res["startDate"], "2026-10-26")
        self.assertEqual(res["endDate"], "2026-10-28")
        self.assertTrue(res["isMultiDay"])

    def test_extract_dates_duration_seminggu(self):
        text = "Tidak dapat mengikuti KBM mulai tanggal 20 Oktober 2026 selama seminggu"
        res = extract_dates(text)
        self.assertEqual(res["startDate"], "2026-10-20")
        self.assertEqual(res["endDate"], "2026-10-26")
        self.assertTrue(res["isMultiDay"])

    def test_extract_dates_numeric_range(self):
        text = "Izin tanggal 26/10/2026 - 28/10/2026"
        res = extract_dates(text)
        self.assertEqual(res["startDate"], "2026-10-26")
        self.assertEqual(res["endDate"], "2026-10-28")
        self.assertTrue(res["isMultiDay"])

    def test_extract_dates_numeric_shared_month_range(self):
        text = "Mohon izin pada tanggal 26 - 28/10/2026"
        res = extract_dates(text)
        self.assertEqual(res["startDate"], "2026-10-26")
        self.assertEqual(res["endDate"], "2026-10-28")
        self.assertTrue(res["isMultiDay"])

    def test_extract_dates_precedence_over_letter_header_date(self):
        text = """
        Jakarta, tgl 24 Oktober 2026
        Kepada Yth. Wali Kelas

        Memberitahukan bahwa anak kami tidak dapat masuk sekolah tanggal 26 Oktober 2026 karena sakit.
        """
        res = extract_dates(text)
        self.assertEqual(res["startDate"], "2026-10-26")
        self.assertEqual(res["endDate"], "2026-10-26")

    def test_extract_dates_ignores_birth_date_in_doctor_letter(self):
        # Doctor note with student birth date and letter issuance date
        text = """
        KLINIK SEHAT MEDIKA
        SURAT KETERANGAN SAKIT
        Nama: Jasmine Daniela Fadirsair
        Tempat/Tgl Lahir: Jakarta, 15 April 2009
        Umur: 17 Tahun
        Diagnosa: Demam Febris
        Perlu istirahat terhitung mulai tanggal surat ini diberikan.
        Jakarta, 29 Oktober 2026
        Dokter Pemeriksa,
        dr. Hendra
        """
        res = extract_dates(text)
        self.assertEqual(res["startDate"], "2026-10-29")
        self.assertEqual(res["endDate"], "2026-10-29")
        self.assertFalse(res["isMultiDay"])

    def test_extract_dates_ignores_birth_date_with_duration(self):
        text = """
        SURAT KETERANGAN DOKTER
        Nama Pasien: Jasmine Daniela Fadirsair
        TTL: 15/04/2009
        Diberikan istirahat sakit selama 3 hari.
        Jakarta, 26 Oktober 2026
        """
        res = extract_dates(text)
        self.assertEqual(res["startDate"], "2026-10-26")
        self.assertEqual(res["endDate"], "2026-10-28")
        self.assertTrue(res["isMultiDay"])

    def test_extract_dates_birth_date_only_returns_empty(self):
        text = """
        Nama: Jasmine Daniela Fadirsair
        Tempat / Tanggal Lahir: Jakarta, 15 April 2009
        Sakit demam
        """
        res = extract_dates(text)
        self.assertEqual(res["startDate"], "")
        self.assertEqual(res["endDate"], "")

    def test_classify_status_sakit(self):
        text = "Anak kami tidak dapat masuk sekolah karena sedang sakit demam tinggi dan harus istirahat dokter."
        status, reason = classify_status_and_reason(text)
        self.assertEqual(status, "Sakit")
        self.assertIn("demam", reason.lower())

    def test_classify_status_sakit_with_surat_izin_header(self):
        # Indonesian parents typically title their letter 'SURAT IZIN' even when the child is sick
        text = """
        SURAT IZIN TIDAK MASUK SEKOLAH
        Kepada Yth. Bapak/Ibu Guru
        Dengan ini kami selaku orang tua memohon izin bahwa anak kami:
        Nama: Budi Santoso
        Tidak dapat hadir ke sekolah karena sedang sakit.
        """
        status, reason = classify_status_and_reason(text)
        self.assertEqual(status, "Sakit")
        self.assertIn("sakit", reason.lower())

    def test_classify_status_izin(self):
        text = "Dengan ini kami memohon izin karena ada keperluan keluarga menghadiri acara pernikahan saudara di Surabaya."
        status, reason = classify_status_and_reason(text)
        self.assertEqual(status, "Izin")
        self.assertIn("pernikahan", reason.lower())

    def test_classify_status_caregiver_as_izin(self):
        text = "Mohon izin tidak hadir karena harus menjenguk dan merawat orang tua yang sakit di luar kota."
        status, reason = classify_status_and_reason(text)
        self.assertEqual(status, "Izin")

    def test_detect_info_source(self):
        text = "Hormat kami,\nOrang tua murid"
        self.assertEqual(detect_info_source(text), "Orang tua")

class TestInternalSecretAuth(unittest.TestCase):
    def test_verify_internal_secret_success(self):
        import asyncio
        from main import verify_internal_secret
        asyncio.run(verify_internal_secret("surat-ijin-internal-secret-2026"))

    def test_verify_internal_secret_missing(self):
        import asyncio
        from main import verify_internal_secret
        from fastapi import HTTPException
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(verify_internal_secret(None))
        self.assertEqual(ctx.exception.status_code, 401)

    def test_verify_internal_secret_wrong_token(self):
        import asyncio
        from main import verify_internal_secret
        from fastapi import HTTPException
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(verify_internal_secret("invalid-token-123"))
        self.assertEqual(ctx.exception.status_code, 401)

if __name__ == "__main__":
    unittest.main()
