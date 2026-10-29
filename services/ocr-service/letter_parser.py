import io
import re
import datetime
from typing import List, Dict, Optional, Tuple, Any
import numpy as np
from PIL import Image
import cv2
import pypdfium2
import difflib

# Indonesian Month Name Map
INDONESIAN_MONTHS = {
    "januari": 1, "jan": 1,
    "februari": 2, "feb": 2, "pebruari": 2,
    "maret": 3, "mar": 3,
    "april": 4, "apr": 4,
    "mei": 5, "may": 5,
    "juni": 6, "jun": 6,
    "juli": 7, "jul": 7,
    "agustus": 8, "agt": 8, "agus": 8, "agu": 8,
    "september": 9, "sep": 9, "sept": 9,
    "oktober": 10, "okt": 10, "october": 10, "oct": 10,
    "november": 11, "nov": 11, "nopember": 11,
    "desember": 12, "des": 12, "december": 12, "dec": 12,
}

INDO_NUMBER_WORDS = {
    "satu": 1, "dua": 2, "tiga": 3, "empat": 4, "lima": 5,
    "enam": 6, "tujuh": 7, "delapan": 8, "sembilan": 9, "sepuluh": 10,
    "seminggu": 7
}

SAKIT_KEYWORDS = [
    "sakit", "demam", "panas", "flu", "batuk", "opname", "rawat", "dokter",
    "puskesmas", "pusing", "istirahat", "keseleo", "mual", "muntah", "cacar",
    "tifus", "tipes", "diare", "kurang enak badan", "kurang sehat", "kondisi fisik",
    "bedrest", "klinik", "kesehatan", "terbaring", "berobat", "diagnosa", "gejala",
    "anemia", "migrain", "radang", "cidera", "cedera", "luka", "terkilir", "ispa", "asma"
]

LEAVE_KEYWORDS = [
    "keperluan keluarga", "acara keluarga", "pernikahan", "menikah", "nikah",
    "pulang kampung", "mudik", "takziyah", "melayat", "lomba", "kepentingan keluarga",
    "kondangan", "khitanan", "sunatan", "umroh", "umrah", "haji", "bepergian",
    "ziarah", "urusan keluarga", "menghadiri", "tugas", "keperluan mendesak",
    "kepentingan mendesak", "urusan penting", "ada keperluan", "alasan keluarga"
]

NAME_PREFIX_PATTERNS = [
    r'^(?:nama\s*(?:siswa|peserta\s*didik|anak|murid)?|ananda|anak\s*kami|siswa|nama\s*lengkap)\s*[:=.\-]?\s*',
    r'^(?:yang\s+bernama|atas\s+nama)\s*[:=.\-]?\s*',
]

def preprocess_image_for_ocr(img_rgb: np.ndarray) -> np.ndarray:
    """
    Enhance contrast and clarity for handwriting and printed document recognition,
    especially effective for photos with shadows or uneven lighting.
    """
    try:
        lab = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
        cl = clahe.apply(l)
        limg = cv2.merge((cl, a, b))
        enhanced = cv2.cvtColor(limg, cv2.COLOR_LAB2RGB)
        return enhanced
    except Exception:
        return img_rgb

def clean_candidate_name(text: str) -> str:
    """Strip common label prefixes from line text before matching student name."""
    cleaned = text.strip()
    for pattern in NAME_PREFIX_PATTERNS:
        cleaned = re.sub(pattern, '', cleaned, flags=re.IGNORECASE).strip()
    # Remove leading/trailing non-alphanumeric except spaces
    cleaned = re.sub(r'^[^\w]+|[^\w]+$', '', cleaned).strip()
    return cleaned

