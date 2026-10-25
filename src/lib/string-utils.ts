/**
 * Capitalizes the first letter of each word (Title Case) while preserving
 * uppercase letters in academic titles and acronyms (e.g., S.Kom, M.Pd, Ph.D).
 */
export function toTitleCase(input: string): string {
  if (!input) return "";

  // Split words by space, preserving spacing
  return input
    .split(/(\s+)/)
    .map((segment) => {
      // If whitespace segment, return as is
      if (/^\s+$/.test(segment)) return segment;

      // Handle segments with dots (like S.Kom, M.Pd, Drs.) or hyphens
      return segment
        .split(/([.\-_])/)
        .map((part) => {
          if (!part || /^[.\-_]$/.test(part)) return part;
          return part.charAt(0).toUpperCase() + part.slice(1);
        })
        .join("");
    })
    .join("");
}
