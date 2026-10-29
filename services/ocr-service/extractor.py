import io
import re
from typing import List, Dict, Optional, Tuple, Any
import numpy as np
from PIL import Image
import pypdfium2

ROMAN_NUMERALS = {"II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"}

HEADER_ROW_PATTERNS = [
    r'pemerintah(?:an)?\s+(?:kabupaten|provinsi|kota|daerah)',
    r'dinas\s+pendidikan',
    r'kementerian\s+(?:pendidikan|agama)',
    r'kemendikbud|kemdikbud|kemenag',
    r'(?:sd|smp|sma|smk|madrasah|mi|mts|ma)\s+(?:negeri|swasta)',
    r'cabang\s+dinas|uptd|korwil',
    r'daftar\s+(?:nama|hadir|presensi|absensi|peserta|siswa|murid|nilai)',
    r'rekap(?:itulasi)?\s+(?:kehadiran|absensi|presensi|nilai|siswa)',
    r'tahun\s+(?:ajaran|pelajaran)',
    r'semester\s+(?:ganjil|genap|satu|dua|1|2)',
    r'kurikulum\s+merdeka',
    r'rombongan\s+belajar|rombel',
    r'bulan\s*:\s*[a-z]+',
]

SIGNATURE_ROW_PATTERNS = [
    r'mengetahui\b',
    r'kepala\s+sekolah\b',
    r'kepsek\b',
    r'wali\s+kelas\b',
    r'guru\s+(?:kelas|mapel|piket|pembimbing|mata\s+pelajaran)\b',
    r'tata\s+usaha\b',
    r'tanda\s+tangan|paraf\b',
    r'nip\.?\s*\d+',
    r'nuptk\.?\s*\d+',
    r'nik\.?\s*\d+',
    r'catatan\s+(?:guru|wali|piket)',
]

SUMMARY_ROW_PATTERNS = [
    r'\bjumlah\b|\btotal\b|\brata-rata\b|\brerata\b|\bpersentase\b|\bpersen\b',
    r'laki-laki\s*:\s*\d+|perempuan\s*:\s*\d+',
    r'\bl/p\s*:\s*\d+',
]

INSTITUTIONAL_KEYWORDS = {
    'dinas', 'kementerian', 'kemdikbud', 'kemenag', 'pemerintah', 'provinsi', 'kabupaten', 'kota',
    'sekolah', 'sd', 'sdn', 'smp', 'smpn', 'sma', 'sman', 'smk', 'smkn',
    'madrasah', 'mi', 'mts', 'ma', 'yayasan', 'uptd', 'korwil',
    'kurikulum', 'rapor', 'raport', 'dapodik', 'emis'
}

HEADER_TITLE_KEYWORDS = {
    'daftar', 'rekap', 'rekapitulasi', 'absensi', 'presensi', 'kehadiran', 'lembar',
    'formulir', 'semester', 'tahun ajaran', 'tahun pelajaran', 'tapel', 'tp.',
    'kelas', 'rombel', 'rombongan belajar', 'bulan', 'tanggal', 'hari', 'minggu'
}

SIGNATURE_FOOTER_KEYWORDS = {
    'mengetahui', 'kepala sekolah', 'kepsek', 'wali kelas', 'guru kelas', 'guru mapel',
    'guru piket', 'tata usaha', 'tu', 'pengawas', 'pembina', 'nip', 'nuptk', 'nik'
}

CELL_NOISE_EXACT = {
    'no', 'nomor', 'no.', 'nr', 'urut', 'no urut',
    'nama', 'nama siswa', 'nama lengkap', 'nama murid', 'peserta didik', 'student name', 'name',
    'nis', 'nisn', 'no induk', 'no. induk', 'nomor induk', 'id',
    'l/p', 'lp', 'jk', 'jenis kelamin', 'gender', 'lk', 'pr', 'l', 'p', 'laki-laki', 'perempuan', 'laki', 'pria', 'wanita',
    'hadir', 'ijin', 'izin', 'sakit', 'alpa', 'alpha', 's', 'i', 'a', 'h',
    'keterangan', 'ket', 'ket.', 'tanda tangan', 'ttd', 'paraf',
    'pindah', 'mutasi', 'keluar', 'lulus', 'beasiswa', 'kip', 'pip',
    'total', 'jumlah', 'persentase', 'persen', 'catatan', 'rata-rata', 'rerata',
    'halaman', 'page', 'siswa', 'murid'
}