def extract_candidate_name(raw_lines: List[str]) -> Optional[str]:
    """
    Extract raw student name candidate from letter text lines when roster matching
    yields no result or low confidence.
    """
    preferred_prefixes = [
        r'^(?:nama\s*(?:siswa|peserta\s*didik|anak|murid)|nama\s*lengkap|ananda|anak\s*kami)\s*[:=.\-]?\s*',
    ]
    general_prefixes = [
        r'^(?:nama|yang\s+bernama|atas\s+nama)\s*[:=.\-]?\s*',
    ]

    for line in raw_lines:
        for p in preferred_prefixes:
            if re.search(p, line, flags=re.IGNORECASE):
                cand = re.sub(p, '', line, flags=re.IGNORECASE).strip()
                cand = re.sub(r'[\(\[\{].*?[\)\]\}]', '', cand).strip()
                cand = re.sub(r'^[^\w]+|[^\w]+$', '', cand).strip()
                if 2 <= len(cand) <= 60 and not re.search(r'^(?:wali|orang\s*tua|guru|kepala|ibu|bapak)', cand, re.IGNORECASE):
                    return cand

    for line in raw_lines:
        for p in general_prefixes:
            if re.search(p, line, flags=re.IGNORECASE):
                cand = re.sub(p, '', line, flags=re.IGNORECASE).strip()
                cand = re.sub(r'[\(\[\{].*?[\)\]\}]', '', cand).strip()
                cand = re.sub(r'^[^\w]+|[^\w]+$', '', cand).strip()
                if 2 <= len(cand) <= 60 and not re.search(r'^(?:wali|orang\s*tua|guru|kepala|ibu|bapak)', cand, re.IGNORECASE):
                    return cand

    return None

def extract_class(text: str) -> Optional[str]:
    """
    Extract student class from letter text (e.g. '7A', 'VII-A', 'IX B', 'X MIPA 1').
    """
    patterns = [
        r'(?:wali\s+kelas|kelas|kls|ruang)\s*[:=.\-]?[ \t]*([0-9IXVLCDM]+(?:[ \t\-]?[A-Za-z0-9]+)*)',
    ]
    for p in patterns:
        for m in re.finditer(p, text, flags=re.IGNORECASE):
            cand = m.group(1).strip()
            cand = re.sub(r'^[^\w]+|[^\w]+$', '', cand).strip()
            if cand and 1 <= len(cand) <= 15:
                # Ensure candidate contains digits or Roman numerals
                if re.search(r'[0-9IXV]', cand, re.IGNORECASE):
                    return cand.upper()
    return None

def match_student(
    raw_lines: List[str],
    full_text: str,
    class_students: List[Dict[str, Any]]
) -> Optional[Dict[str, Any]]:
    """
    Fuzzy match student against the provided class student roster using
    NIS exact matching, token overlap, and Levenshtein/difflib similarity.
    """
    if not class_students:
        return None

    # First check NIS exact match
    for student in class_students:
        nis = str(student.get("nis") or "").strip()
        if nis and len(nis) >= 3:
            # Look for word boundary matching NIS digits
            if re.search(r'\b' + re.escape(nis) + r'\b', full_text):
                return {
                    "studentId": student["id"],
                    "studentName": student["name"],
                    "matchConfidence": 0.99
                }

    best_match: Optional[Dict[str, Any]] = None
    best_score = 0.0

    # Clean raw lines
    cleaned_lines = []
    for line in raw_lines:
        c = clean_candidate_name(line)
        if c:
            cleaned_lines.append(c)
        cleaned_lines.append(line.strip())

    for student in class_students:
        student_id = student.get("id")
        student_name = student.get("name", "").strip()
        if not student_name:
            continue

        target_name_lower = student_name.lower()
        target_tokens = target_name_lower.split()

        # Check candidate across all cleaned lines
        for line in cleaned_lines:
            line_lower = line.lower()

            # 1. Direct line similarity
            ratio = difflib.SequenceMatcher(None, target_name_lower, line_lower).ratio()
            if ratio > best_score:
                best_score = ratio
                best_match = {
                    "studentId": student_id,
                    "studentName": student_name,
                    "matchConfidence": round(ratio, 2)
                }

            # 2. Sliding window of words in the line matching the length of target tokens
            line_words = line_lower.split()
            target_len = len(target_tokens)
            if len(line_words) >= target_len:
                for i in range(len(line_words) - target_len + 1):
                    window = " ".join(line_words[i:i + target_len])
                    win_ratio = difflib.SequenceMatcher(None, target_name_lower, window).ratio()
                    if win_ratio > best_score:
                        best_score = win_ratio
                        best_match = {
                            "studentId": student_id,
                            "studentName": student_name,
                            "matchConfidence": round(win_ratio, 2)
                        }

                # Also test window + 1 word in case OCR joined or split tokens
                if len(line_words) >= target_len + 1:
                    for i in range(len(line_words) - target_len):
                        window = " ".join(line_words[i:i + target_len + 1])
                        win_ratio = difflib.SequenceMatcher(None, target_name_lower, window).ratio()
                        if win_ratio > best_score:
                            best_score = win_ratio
                            best_match = {
                                "studentId": student_id,
                                "studentName": student_name,
                                "matchConfidence": round(win_ratio, 2)
                            }

    # Match threshold: 0.65 for multi-word names, 0.78 for single-word names
    if best_match:
        target_name = best_match["studentName"]
        threshold = 0.78 if len(target_name.split()) == 1 else 0.65
        if best_score >= threshold:
            return best_match

    return None

