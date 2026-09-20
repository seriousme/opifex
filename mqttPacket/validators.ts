/**
 * Checks for invalid UTF-8 characters or null bytes.
 *
 * @param value - The string to validate.
 * @returns `true` if the string contains invalid UTF-8 sequences or a null byte, otherwise `false`.
 */
export function invalidUTF8(value: string): boolean {
  return value.includes("\x00") || !value.isWellFormed();
}