ALL_FILTER_KEYWORDS = (
    INSTITUTIONAL_KEYWORDS |
    HEADER_TITLE_KEYWORDS |
    SIGNATURE_FOOTER_KEYWORDS |
    CELL_NOISE_EXACT
)

PREFIX_BLOCK_KEYWORDS = {
    'daftar', 'rekap', 'absensi', 'presensi', 'kehadiran', 'lembar', 'formulir',
    'kelas', 'rombel', 'semester', 'tahun', 'tapel', 'tp', 'bulan', 'tanggal', 'hari',
    'dinas', 'kementerian', 'kemendikbud', 'kemenag', 'pemerintah',
    'sekolah', 'sd', 'sdn', 'smp', 'smpn', 'sma', 'sman', 'smk', 'smkn',
    'madrasah', 'mi', 'mts', 'ma', 'yayasan',
    'wali', 'guru', 'kepala', 'mengetahui', 'nip', 'nuptk',
    'total', 'jumlah', 'catatan', 'keterangan', 'ket', 'tanda tangan', 'ttd', 'paraf',
    'laki-laki', 'perempuan', 'halaman'
}

def to_title_case(text: str) -> str:
    """Format Indonesian names cleanly in Title Case while preserving initials, dots, and apostrophes."""
    if not text:
        return ""
    words = text.strip().split()
    formatted = []
    for w in words:
        clean = w.strip()
        if clean.upper() in ROMAN_NUMERALS:
            formatted.append(clean.upper())
        elif "." in clean:
            parts = clean.split(".")
            formatted.append(".".join(p.capitalize() for p in parts))
        elif "-" in clean:
            parts = clean.split("-")
            formatted.append("-".join(p.capitalize() for p in parts))
        else:
            formatted.append(clean.capitalize())
    return " ".join(formatted)

def is_noise_text(text: str) -> bool:
    """Check if a word, phrase, or line represents form boilerplate or noise rather than a student name."""
    if not text:
        return True
    lower = text.lower().strip()
    clean_lower = re.sub(r'[^a-z0-9\s]', ' ', lower).strip()
    tokens = clean_lower.split()

    if not tokens:
        return True

    # Exact match with blacklist
    if lower in ALL_FILTER_KEYWORDS or clean_lower in ALL_FILTER_KEYWORDS:
        return True

    # Check prefix block
    for p in PREFIX_BLOCK_KEYWORDS:
        if lower.startswith(p + ' ') or lower.startswith(p + ':') or lower.startswith(p + ' :') or lower.startswith(p + '.'):
            return True

    # Check if text contains institutional phrases
    strong_phrases = [
        'dinas pendidikan', 'kementerian agama', 'pemerintah kabupaten', 'pemerintah provinsi',
        'pemerintah kota', 'kepala sekolah', 'wali kelas', 'guru kelas', 'tahun ajaran',
        'tahun pelajaran', 'daftar hadir', 'daftar presensi', 'daftar siswa', 'peserta didik',
        'tanda tangan', 'rekapitulasi', 'kurikulum merdeka'
    ]
    if any(sp in lower for sp in strong_phrases):
        return True

    # Check token overlap
    matching_tokens = sum(1 for t in tokens if t in ALL_FILTER_KEYWORDS)
    if len(tokens) >= 2 and (matching_tokens / len(tokens)) >= 0.5:
        return True

    return False