def parse_indonesian_date(day_str: str, month_str: str, year_str: Optional[str] = None) -> Optional[datetime.date]:
    """Parse Indonesian day, month, year into datetime.date."""
    try:
        day_clean = re.sub(r'[oO]', '0', day_str.strip())
        day = int(day_clean)
        month_lower = month_str.lower().strip()
        month = INDONESIAN_MONTHS.get(month_lower)
        if not month:
            month_clean = re.sub(r'[oO]', '0', month_lower)
            if month_clean.isdigit():
                month = int(month_clean)
            else:
                return None

        if year_str:
            year_clean = re.sub(r'[oO]', '0', year_str.strip())
            year = int(year_clean)
            if year < 100:
                year += 2000
        else:
            year = datetime.date.today().year

        if 1 <= month <= 12 and 1 <= day <= 31:
            return datetime.date(year, month, day)
    except Exception:
        return None
    return None

BIRTH_DATE_KEYWORDS = [
    "lahir", "tgl lahir", "tanggal lahir", "tgl. lahir", "ttl",
    "tempat/tgl", "tempat / tanggal", "tempat/tanggal", "tempat, tgl", "tempat, tanggal",
    "tgl.lahir", "kelahiran", "usia", "umur"
]

def is_birth_context(text: str, match_start: int, match_end: int) -> bool:
    """Check if surrounding text indicates a birth date / TTL rather than absence date."""
    start_pos = max(0, match_start - 60)
    end_pos = min(len(text), match_end + 30)
    surrounding = text[start_pos:end_pos].lower()
    return any(k in surrounding for k in BIRTH_DATE_KEYWORDS)

def is_plausible_absence_year(dt: datetime.date) -> bool:
    """
    Ensure date belongs to the active or plausible academic year (within +/- 1 year of today).
    Rejects student birth dates (e.g. 2005-2015 when current year is 2026).
    """
    current_year = datetime.date.today().year
    return abs(dt.year - current_year) <= 1

