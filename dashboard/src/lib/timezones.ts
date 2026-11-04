/** Common IANA zones for site timezone selects. */
export const TIMEZONES: string[] = [
  'UTC',
  'America/Mexico_City',
  'America/Monterrey',
  'America/Tijuana',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Amsterdam',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Pacific/Auckland',
];

export function timezoneOptions(current?: string): string[] {
  const set = new Set(TIMEZONES);
  if (current && !set.has(current)) set.add(current);
  return [...set].sort((a, b) => a.localeCompare(b));
}