def clean_student_name(raw: str) -> Optional[str]:
    """Clean and validate student name, stripping row numbers, noise, and invalid characters."""
    if not raw or not isinstance(raw, str):
        return None

    # Strip leading numbering patterns: "No. 1", "No 1", "1.", "01)", "1 -", "(1)", "1 ", etc.
    s = re.sub(r'^(?:(?:no\.?|nr\.?|nomor)\s*)?(?:\(?\d+\)?[\.\)\-\:\;\s]+)+', '', raw.strip(), flags=re.IGNORECASE)
    # Strip any leading numbers without dots if followed by letters
    s = re.sub(r'^\d+\s*', '', s)
    # Strip surrounding brackets/quotes/punctuations
    s = s.strip(" \t\r\n-_|/\\\"'()[]{}:;,")
    if s.endswith('.'):
        if not re.search(r'\b[A-Za-z]\.$', s):
            s = re.sub(r'\.+$', '', s).strip()

    # Check if empty or too short
    if len(s) < 2:
        return None

    # If it's pure numbers, it's not a name
    if re.match(r'^\d+$', s):
        return None

    # Check if noise
    if is_noise_text(s):
        return None

    # Check if text is just noise like "I S A" or single letters
    letters = re.findall(r'[a-zA-Z]', s)
    if len(letters) < 2:
        return None

    # Must contain at least one vowel
    if not re.search(r'[aiueoAIUEO]', s):
        return None

    return to_title_case(s)

def clean_nis(raw: str) -> Optional[str]:
    """Extract standard NIS (4-10 digits) or NISN (10 digits) using lookarounds."""
    if not raw or not isinstance(raw, str):
        return None
    match = re.search(r'(?<!\d)(\d{4,10})(?!\d)', raw.strip())
    if match:
        return match.group(1)
    return None

def is_header_or_footer_row(combined_row: str) -> bool:
    """Determine whether a grouped line represents a table title, column header, footer, or summary row."""
    lower = combined_row.lower().strip()

    # Check institutional headers
    if any(re.search(pat, lower) for pat in HEADER_ROW_PATTERNS):
        return True

    # Check column header row
    has_no = bool(re.search(r'\b(?:no|nomor|no\.)\b', lower))
    has_name_or_nis = bool(re.search(r'\b(?:nama|nis|nisn|peserta)\b', lower))
    if has_no and has_name_or_nis:
        return True

    # Check signature / footer
    if any(re.search(pat, lower) for pat in SIGNATURE_ROW_PATTERNS):
        return True

    # Check summary row
    if any(re.search(pat, lower) for pat in SUMMARY_ROW_PATTERNS):
        return True

    return False