def extract_dates(text: str) -> Dict[str, Any]:
    """
    Extract dates and date ranges from Indonesian letter text.
    Handles formats like:
      - '26 s/d 28 Oktober 2026'
      - '26 - 28 Oktober'
      - 'Senin, 26 Oktober s/d Rabu, 28 Oktober 2026'
      - '26/10/2026 - 28/10/2026'
      - '26 - 28/10/2026'
      - 'selama 3 (tiga) hari' with a start date
      - Single date: '26 Oktober 2026' or '26/10/2026'

    Strictly ignores birth dates (TTL) and non-plausible historical years.
    """
    result = {
        "startDate": "",
        "endDate": "",
        "isMultiDay": False
    }

    month_names_pattern = "|".join(re.escape(m) for m in INDONESIAN_MONTHS.keys())
    day_names_pattern = r'(?:\b(?:pada\s+hari\s+|hari\s+)?(?:senin|selasa|rabu|kamis|jumat|jum\'?at|sabtu|minggu)[,\s]+)?'
    sep_pattern = r'\s*(?:s\/?d|s\.d\.|sampai(?:\s+dengan)?|\-)\s*'

    # Check for duration: "selama (\d+) hari", "selama 3 (tiga) hari", "selama seminggu"
    duration_days = None
    duration_pattern = re.compile(
        r'selama\s+(?:(\d+)|(' + "|".join(INDO_NUMBER_WORDS.keys()) + r'))\s*(?:\([^\)]+\)\s*)?(?:hari|minggu)?',
        re.IGNORECASE
    )
    duration_match = duration_pattern.search(text)
    if duration_match:
        try:
            num = duration_match.group(1)
            word = duration_match.group(2)
            d = int(num) if num else INDO_NUMBER_WORDS.get(word.lower() if word else "", 1)
            if "minggu" in duration_match.group(0).lower() and num:
                d = d * 7
            if 1 <= d <= 30:
                duration_days = d
        except Exception:
            pass

    # Pattern 1: Range with shared month/year:
    # "26 s/d 28 Oktober 2026", "26 - 28 Oktober", "Senin, 26 s/d Rabu, 28 Oktober 2026"
    range_pattern_1 = re.compile(
        day_names_pattern + r'(\d{1,2})' + sep_pattern + day_names_pattern + r'(\d{1,2})\s+(' + month_names_pattern + r')(?:\s+(\d{2,4}))?',
        re.IGNORECASE
    )
    m1 = range_pattern_1.search(text)
    if m1 and not is_birth_context(text, m1.start(), m1.end()):
        d1, d2, month_name, year = m1.group(1), m1.group(2), m1.group(3), m1.group(4)
        date1 = parse_indonesian_date(d1, month_name, year)
        date2 = parse_indonesian_date(d2, month_name, year)
        if date1 and date2 and is_plausible_absence_year(date1) and is_plausible_absence_year(date2):
            if date1 <= date2:
                result["startDate"] = date1.isoformat()
                result["endDate"] = date2.isoformat()
                result["isMultiDay"] = (date1 != date2)
                return result
            else:
                result["startDate"] = date2.isoformat()
                result["endDate"] = date1.isoformat()
                result["isMultiDay"] = True
                return result

    # Pattern 2: Two Indonesian dates with months on both:
    # "26 Oktober s/d 28 Oktober", "26 Oktober 2026 s/d 28 Oktober 2026", "Senin, 26 Oktober s/d Rabu, 28 Oktober 2026"
    range_pattern_2 = re.compile(
        day_names_pattern + r'(\d{1,2})\s+(' + month_names_pattern + r')(?:\s+(\d{2,4}))?' + sep_pattern + day_names_pattern + r'(\d{1,2})\s+(' + month_names_pattern + r')(?:\s+(\d{2,4}))?',
        re.IGNORECASE
    )
    m2 = range_pattern_2.search(text)
    if m2 and not is_birth_context(text, m2.start(), m2.end()):
        d1, m_name1, y1, d2, m_name2, y2 = m2.group(1), m2.group(2), m2.group(3), m2.group(4), m2.group(5), m2.group(6)
        date1 = parse_indonesian_date(d1, m_name1, y1 or y2)
        date2 = parse_indonesian_date(d2, m_name2, y2 or y1)
        if date1 and date2 and is_plausible_absence_year(date1) and is_plausible_absence_year(date2):
            if date1 <= date2:
                result["startDate"] = date1.isoformat()
                result["endDate"] = date2.isoformat()
                result["isMultiDay"] = (date1 != date2)
                return result
            else:
                result["startDate"] = date2.isoformat()
                result["endDate"] = date1.isoformat()
                result["isMultiDay"] = True
                return result

    # Pattern 3: Shared month/year numeric range: "26 - 28/10/2026" or "26 s/d 28-10-2026"
    numeric_shared_range = re.compile(
        r'(\d{1,2})' + sep_pattern + r'(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})',
        re.IGNORECASE
    )
    m3s = numeric_shared_range.search(text)
    if m3s and not is_birth_context(text, m3s.start(), m3s.end()):
        d1, d2, mo, yr = m3s.group(1), m3s.group(2), m3s.group(3), m3s.group(4)
        date1 = parse_indonesian_date(d1, mo, yr)
        date2 = parse_indonesian_date(d2, mo, yr)
        if date1 and date2 and is_plausible_absence_year(date1) and is_plausible_absence_year(date2):
            if date1 <= date2:
                result["startDate"] = date1.isoformat()
                result["endDate"] = date2.isoformat()
                result["isMultiDay"] = (date1 != date2)
                return result
            else:
                result["startDate"] = date2.isoformat()
                result["endDate"] = date1.isoformat()
                result["isMultiDay"] = True
                return result

    # Pattern 4: Full numeric range: "26/10/2026 - 28/10/2026"
    numeric_range = re.compile(
        r'(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})' + sep_pattern + r'(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})',
        re.IGNORECASE
    )
    m4 = numeric_range.search(text)
    if m4 and not is_birth_context(text, m4.start(), m4.end()):
        d1, mo1, y1, d2, mo2, y2 = m4.group(1), m4.group(2), m4.group(3), m4.group(4), m4.group(5), m4.group(6)
        date1 = parse_indonesian_date(d1, mo1, y1)
        date2 = parse_indonesian_date(d2, mo2, y2)
        if date1 and date2 and is_plausible_absence_year(date1) and is_plausible_absence_year(date2):
            if date1 <= date2:
                result["startDate"] = date1.isoformat()
                result["endDate"] = date2.isoformat()
                result["isMultiDay"] = (date1 != date2)
                return result

    # Find all single dates with contextual weighting
    detected_dates = []

    # Single Indonesian date
    single_indo = re.compile(
        r'(?:pada\s+hari[^\d]+)?(\d{1,2})\s+(' + month_names_pattern + r')(?:\s+(\d{2,4}))?',
        re.IGNORECASE
    )
    for match in single_indo.finditer(text):
        if is_birth_context(text, match.start(), match.end()):
            continue
        d, m_name, y = match.group(1), match.group(2), match.group(3)
        dt = parse_indonesian_date(d, m_name, y)
        if dt and is_plausible_absence_year(dt):
            start_pos = max(0, match.start() - 50)
            end_pos = min(len(text), match.end() + 30)
            context = text[start_pos:end_pos].lower()
            weight = 5
            # Explicit absence keywords get high priority
            if any(k in context for k in ["tidak dapat", "tidak hadir", "tidak masuk", "berhalangan", "absen", "izin", "sakit", "istirahat", "mulai tanggal", "dari tanggal"]):
                weight += 20
            elif any(k in context for k in ["tanggal", "tgl", "pada"]):
                weight += 5
            # Letter signing / creation context (good fallback, lower weight than absence keywords)
            if any(k in context for k in ["hormat kami", "orang tua murid", "wali murid", "dokter", "pemeriksa", "jakarta,", "surabaya,", "bandung,", "malang,", "semarang,", "yogyakarta,", "medan,"]):
                weight += 2
            detected_dates.append((dt, weight))

    # Single numeric date: DD/MM/YYYY
    single_num = re.compile(r'\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b')
    for match in single_num.finditer(text):
        if is_birth_context(text, match.start(), match.end()):
            continue
        d, m_val, y = match.group(1), match.group(2), match.group(3)
        dt = parse_indonesian_date(d, m_val, y)
        if dt and is_plausible_absence_year(dt):
            start_pos = max(0, match.start() - 50)
            end_pos = min(len(text), match.end() + 30)
            context = text[start_pos:end_pos].lower()
            weight = 5
            if any(k in context for k in ["tidak dapat", "tidak hadir", "tidak masuk", "berhalangan", "absen", "izin", "sakit", "istirahat", "mulai tanggal", "dari tanggal"]):
                weight += 20
            elif any(k in context for k in ["tanggal", "tgl", "pada"]):
                weight += 5
            if any(k in context for k in ["hormat kami", "orang tua murid", "wali murid", "dokter", "pemeriksa", "jakarta,", "surabaya,", "bandung,", "malang,", "semarang,", "yogyakarta,", "medan,"]):
                weight += 2
            detected_dates.append((dt, weight))

    if detected_dates:
        # Sort by weight (highest first)
        detected_dates.sort(key=lambda x: x[1], reverse=True)
        primary_date = detected_dates[0][0]
        result["startDate"] = primary_date.isoformat()

        if duration_days and duration_days > 1:
            end_dt = primary_date + datetime.timedelta(days=duration_days - 1)
            result["endDate"] = end_dt.isoformat()
            result["isMultiDay"] = True
        else:
            result["endDate"] = primary_date.isoformat()
            result["isMultiDay"] = False
        return result

    # If only duration is found without any valid date, leave date empty for manual input
    if duration_days and duration_days > 1:
        result["isMultiDay"] = True

    return result

