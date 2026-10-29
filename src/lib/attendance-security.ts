/**
 * Validates that a letterFilePath belongs strictly to the target class
 * and does not attempt path traversal or cross-class access (SEC-FINDING-01)
 */
export function isValidLetterFilePath(
  filePath: string | null | undefined,
  classId: number,
  existingPath?: string | null
): boolean {
  if (!filePath) return true;
  // Prevent directory traversal attacks
  if (filePath.includes("..") || filePath.includes("\\")) return false;
  // If unchanged from an already assigned path (e.g. legacy seeded sample), allow
  if (existingPath && filePath === existingPath) return true;
  // Path must start with classId/
  return filePath.startsWith(`${classId}/`);
}
