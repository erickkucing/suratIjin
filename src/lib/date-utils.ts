export function generateDateRange(startStr: string, endStr?: string): string[] {
  if (!endStr || endStr <= startStr) {
    return [startStr];
  }

  const dates: string[] = [];
  const current = new Date(startStr);
  const end = new Date(endStr);

  // Safety limit: max 14 days consecutive in a single submission
  let count = 0;
  while (current <= end && count < 14) {
    const yyyy = current.getFullYear();
    const mm = String(current.getMonth() + 1).padStart(2, "0");
    const dd = String(current.getDate()).padStart(2, "0");
    dates.push(`${yyyy}-${mm}-${dd}`);

    current.setDate(current.getDate() + 1);
    count++;
  }

  return dates;
}