def classify_status_and_reason(text: str) -> Tuple[str, str]:
    """
    Classify attendance status ('Sakit' vs 'Izin') and extract explanation/reason.
    """
    text_lower = text.lower()

    # Extract reason first
    reason = ""

    # Conjunction patterns: "karena [reason]", "alasan: [reason]", "sedang [reason]"
    reason_patterns = [
        r'(?:karena|dikarenakan|disebabkan|alasan(?:\s*[:=])?|hal(?:\s*[:=])?|perihal(?:\s*[:=])?|dengan\s+alasan)\s+([^\.\n\r;]{3,80})',
        r'(?:sedang|mengalami)\s+([^\.\n\r;]{3,50})',
    ]

    for p in reason_patterns:
        m = re.search(p, text, flags=re.IGNORECASE)
        if m:
            cand = m.group(1).strip()
            # Clean up boilerplate filler words
            cand = re.sub(r'^(?:bahwa|anak\s+kami|siswa\s+tersebut|ananda)\s+', '', cand, flags=re.IGNORECASE).strip()
            cand = re.sub(r'[\(\)\[\]\{\}"\']+', '', cand).strip()
            cand = re.sub(r'^[^\w]+|[^\w]+$', '', cand).strip()
            if len(cand) >= 4:
                reason = cand
                break

    if not reason:
        # Check specific common Indonesian phrases
        common_reasons = [
            ("demam tinggi", "Demam tinggi"),
            ("panas dan demam", "Demam dan panas"),
            ("kontrol dokter", "Kontrol dokter"),
            ("rawat inap", "Rawat inap di rumah sakit"),
            ("opname", "Opname di rumah sakit"),
            ("istirahat dokter", "Istirahat dokter"),
            ("surat keterangan dokter", "Surat keterangan dokter"),
            ("acara keluarga", "Acara keluarga"),
            ("keperluan keluarga", "Keperluan keluarga"),
            ("pulang kampung", "Pulang kampung"),
            ("takziyah", "Takziyah keluarga"),
            ("melayat", "Melayat keluarga"),
            ("menikah", "Menghadiri acara pernikahan keluarga"),
            ("kondangan", "Menghadiri hajatan keluarga"),
            ("lomba", "Mengikuti kegiatan lomba"),
        ]
        for phrase, label in common_reasons:
            if phrase in text_lower:
                reason = label
                break

    # Check medical / sickness indicators
    has_medical_keywords = any(re.search(r'\b' + re.escape(kw) + r'\b', text_lower) for kw in SAKIT_KEYWORDS)
    is_caregiver = any(cg in text_lower for cg in ["menjenguk", "merawat orang tua", "menemani orang tua", "menjaga adik"])

    # Check leave keywords
    has_leave_keywords = any(re.search(r'\b' + re.escape(kw) + r'\b', text_lower) for kw in LEAVE_KEYWORDS)

    # Classify status
    if has_medical_keywords and not is_caregiver:
        status = "Sakit"
    elif has_leave_keywords or is_caregiver:
        status = "Izin"
    elif "sakit" in text_lower:
        status = "Sakit"
    else:
        status = "Izin"

    if not reason:
        reason = "Sakit / kondisi badan kurang sehat" if status == "Sakit" else "Keperluan izin keluarga"

    # Capitalize first character
    reason = reason[0].upper() + reason[1:] if reason else ""
    return status, reason

