/**
 * Get current time in RFC3339 format (ISO 8601)
 * 
 * @returns Current timestamp in ISO format
 * @example "2026-04-06T10:00:00.000Z"
 */
export function getTimeRFC3339(): string {
  return new Date().toISOString();
}
