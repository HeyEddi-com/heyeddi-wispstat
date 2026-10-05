/**
 * Calendar-date helpers. Day strings are YYYY-MM-DD.
 */

export function shiftDate(day: string, deltaDays: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(year!, (month! - 1), date! + deltaDays));
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function daysInclusive(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.round((end - start) / 86400000) + 1;
}

export function previousRange(from: string, to: string): { from: string; to: string } {
  const span = daysInclusive(from, to);
  const prevTo = shiftDate(from, -1);
  return { from: shiftDate(prevTo, -(span - 1)), to: prevTo };
}

export function isDay(value: string | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