def detect_info_source(text: str) -> str:
    """Detect information source, defaulting to 'Orang tua'."""
    text_lower = text.lower()
    parent_indicators = ["orang tua", "orangtua", "wali murid", "wali siswa", "ibu", "bapak", "ayah", "bunda", "kami selaku orang tua"]
    if any(ind in text_lower for ind in parent_indicators):
        return "Orang tua"
    return "Orang tua"

def process_letter_bytes(
    file_bytes: bytes,
    filename: str,
    class_students: List[Dict[str, Any]],
    ocr_engine: Any
) -> Dict[str, Any]:
    """
    Main entry point for letter processing:
    1. Loads image or PDF pages.
    2. Runs contrast/clarity preprocessing.
    3. Executes PaddleOCR text extraction.
    4. Matches student against active class roster via fuzzy Levenshtein / sequence matching.
    5. Extracts student class (e.g. '7A', 'VII-A').
    6. Extracts dates (single or multi-day ranges).
    7. Classifies status ('Sakit' vs 'Izin') and identifies reason.
    8. Returns clean structured response.
    """
    is_pdf = filename.lower().endswith(".pdf") or file_bytes[:5] == b"%PDF-"
    raw_lines: List[str] = []

    if is_pdf:
        pdf = pypdfium2.PdfDocument(file_bytes)
        num_pages = min(len(pdf), 3) # Usually letters are 1-2 pages
        for p_idx in range(num_pages):
            page = pdf.get_page(p_idx)
            bitmap = page.render(scale=2.0)
            pil_img = bitmap.to_pil().convert("RGB")
            np_img = np.array(pil_img)
            enhanced = preprocess_image_for_ocr(np_img)

            ocr_res = ocr_engine.ocr(enhanced, cls=False)
            if ocr_res and ocr_res[0]:
                for box, (line_text, score) in ocr_res[0]:
                    if line_text and line_text.strip():
                        raw_lines.append(line_text.strip())
    else:
        pil_img = Image.open(io.BytesIO(file_bytes)).convert("RGB")
        np_img = np.array(pil_img)
        enhanced = preprocess_image_for_ocr(np_img)

        ocr_res = ocr_engine.ocr(enhanced, cls=False)
        if ocr_res and ocr_res[0]:
            for box, (line_text, score) in ocr_res[0]:
                if line_text and line_text.strip():
                    raw_lines.append(line_text.strip())

    full_text = "\n".join(raw_lines)

    # 1. Match student & candidate
    matched_student = match_student(raw_lines, full_text, class_students)
    candidate_name = extract_candidate_name(raw_lines)

    # 2. Extract class
    detected_class = extract_class(full_text)

    # 3. Extract dates
    date_info = extract_dates(full_text)

    # 4. Status & reason
    status, reason = classify_status_and_reason(full_text)

    # 5. Info source
    info_source = detect_info_source(full_text)

    return {
        "success": True,
        "filename": filename,
        "raw_text": full_text,
        "detected": {
            "studentId": matched_student["studentId"] if matched_student else None,
            "studentName": matched_student["studentName"] if matched_student else None,
            "candidateName": candidate_name,
            "className": detected_class,
            "matchConfidence": matched_student["matchConfidence"] if matched_student else 0.0,
            "status": status,
            "startDate": date_info["startDate"],
            "endDate": date_info["endDate"],
            "isMultiDay": date_info["isMultiDay"],
            "description": reason,
            "infoSource": info_source,
            "rawExtractedText": full_text
        }
    }
