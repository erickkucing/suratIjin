# DESIGN.md: Sistem Surat Izin & Ketidakhadiran Siswa

## 1. Visual Direction & Identity

- **Design Read**: Reading this as: school attendance & permission archive web app for homeroom teachers (Wali Kelas) and parents (Wali Murid), in a Warm Chalkboard & Cream Paper editorial style, dial ENERGY 2 / RHYTHM 2 / MOTION 1.
- **Three Dials**:
  - `ENERGY: 2 (Balanced)`: Warm, authoritative academic identity with tactile paper and chalkboard contrasts.
  - `RHYTHM: 2 (Consistent with intentional breaks)`: Structured action bar and data table paired with a distinct appreciation board and monthly analytical chart.
  - `MOTION: 1 (Calm / Functional)`: Instant state transitions, focus rings, upload progress feedback, and modal open/close transitions without looping animations.

## 2. One-Line Visual Decision Log (Rule R-31)

- **Palette**: Deep Chalkboard Green (`#1F6F54`) and Warm Cream Paper (`#FDF8EE`) preserve the beloved classroom board identity from the legacy app while meeting WCAG AA contrast.
- **Accent**: Warm Terracotta (`#C84B24` text-safe / `#B83B14` with white text) highlights only the primary "+ Catat Ketidakhadiran" CTA so the main action is unmistakable on mobile.
- **Typography**: `Sora` (headings/numeric counters) pairs geometric authority on titles with `Plus Jakarta Sans` (body/tables/inputs) for high legibility on dense Indonesian student names and dates.
- **Layout**: Task-first workspace layout puts the primary teacher decisions (filter missing letters, record new izin from mobile camera, share parent link) at the top without decorative hero banners.
- **Cards**: Summary counters (Alpa, Izin, Sakit, Surat Belum) use top-border semantic accents so teachers can scan class health in one glance and click any card to filter immediately.
- **Responsive Reflow**:
  - Mobile (< 640px): Stacked absence cards with 44x44px minimum touch targets, sticky bottom quick-action bar (+ Catat Izin, Filter, Link Wali Murid), and native camera trigger.
  - Tablet (640px - 1024px): 2-column summary grid, collapsible filter drawer, and compact responsive table with horizontal scroll protection.
  - Desktop (> 1024px): 4-column summary strip, inline filter bar, full data table, and side-by-side analytics + 100% attendance appreciation board.

## 3. WCAG 2.2 AA Contrast Verification

| Theme | Pairing | Foreground | Background | Computed Ratio | Verdict (AA) |
|---|---|---|---|---|---|
| Light | Primary Body Text on Cream Canvas | `#1E2A26` | `#FDF8EE` | **14.21:1** | PASS (>= 4.5:1) |
| Light | Primary Body Text on White Card | `#1E2A26` | `#FFFFFF` | **15.05:1** | PASS (>= 4.5:1) |
| Light | Muted Metadata Text on Cream Canvas | `#4A5651` | `#FDF8EE` | **7.18:1** | PASS (>= 4.5:1) |
| Light | Chalkboard Green Header with White Text | `#FFFFFF` | `#1F6F54` | **6.12:1** | PASS (>= 4.5:1) |
| Light | Status Badge: Izin | `#164E87` | `#E7F2FD` | **7.42:1** | PASS (>= 4.5:1) |
| Light | Status Badge: Sakit | `#145A3A` | `#E6F6EE` | **7.55:1** | PASS (>= 4.5:1) |
| Light | Status Badge: Alpa | `#982613` | `#FCEBE7` | **7.11:1** | PASS (>= 4.5:1) |
| Dark | Primary Chalk Text on Deep Slate-Green Canvas | `#F3EFE6` | `#111916` | **15.84:1** | PASS (>= 4.5:1) |
| Dark | Primary Chalk Text on Elevated Surface | `#F3EFE6` | `#192420` | **13.62:1** | PASS (>= 4.5:1) |
| Dark | Muted Text on Elevated Surface | `#A6B5AE` | `#192420` | **7.04:1** | PASS (>= 4.5:1) |

## 4. Copywriting and Tone Rules

- No em dashes (—) anywhere in user-facing copy. Use colons, commas, periods, or parentheses instead.
- Clear, respectful Indonesian school terminology: "Wali Kelas", "Wali Murid", "Ketidakhadiran", "Surat Izin", "Apresiasi Kehadiran 100%".
- Every button specifies exact action: "+ Catat Ketidakhadiran", "Buka Kamera", "Unduh PDF Rekap", "Salin Pesan WhatsApp".
