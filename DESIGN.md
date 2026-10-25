# DESIGN.md: Sistem Surat Izin & Ketidakhadiran Siswa

## 1. Visual Direction & Identity

- **Design Read**: Reading this as: school attendance & permission archive web app for homeroom teachers (Wali Kelas) and parents (Wali Murid), in a **Warm Terracotta & Slate (Soft Editorial Journal)** style, dial ENERGY 2 / RHYTHM 2 / MOTION 1.
- **Three Dials**:
  - `ENERGY: 2 (Balanced)`: Tactile linen paper tones and warm terracotta accents convey a friendly, welcoming, human editorial feel without cold administrative stiffness or rigid chalkboard green.
  - `RHYTHM: 2 (Consistent with intentional breaks)`: Gentle rounded cards (`rounded-2xl`), subtle indicator badges, natural sentence-case headers, and clean structural separation between attendance tables, monthly analytics, and the 100% attendance appreciation board.
  - `MOTION: 1 (Calm / Functional)`: Smooth state transitions, upload compression feedback, and modal open/close without distracting looping animations.

---

## 2. One-Line Visual Decision Log (Rule R-31)

- **Palette (Warm Terracotta & Slate)**: Completely eliminates cold chalkboard emerald green (`#1F6F54`). Uses Warm Terracotta (`#B54826`, hover `#96391C`, light `#FCEEE9`) as the primary brand color, paired with Soft Slate Navy (`#264663`) and Warm Linen Paper (`#FBF7F2`, subtle `#F3ECE2`).
- **Dark Mode (Warm Espresso & Slate Night)**: Canvas (`#181514`), surface (`#26211F`), elevated surface (`#302926`), border (`#3D3531`), ink (`#F5EFEA`), and warm terracotta (`#B54826`, hover `#96391C`).
- **Semantic Badges**:
  - Izin: Soft Slate Blue (`#1E4363`, bg `#EBF2F7`, border `#C5D9E8`)
  - Sakit: Warm Amber / Ochre (`#8A4D0E`, bg `#FEF4E6`, border `#F5D6A7`)
  - Alpa: Warm Crimson / Rose (`#962326`, bg `#FCECEB`, border `#F5C2C0`)
  - Apresiasi 100% Hadir: Warm Gold (`#8A4D0E`, bg `#FDF3E3`, border `#F3D29B`)
  - Sukses / WhatsApp / Excel: Soft Olive / Sage (`#36582C`, bg `#EFF5EC`, border `#C7DEC0`)
- **Typography**: `Nunito` (`weight: 600, 700, 800`) from `next/font/google` for headings and stat numerals paired with `Plus Jakarta Sans` for body, tables, and form inputs. Rounded letter terminals in `Nunito` make titles warm and approachable.
- **Un-stiffening the UI**:
  - Login & Parent Portal Gate: Removed rigid dark banner blocks; redesigned with warm editorial cards, gentle terracotta icon badges, and welcoming copy.
  - Summary Cards: Removed harsh `border-t-4` corporate stripes; softened into `rounded-2xl` journal cards with subtle colored indicator dots and badges.
  - Form & Table Labels: Removed rigid `uppercase tracking-wider` screaming text; converted all table headers and form labels to natural Sentence case.
- **Modern Web Standards**: Included `<meta name="color-scheme" content="light dark">` in `<head>` and defined `color-scheme` and `accent-color` in CSS `:root` and `.dark`.

---

## 3. WCAG 2.2 AA Contrast Verification

All color pairings meet or exceed WCAG 2.2 AA requirements (minimum 4.5:1 for body and label text, 3.0:1 for non-text interactive borders and focus rings):