def extract_students_from_ocr_boxes(ocr_results: List) -> List[Dict[str, Optional[str]]]:
    """
    Coordinate-aware parser:
    Groups text boxes by Y position into horizontal rows, then detects NIS and Name.
    Filters out institutional headers, column headers, signature blocks, and summary rows.
    """
    if not ocr_results:
        return []

    items = []
    # PaddleOCR result structure: list of pages/lines: [ [ [box, (text, score)], ... ] ]
    raw_lines = ocr_results[0] if len(ocr_results) > 0 and isinstance(ocr_results[0], list) and (len(ocr_results[0]) == 0 or isinstance(ocr_results[0][0], list)) else ocr_results

    for entry in raw_lines:
        if not entry or len(entry) < 2:
            continue
        box = entry[0]
        text_info = entry[1]
        if not text_info or not isinstance(text_info, (tuple, list)):
            continue
        text = str(text_info[0]).strip()
        score = float(text_info[1]) if len(text_info) > 1 else 1.0

        if score < 0.4 or not text:
            continue

        try:
            xs = [p[0] for p in box]
            ys = [p[1] for p in box]
            min_x, max_x = min(xs), max(xs)
            min_y, max_y = min(ys), max(ys)
            y_center = (min_y + max_y) / 2.0
            height = max_y - min_y
            items.append({
                "text": text,
                "min_x": min_x,
                "max_x": max_x,
                "y_center": y_center,
                "height": height,
                "score": score
            })
        except Exception:
            continue

    if not items:
        return []

    # Sort items vertically by Y center
    items.sort(key=lambda it: it["y_center"])

    # Line clustering threshold based on median item height
    avg_height = float(np.median([it["height"] for it in items])) if items else 20.0
    line_threshold = max(12.0, avg_height * 0.6)

    # Group boxes into horizontal lines
    lines: List[List[Dict[str, Any]]] = []
    current_line: List[Dict[str, Any]] = []
    current_y = -1.0

    for it in items:
        if current_y < 0:
            current_line.append(it)
            current_y = it["y_center"]
        elif abs(it["y_center"] - current_y) <= line_threshold:
            current_line.append(it)
            current_y = float(np.mean([x["y_center"] for x in current_line]))
        else:
            lines.append(sorted(current_line, key=lambda x: x["min_x"]))
            current_line = [it]
            current_y = it["y_center"]

    if current_line:
        lines.append(sorted(current_line, key=lambda x: x["min_x"]))

    students: List[Dict[str, Optional[str]]] = []

    for line in lines:
        row_text_list = [x["text"] for x in line]
        combined_row_text = " ".join(row_text_list).strip()

        # Check if entire row is a header, footer, or summary row
        if is_header_or_footer_row(combined_row_text):
            continue

        nis: Optional[str] = None
        name_candidates: List[str] = []

        for item in line:
            t = item["text"].strip()

            # Check if this item is a NIS or contains a NIS
            cand_nis = clean_nis(t)
            if cand_nis:
                if not nis:
                    nis = cand_nis
                # Remove NIS digits from candidate text so remaining letters become name
                t = t.replace(cand_nis, " ").strip()

            # Check if remaining text is purely a row number like "1.", "2", "3)", "(1)"
            if re.match(r'^\(?\d+\)?[\.\)]?$', t):
                continue

            # Candidate for name
            c_name = clean_student_name(t)
            if c_name:
                name_candidates.append(c_name)

        if name_candidates:
            full_name = " ".join(name_candidates)
            full_name = clean_student_name(full_name)
            if full_name and len(full_name) >= 3:
                students.append({"name": full_name, "nis": nis or None})

    return students

def deduplicate_students(students: List[Dict[str, Optional[str]]]) -> List[Dict[str, Optional[str]]]:
    """Deduplicate students list while preserving order."""
    seen = set()
    result = []
    for s in students:
        name = s.get("name") or ""
        nis = s.get("nis") or ""
        key = name.strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        result.append({"name": name, "nis": nis or None})
    return result

def process_document_bytes(
    file_bytes: bytes,
    filename: str,
    ocr_engine: Any
) -> Dict[str, Any]:
    """
    Main entry point: processes an image or multi-page PDF bytes,
    runs PaddleOCR inference, extracts, cleans, and deduplicates student data.
    """
    is_pdf = filename.lower().endswith(".pdf") or file_bytes[:5] == b"%PDF-"
    all_students: List[Dict[str, Optional[str]]] = []
    pages_processed = 0

    if is_pdf:
        pdf = pypdfium2.PdfDocument(file_bytes)
        pages_processed = len(pdf)

        for page_idx in range(pages_processed):
            page = pdf.get_page(page_idx)
            # Render at 2.0 scale (~150-200 DPI) for optimal OCR accuracy
            bitmap = page.render(scale=2.0)
            pil_img = bitmap.to_pil().convert("RGB")
            np_img = np.array(pil_img)

            ocr_res = ocr_engine.ocr(np_img, cls=False)
            page_students = extract_students_from_ocr_boxes(ocr_res)
            all_students.extend(page_students)
    else:
        pages_processed = 1
        pil_img = Image.open(io.BytesIO(file_bytes)).convert("RGB")
        np_img = np.array(pil_img)

        ocr_res = ocr_engine.ocr(np_img, cls=False)
        all_students = extract_students_from_ocr_boxes(ocr_res)

    deduped = deduplicate_students(all_students)

    return {
        "success": True,
        "filename": filename,
        "pages_processed": pages_processed,
        "total_students": len(deduped),
        "students": deduped
    }
