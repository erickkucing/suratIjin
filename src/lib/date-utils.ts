/**
 * Utility for parsing and manipulating calendar dates (YYYY-MM-DD)
 * without timezone drift or off-by-one errors.
 */

export function parseYMD(dateStr: string): { year: number; month: number; day: number } {
  const parts = dateStr.split("-").map(Number);
  return {
    year: parts[0],
    month: parts[1],
    day: parts[2],
  };
}

export function generateDateRange(startStr: string, endStr?: string): string[] {
  if (!endStr || endStr <= startStr) {
    return [startStr];
  }

  const { year: y1, month: m1, day: d1 } = parseYMD(startStr);
  const { year: y2, month: m2, day: d2 } = parseYMD(endStr);

  const current = new Date(Date.UTC(y1, m1 - 1, d1));
  const end = new Date(Date.UTC(y2, m2 - 1, d2));

  const dates: string[] = [];
  // Safety limit: max 14 days consecutive in a single submission
  let count = 0;
  while (current <= end && count < 14) {
    const yyyy = current.getUTCFullYear();
    const mm = String(current.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(current.getUTCDate()).padStart(2, "0");
    dates.push(`${yyyy}-${mm}-${dd}`);

    current.setUTCDate(current.getUTCDate() + 1);
    count++;
  }

  return dates;
}

export function getDaysDifference(startDate: string, endDate?: string): number {
  if (!endDate || endDate <= startDate) return 1;

  const { year: y1, month: m1, day: d1 } = parseYMD(startDate);
  const { year: y2, month: m2, day: d2 } = parseYMD(endDate);

  const utc1 = Date.UTC(y1, m1 - 1, d1);
  const utc2 = Date.UTC(y2, m2 - 1, d2);

  const diffDays = Math.round((utc2 - utc1) / (1000 * 60 * 60 * 24)) + 1;
  return Math.min(Math.max(1, diffDays), 14);
}

export function getLocalDateString(d: Date = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