| Theme | Pairing | Foreground | Background | Computed Ratio | Verdict (AA) |
|---|---|---|---|---|---|
| Light | Body Text on Warm Linen Canvas | `#231F1E` | `#FBF7F2` | **15.31:1** | PASS (>= 4.5:1) |
| Light | Body Text on White Surface | `#231F1E` | `#FFFFFF` | **16.33:1** | PASS (>= 4.5:1) |
| Light | Muted Metadata Text on Linen Canvas | `#574F4A` | `#FBF7F2` | **7.51:1** | PASS (>= 4.5:1) |
| Light | Subtle Hint Text on Linen Canvas | `#6E655F` | `#FBF7F2` | **5.34:1** | PASS (>= 4.5:1) |
| Light | Primary Terracotta Button with White Text | `#FFFFFF` | `#B54826` | **5.36:1** | PASS (>= 4.5:1) |
| Light | Primary Terracotta Hover Button | `#FFFFFF` | `#96391C` | **7.24:1** | PASS (>= 4.5:1) |
| Light | Accent Soft Slate Element | `#FFFFFF` | `#264663` | **9.82:1** | PASS (>= 4.5:1) |
| Light | Status Badge: Izin (Soft Slate Blue) | `#1E4363` | `#EBF2F7` | **9.11:1** | PASS (>= 4.5:1) |
| Light | Status Badge: Sakit (Warm Amber) | `#8A4D0E` | `#FEF4E6` | **6.13:1** | PASS (>= 4.5:1) |
| Light | Status Badge: Alpa (Warm Crimson) | `#962326` | `#FCECEB` | **7.15:1** | PASS (>= 4.5:1) |
| Light | Apresiasi 100% Hadir Badge | `#8A4D0E` | `#FDF3E3` | **6.07:1** | PASS (>= 4.5:1) |
| Light | Sukses / WA Indicator Badge | `#36582C` | `#EFF5EC` | **7.32:1** | PASS (>= 4.5:1) |
| Dark | Primary Ink on Espresso Canvas | `#F5EFEA` | `#181514` | **15.93:1** | PASS (>= 4.5:1) |
| Dark | Primary Ink on Dark Surface | `#F5EFEA` | `#26211F` | **13.96:1** | PASS (>= 4.5:1) |
| Dark | Muted Text on Dark Surface | `#B8ACA3` | `#26211F` | **7.17:1** | PASS (>= 4.5:1) |
| Non-text | Strong Border on Linen Canvas | `#988777` | `#FBF7F2` | **3.17:1** | PASS (>= 3.0:1) |
| Dark | Status Badge: Izin (Soft Blue on Dark Navy) | `#90CDF4` | `#162C40` | **7.42:1** | PASS (>= 4.5:1) |
| Dark | Status Badge: Sakit (Warm Ochre on Dark Amber) | `#FBD38D` | `#382A15` | **9.70:1** | PASS (>= 4.5:1) |
| Dark | Status Badge: Alpa (Rose Pink on Dark Rose) | `#FEB2B2` | `#3D1B1B` | **7.51:1** | PASS (>= 4.5:1) |
| Dark | Apresiasi 100% Hadir Badge | `#FBD38D` | `#382A15` | **9.70:1** | PASS (>= 4.5:1) |
| Dark | Sukses / WA Indicator Badge | `#A3D9A5` | `#1C301B` | **8.79:1** | PASS (>= 4.5:1) |
| Non-text | Dark Strong Border on Espresso Canvas | `#6E6058` | `#181514` | **3.05:1** | PASS (>= 3.0:1) |
| Dark | Primary Terracotta Button with White Text | `#FFFFFF` | `#B54826` | **5.36:1** | PASS (>= 4.5:1) |
| Dark | Primary Emerald Button with White Text | `#FFFFFF` | `#1E6B4B` | **6.47:1** | PASS (>= 4.5:1) |
| Dark | Primary Ocean Button with White Text | `#FFFFFF` | `#1B5299` | **7.64:1** | PASS (>= 4.5:1) |
| Dark | Primary Indigo Button with White Text | `#FFFFFF` | `#4338CA` | **7.05:1** | PASS (>= 4.5:1) |
| Dark | Primary Burgundy Button with White Text | `#FFFFFF` | `#881337` | **9.35:1** | PASS (>= 4.5:1) |

---

## 4. Copywriting and Tone Rules

- No em dashes (—) anywhere in user-facing copy. Use colons, commas, periods, or parentheses instead.
- Natural sentence-case labels instead of ALL-CAPS uppercase headers.
- Clear, respectful Indonesian terminology: "Wali Kelas", "Wali Murid", "Ketidakhadiran", "Surat Izin", "Apresiasi Kehadiran 100%".
- Primary actions clearly describe outcomes: "+ Catat Ketidakhadiran", "Buka Papan Presensi", "Export PDF", "Export Excel", "Salin Pesan WhatsApp".
