#!/usr/bin/env python3
"""
generate-extreme-samples.py
Generates 5 realistic extreme handwriting & document test fixtures for E2E testing of AI & OCR:
1. extreme_letter_cursive.png - Skewed, cursive handwriting with lined paper, ink variation, shadow
2. extreme_letter_faint_pencil.png - Faint 2B pencil, low contrast, texture noise, grain
3. extreme_letter_struck_correction.png - Scratched out / crossed out wrong date with valid correction
4. extreme_table_multiletter.png - Tabletop with 2 separate letters scattered at different angles
5. extreme_roster_handwritten.png - Handwritten student roster table with No, NIS, and Student Name
"""

import os
import math
import random
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps, ImageChops

OUTPUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "e2e", "fixtures"))
os.makedirs(OUTPUT_DIR, exist_ok=True)

def get_font(size=28, bold=False):
    font_candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
    ]
    if bold:
        font_candidates = [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
            "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
        ] + font_candidates

    for path in font_candidates:
        if os.path.isfile(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                pass
    return ImageFont.load_default()

def create_lined_paper(width, height, line_spacing=48, line_color=(190, 210, 230), bg_color=(250, 248, 242)):
    img = Image.new("RGB", (width, height), bg_color)
    draw = ImageDraw.Draw(img)
    
    # Red left margin line
    margin_x = int(width * 0.12)
    draw.line([(margin_x, 0), (margin_x, height)], fill=(235, 175, 175), width=2)
    
    # Horizontal ruled lines
    for y in range(80, height - 40, line_spacing):
        draw.line([(0, y), (width, y)], fill=line_color, width=1)
        
    return img

def apply_perspective_and_shadow(img, angle=0, shadow_intensity=0.15):
    # Add subtle paper crease/lighting gradient
    w, h = img.size
    gradient = Image.new('L', (w, h), 0)
    g_draw = ImageDraw.Draw(gradient)
    for y in range(h):
        # Diagonal shadow
        val = int(255 * (1.0 - shadow_intensity * (y / h + 0.3 * math.sin(y / 40.0))))
        val = max(180, min(255, val))
        g_draw.line([(0, y), (w, y)], fill=val)
    
    # Blend with gradient
    gray_3ch = Image.merge("RGB", (gradient, gradient, gradient))
    img = ImageChops.multiply(img, gray_3ch)

    if angle != 0:
        img = img.rotate(angle, resample=Image.BICUBIC, expand=True, fillcolor=(235, 230, 220))
        
    return img

def draw_skewed_handwriting_line(draw, text, x, y, font, fill=(20, 30, 110), angle_range=(-1.5, 1.5), jitter=True):
    """Draws words with character/word-level baseline jitter to mimic authentic handwriting."""
    words = text.split(" ")
    cur_x = x
    for w in words:
        y_offset = random.uniform(-2.0, 2.0) if jitter else 0.0
        draw.text((cur_x, y + y_offset), w, font=font, fill=fill)
        bbox = font.getbbox(w)
        w_width = (bbox[2] - bbox[0]) if bbox else len(w) * 16
        cur_x += w_width + random.randint(10, 16)

# -------------------------------------------------------------
# 1. extreme_letter_cursive.png
# -------------------------------------------------------------
def generate_sample_cursive():
    w, h = 1000, 1400
    paper = create_lined_paper(w, h, line_spacing=46, bg_color=(252, 250, 245))
    draw = ImageDraw.Draw(paper)
    
    title_font = get_font(size=26, bold=True)
    body_font = get_font(size=24, bold=False)
    sig_font = get_font(size=26, bold=True)
    
    # Dark blue ballpoint pen
    pen_color = (25, 45, 125)
    
    lines = [
        ("Yogyakarta, 28 Oktober 2026", 550, 120),
        ("Kepada Yth.", 140, 210),
        ("Bapak/Ibu Wali Kelas XII TKJ 2", 140, 256),
        ("di Tempat", 140, 302),
        ("", 140, 348),
        ("Dengan hormat,", 140, 394),
        ("Saya selaku orang tua dari siswa:", 140, 440),
        ("Nama  : Adrian Manuel Hartono", 180, 532),
        ("Kelas : XII TKJ 2", 180, 578),
        ("NIS   : 9021", 180, 624),
        ("", 140, 670),
        ("Memberitahukan bahwa anak kami tidak dapat hadir ke", 140, 716),
        ("sekolah pada tanggal 28 Oktober 2026 s/d 30 Oktober 2026", 140, 762),
        ("karena Sakit demam tinggi dan flu.", 140, 808),
        ("Demikian surat ini kami buat dengan sebenarnya.", 140, 898),
        ("Atas izin Bapak/Ibu guru kami ucapkan terima kasih.", 140, 944),
        ("", 140, 990),
        ("Hormat kami,", 600, 1080),
        ("Orang tua siswa,", 600, 1126),
        ("", 600, 1172),
        ("( Hartono )", 600, 1262),
    ]
    
    for text, x, y in lines:
        if text:
            is_bold = "Nama" in text or "Adrian" in text or "Hartono" in text or "Yogyakarta" in text
            f = title_font if is_bold else body_font
            draw_skewed_handwriting_line(draw, text, x, y, f, fill=pen_color)
            
    # Add authentic cursive signature scribble above "( Hartono )"
    draw.line([(620, 1220), (640, 1180), (670, 1240), (710, 1190), (750, 1230), (790, 1210)], fill=pen_color, width=2)

    # Slight rotation and lighting crease
    final_img = apply_perspective_and_shadow(paper, angle=-1.2, shadow_intensity=0.18)
    out_path = os.path.join(OUTPUT_DIR, "extreme_letter_cursive.png")
    final_img.save(out_path, quality=95)
    print(f"[Generated] {out_path} ({final_img.size})")

# -------------------------------------------------------------
# 2. extreme_letter_faint_pencil.png
# -------------------------------------------------------------
def generate_sample_faint_pencil():
    w, h = 950, 1350
    # Dirty rough paper background
    paper = Image.new("RGB", (w, h), (242, 239, 233))
    draw = ImageDraw.Draw(paper)
    
    # Add paper grain noise
    arr = np.array(paper, dtype=np.int16)
    noise = np.random.normal(0, 7, arr.shape)
    arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
    paper = Image.fromarray(arr)
    draw = ImageDraw.Draw(paper)
    
    # Faint 2B pencil gray color (low contrast)
    pencil_color = (120, 120, 125)
    font = get_font(size=23, bold=False)
    title_font = get_font(size=24, bold=True)
    
    lines = [
        ("Surat Permohonan Izin", 320, 130),
        ("Kepada Yth. Wali Kelas XII TKJ 2", 120, 230),
        ("di Sekolah", 120, 275),
        ("Dengan hormat,", 120, 360),
        ("Saya yang bertanda tangan di bawah ini:", 120, 410),
        ("Nama Siswa : Angelina Thenaya", 160, 490),
        ("Kelas      : XII TKJ 2", 160, 535),
        ("Memberitahukan bahwa anak kami memohon Izin tidak", 120, 620),
        ("masuk sekolah pada tanggal 29 Oktober 2026 dikarenakan", 120, 665),
        ("keperluan keluarga penting ke luar kota.", 120, 710),
        ("Demikian permohonan ini kami sampaikan.", 120, 795),
        ("Terima kasih atas perhatiannya.", 120, 840),
        ("Hormat saya,", 580, 960),
        ("( Thenaya )", 580, 1080),
    ]
    
    for text, x, y in lines:
        f = title_font if ("Surat" in text or "Angelina Thenaya" in text) else font
        draw_skewed_handwriting_line(draw, text, x, y, f, fill=pencil_color, jitter=True)

    # Pencil signature
    draw.line([(600, 1030), (620, 1000), (660, 1050), (700, 1010), (740, 1040)], fill=pencil_color, width=1)
    
    # Slight blur to mimic camera softness & lighting gradient
    paper = paper.filter(ImageFilter.GaussianBlur(radius=0.4))
    final_img = apply_perspective_and_shadow(paper, angle=0.8, shadow_intensity=0.22)
    out_path = os.path.join(OUTPUT_DIR, "extreme_letter_faint_pencil.png")
    final_img.save(out_path, quality=90)
    print(f"[Generated] {out_path} ({final_img.size})")

# -------------------------------------------------------------
# 3. extreme_letter_struck_correction.png
# -------------------------------------------------------------
def generate_sample_struck_correction():
    w, h = 1000, 1400
    paper = create_lined_paper(w, h, line_spacing=48, bg_color=(253, 252, 248))
    draw = ImageDraw.Draw(paper)
    
    font = get_font(size=25, bold=False)
    bold_font = get_font(size=26, bold=True)
    pen_color = (20, 30, 90)
    
    # Letter with struck-through incorrect dates and status
    draw_skewed_handwriting_line(draw, "Bantul, 29 Oktober 2026", 560, 110, font, fill=pen_color)
    draw_skewed_handwriting_line(draw, "Kepada Yth. Wali Kelas XII TKJ 2", 130, 200, bold_font, fill=pen_color)
    draw_skewed_handwriting_line(draw, "Dengan ini kami orang tua memberitahukan:", 130, 300, font, fill=pen_color)
    draw_skewed_handwriting_line(draw, "Nama  : Alfeus Efata Imanuel", 170, 380, bold_font, fill=pen_color)
    draw_skewed_handwriting_line(draw, "Kelas : XII TKJ 2", 170, 430, font, fill=pen_color)
    
    # Struck out reason
    draw_skewed_handwriting_line(draw, "Status : Izin acara santai", 170, 520, font, fill=(130, 130, 130))
    # Scratch-out lines over "Izin acara santai"
    draw.line([(260, 535), (490, 535)], fill=(180, 20, 20), width=3)
    draw.line([(260, 538), (490, 532)], fill=(180, 20, 20), width=2)
    
    # Corrected status handwritten above
    draw_skewed_handwriting_line(draw, "-> SAKIT demam", 510, 515, bold_font, fill=(180, 20, 20))
    
    # Struck out date
    draw_skewed_handwriting_line(draw, "Tanggal : 2026-10-25 s/d 2026-10-26", 170, 610, font, fill=(130, 130, 130))
    draw.line([(270, 625), (650, 625)], fill=(180, 20, 20), width=3)
    draw.line([(270, 628), (650, 622)], fill=(180, 20, 20), width=2)
    
    # Valid corrected date
    draw_skewed_handwriting_line(draw, "Koreksi: 29 Oktober 2026 s/d 31 Oktober 2026", 170, 690, bold_font, fill=pen_color)
    draw_skewed_handwriting_line(draw, "Alasan: Sakit rawat jalan di rumah.", 170, 770, font, fill=pen_color)
    draw_skewed_handwriting_line(draw, "Mohon Bapak/Ibu memberikan izin dispensasi.", 130, 860, font, fill=pen_color)
    draw_skewed_handwriting_line(draw, "Hormat kami,", 600, 980, font, fill=pen_color)
    draw_skewed_handwriting_line(draw, "( Orang Tua Imanuel )", 560, 1120, bold_font, fill=pen_color)
    
    # Strikethrough scribble
    draw.line([(580, 1060), (640, 1020), (700, 1080), (760, 1030)], fill=pen_color, width=2)

    final_img = apply_perspective_and_shadow(paper, angle=-1.5, shadow_intensity=0.15)
    out_path = os.path.join(OUTPUT_DIR, "extreme_letter_struck_correction.png")
    final_img.save(out_path, quality=95)
    print(f"[Generated] {out_path} ({final_img.size})")

# -------------------------------------------------------------
# 4. extreme_table_multiletter.png
# -------------------------------------------------------------
def generate_sample_table_multiletter():
    # Table surface: simulated wood / desk background
    tw, th = 1600, 1200
    table = Image.new("RGB", (tw, th), (165, 130, 95))
    t_draw = ImageDraw.Draw(table)
    
    # Wood grain lines
    for y in range(0, th, 12):
        shade = random.randint(145, 175)
        t_draw.line([(0, y), (tw, y)], fill=(shade, shade - 30, shade - 65), width=2)

    # Letter 1: Christian Felix Sutanto (Left Letter)
    l1_w, l1_h = 620, 850
    letter1 = Image.new("RGB", (l1_w, l1_h), (252, 250, 244))
    d1 = ImageDraw.Draw(letter1)
    f1 = get_font(size=21, bold=False)
    fb1 = get_font(size=23, bold=True)
    
    d1.rectangle([(15, 15), (l1_w - 15, l1_h - 15)], outline=(220, 220, 220), width=1)
    draw_skewed_handwriting_line(d1, "Surat Izin Sakit", 200, 60, fb1, fill=(20, 30, 120))
    draw_skewed_handwriting_line(d1, "Kepada Wali Kelas XII TKJ 2", 50, 140, f1, fill=(20, 30, 120))
    draw_skewed_handwriting_line(d1, "Nama  : Christian Felix Sutanto", 60, 230, fb1, fill=(20, 30, 120))
    draw_skewed_handwriting_line(d1, "Kelas : XII TKJ 2", 60, 280, f1, fill=(20, 30, 120))
    draw_skewed_handwriting_line(d1, "Keterangan: Sakit panas demam", 60, 360, f1, fill=(20, 30, 120))
    draw_skewed_handwriting_line(d1, "Tanggal: 28 Oktober 2026", 60, 420, fb1, fill=(20, 30, 120))
    draw_skewed_handwriting_line(d1, "Hormat kami,", 350, 560, f1, fill=(20, 30, 120))
    draw_skewed_handwriting_line(d1, "( Sutanto )", 350, 680, fb1, fill=(20, 30, 120))
    d1.line([(370, 630), (410, 600), (460, 650)], fill=(20, 30, 120), width=2)
    
    # Letter 2: Davin Immanuel Abraham (Right Letter)
    l2_w, l2_h = 620, 850
    letter2 = Image.new("RGB", (l2_w, l2_h), (250, 252, 246))
    d2 = ImageDraw.Draw(letter2)
    f2 = get_font(size=21, bold=False)
    fb2 = get_font(size=23, bold=True)
    
    d2.rectangle([(15, 15), (l2_w - 15, l2_h - 15)], outline=(220, 220, 220), width=1)
    draw_skewed_handwriting_line(d2, "Surat Izin Ketidakhadiran", 160, 60, fb2, fill=(10, 10, 15))
    draw_skewed_handwriting_line(d2, "Yth. Guru Wali Kelas XII TKJ 2", 50, 140, f2, fill=(10, 10, 15))
    draw_skewed_handwriting_line(d2, "Nama  : Davin Immanuel Abraham", 60, 230, fb2, fill=(10, 10, 15))
    draw_skewed_handwriting_line(d2, "Kelas : XII TKJ 2", 60, 280, f2, fill=(10, 10, 15))
    draw_skewed_handwriting_line(d2, "Status: Izin keperluan keluarga", 60, 360, fb2, fill=(10, 10, 15))
    draw_skewed_handwriting_line(d2, "Tgl   : 29 Oktober 2026 s/d 30 Oktober 2026", 60, 420, fb2, fill=(10, 10, 15))
    draw_skewed_handwriting_line(d2, "Orang Tua Siswa,", 350, 560, f2, fill=(10, 10, 15))
    draw_skewed_handwriting_line(d2, "( Abraham )", 350, 680, fb2, fill=(10, 10, 15))
    d2.line([(370, 630), (410, 595), (470, 645)], fill=(10, 10, 15), width=2)
    
    # Rotate and paste letters on desk
    rot_letter1 = letter1.rotate(6, resample=Image.BICUBIC, expand=True)
    rot_letter2 = letter2.rotate(-7, resample=Image.BICUBIC, expand=True)
    
    # Paste on tabletop
    table.paste(rot_letter1, (100, 150))
    table.paste(rot_letter2, (830, 160))

    out_path = os.path.join(OUTPUT_DIR, "extreme_table_multiletter.png")
    table.save(out_path, quality=95)
    print(f"[Generated] {out_path} ({table.size})")

# -------------------------------------------------------------
# 5. extreme_roster_handwritten.png
# -------------------------------------------------------------
def generate_sample_roster_handwritten():
    w, h = 1100, 1500
    paper = Image.new("RGB", (w, h), (252, 250, 246))
    draw = ImageDraw.Draw(paper)
    
    title_font = get_font(size=28, bold=True)
    head_font = get_font(size=22, bold=True)
    cell_font = get_font(size=21, bold=False)
    
    draw.text((280, 80), "DAFTAR SISWA KELAS XII TKJ 2", font=title_font, fill=(20, 20, 30))
    draw.text((360, 125), "TAHUN AJARAN 2026/2027", font=head_font, fill=(70, 70, 80))
    
    # Table headers
    start_y = 210
    row_height = 80
    col_x = [80, 180, 380, 1020]  # No, NIS, Nama Siswa
    
    # Outer box
    draw.rectangle([(col_x[0], start_y), (col_x[-1], start_y + row_height * 7)], outline=(60, 60, 70), width=2)
    
    # Header row
    draw.line([(col_x[0], start_y + row_height), (col_x[-1], start_y + row_height)], fill=(60, 60, 70), width=2)
    draw.text((col_x[0] + 25, start_y + 25), "NO", font=head_font, fill=(20, 20, 30))
    draw.text((col_x[1] + 55, start_y + 25), "NIS", font=head_font, fill=(20, 20, 30))
    draw.text((col_x[2] + 160, start_y + 25), "NAMA SISWA LENGKAP", font=head_font, fill=(20, 20, 30))
    
    # Column vertical separators
    for x in col_x[1:-1]:
        draw.line([(x, start_y), (x, start_y + row_height * 7)], fill=(80, 80, 90), width=2)
        
    students_data = [
        ("1", "9011", "Adrian Manuel Hartono"),
        ("2", "9012", "Alfeus Efata Imanuel"),
        ("3", "9013", "Angelina Thenaya"),
        ("4", "9014", "Christian Felix Sutanto"),
        ("5", "9015", "Davin Immanuel Abraham"),
        ("6", "9016", "Gabriel Patricio Habel"),
    ]
    
    pen_colors = [(25, 45, 125), (10, 10, 15), (20, 30, 110), (15, 15, 20), (30, 40, 120), (10, 10, 10)]
    
    for idx, (no, nis, name) in enumerate(students_data):
        y = start_y + row_height * (idx + 1)
        # Horizontal row line
        draw.line([(col_x[0], y), (col_x[-1], y)], fill=(120, 120, 130), width=1)
        
        pen = pen_colors[idx % len(pen_colors)]
        draw_skewed_handwriting_line(draw, no, col_x[0] + 30, y + 25, cell_font, fill=pen)
        draw_skewed_handwriting_line(draw, nis, col_x[1] + 45, y + 25, cell_font, fill=pen)
        draw_skewed_handwriting_line(draw, name, col_x[2] + 40, y + 25, cell_font, fill=pen)

    final_img = apply_perspective_and_shadow(paper, angle=0.5, shadow_intensity=0.15)
    out_path = os.path.join(OUTPUT_DIR, "extreme_roster_handwritten.png")
    final_img.save(out_path, quality=95)
    print(f"[Generated] {out_path} ({final_img.size})")

if __name__ == "__main__":
    print("Generating extreme handwriting test fixtures...")
    generate_sample_cursive()
    generate_sample_faint_pencil()
    generate_sample_struck_correction()
    generate_sample_table_multiletter()
    generate_sample_roster_handwritten()
    print("All extreme sample fixtures successfully generated in:", OUTPUT_DIR)
