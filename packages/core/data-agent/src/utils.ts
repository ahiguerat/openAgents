export function getTimeRFC3339(): string {
  const now = new Date();
  return now.toISOString();
}
