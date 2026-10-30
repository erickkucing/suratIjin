import unittest
from extractor import (
    clean_student_name,
    clean_nis,
    is_header_or_footer_row,
    is_noise_text,
    extract_students_from_ocr_boxes,
    downscale_image_if_needed,
)
import numpy as np

class TestExtractor(unittest.TestCase):
    def test_header_row_detection(self):
        self.assertTrue(is_header_or_footer_row("DATA NAMA SISWA KELAS XII TEKNIK KOMPUTER DAN JARINGAN-2"))
        self.assertTrue(is_header_or_footer_row("TAHUN PELAJARAN 2026/2027"))
        self.assertTrue(is_header_or_footer_row("Daftar Hadir Siswa Kelas XI RPL"))
        self.assertTrue(is_header_or_footer_row("No Nama Nomor Induk Keterangan"))

    def test_wali_kelas_row_detection(self):
        self.assertTrue(is_header_or_footer_row("Wali Kelas : Erick Kresnamurti, S.Kom. Gr."))
        self.assertTrue(is_header_or_footer_row("Wali KelasErick KresnamurtiS.Kom.Gr."))
        self.assertTrue(is_header_or_footer_row("Wali Kelas : Budi Santoso, S.Pd."))
        self.assertTrue(is_header_or_footer_row("Guru Kelas : Siti Aminah, M.Pd."))

    def test_footer_update_row_detection(self):
        self.assertTrue(is_header_or_footer_row("Update per 02 Desember 2024"))
        self.assertTrue(is_header_or_footer_row("Update per 15 Januari 2025"))
        self.assertTrue(is_header_or_footer_row("Halaman 1 dari 2"))

    def test_clean_nis_composite(self):
        self.assertEqual(clean_nis("9259 / 110 / 066"), "9259/110/066")
        self.assertEqual(clean_nis("9259/110/066"), "9259/110/066")
        self.assertEqual(clean_nis("1001"), "1001")
        self.assertEqual(clean_nis("2024001"), "2024001")

    def test_clean_student_name_valid(self):
        self.assertEqual(clean_student_name("1. Adrian Manuel Hartono"), "Adrian Manuel Hartono")
        self.assertEqual(clean_student_name("Yohanes Elkan Nathanael"), "Yohanes Elkan Nathanael")
        self.assertEqual(clean_student_name("Angela Ardhana Reswari Pradya Paramita"), "Angela Ardhana Reswari Pradya Paramita")
        # Real person names with month roots must never be false-positively rejected
        self.assertEqual(clean_student_name("Aprilia Rahmawati"), "Aprilia Rahmawati")
        self.assertEqual(clean_student_name("Agustinus Prasetyo"), "Agustinus Prasetyo")
        self.assertEqual(clean_student_name("Muhammad Januar"), "Muhammad Januar")
        self.assertEqual(clean_student_name("Febri Andika"), "Febri Andika")
        self.assertEqual(clean_student_name("Julius Cesar"), "Julius Cesar")
        self.assertEqual(clean_student_name("Desi Permatasari"), "Desi Permatasari")
        self.assertEqual(clean_student_name("Novita Sari"), "Novita Sari")

    def test_clean_student_name_noise_rejected(self):
        self.assertIsNone(clean_student_name("DATA NAMA SISWA KELAS XII"))
        self.assertIsNone(clean_student_name("Wali Kelas : Erick Kresnamurti, S.Kom. Gr."))
        self.assertIsNone(clean_student_name("Update per 02 Desember 2024"))
        self.assertIsNone(clean_student_name("Ember.202"))
        self.assertIsNone(clean_student_name("Wmber"))
        self.assertIsNone(clean_student_name("Desember"))
        self.assertIsNone(clean_student_name("No"))
        self.assertIsNone(clean_student_name("L"))
        self.assertIsNone(clean_student_name("P"))

    def test_extract_students_from_boxes_filter_all_noise(self):
        # Synthetic OCR boxes simulating the exact problem
        mock_boxes = [
            [[[10, 10], [500, 10], [500, 30], [10, 30]], ("DATA NAMA SISWA KELAS XII TEKNIK KOMPUTER DAN JARINGAN-2", 0.98)],
            [[[10, 35], [300, 35], [300, 50], [10, 50]], ("TAHUN PELAJARAN 2026/2027", 0.98)],
            [[[10, 55], [400, 55], [400, 70], [10, 70]], ("Wali Kelas : Erick Kresnamurti, S.Kom. Gr.", 0.96)],
            [[[10, 80], [450, 80], [450, 95], [10, 95]], ("No Nama Nomor Induk Keterangan", 0.99)],
            [[[10, 110], [30, 110], [30, 125], [10, 125]], ("1", 0.99)],
            [[[40, 110], [250, 110], [250, 125], [40, 125]], ("Adrian Manuel Hartono", 0.99)],
            [[[260, 110], [280, 110], [280, 125], [260, 125]], ("L", 0.99)],
            [[[290, 110], [420, 110], [420, 125], [290, 125]], ("9259 / 110 / 066", 0.99)],
            [[[10, 135], [30, 135], [30, 150], [10, 150]], ("2", 0.99)],
            [[[40, 135], [250, 135], [250, 150], [40, 150]], ("Yohanes Elkan Nathanael", 0.99)],
            [[[260, 135], [280, 135], [280, 150], [260, 150]], ("L", 0.99)],
            [[[290, 135], [420, 135], [420, 150], [290, 150]], ("9509/181/066", 0.99)],
            [[[300, 200], [500, 200], [500, 215], [300, 215]], ("Update per 02 Desember 2024", 0.95)],
            [[[310, 220], [450, 220], [450, 235], [310, 235]], ("Ember.202", 0.91)],
        ]
        students = extract_students_from_ocr_boxes([mock_boxes])
        self.assertEqual(len(students), 2)
        self.assertEqual(students[0]["name"], "Adrian Manuel Hartono")
        self.assertEqual(students[0]["nis"], "9259/110/066")
        self.assertEqual(students[1]["name"], "Yohanes Elkan Nathanael")
        self.assertEqual(students[1]["nis"], "9509/181/066")

    def test_downscale_image_if_needed(self):
        # 1. Image with dimension larger than max_side
        large_img = np.zeros((3000, 2000, 3), dtype=np.uint8)
        scaled = downscale_image_if_needed(large_img, max_side=1200)
        self.assertEqual(scaled.shape[0], 1200)
        self.assertEqual(scaled.shape[1], 800)

        # 2. Image already smaller than max_side remains unchanged
        small_img = np.zeros((800, 600, 3), dtype=np.uint8)
        unchanged = downscale_image_if_needed(small_img, max_side=1200)
        self.assertEqual(unchanged.shape, (800, 600, 3))

if __name__ == "__main__":
    unittest.main()
