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

/**
 * Generates random letter code for portal URLs (default: 3 random letters, e.g. "xYZ").
 */
export function generateRandomClassCode(length = 3): string {
  const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  return code;
}

/**
 * Validates if a string is a valid class slug format (e.g. 3-character random code or custom alphanumeric).
 */
export function isValidClassCode(code: string): boolean {
  if (!code) return false;
  return /^[a-zA-Z0-9_-]{3,50}$/.test(code.trim());
}

