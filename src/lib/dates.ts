/** Date helpers working on plain YYYY-MM-DD strings (calendar days, no time zone drift). */

const DAY = 86_400_000;

export function toUTC(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function fromUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  return fromUTC(toUTC(iso) + n * DAY);
}

/** 1 = Monday … 7 = Sunday */
export function dayOfWeek(iso: string): number {
  const d = new Date(toUTC(iso)).getUTCDay();
  return d === 0 ? 7 : d;
}

export function weekStart(iso: string): string {
  return addDays(iso, 1 - dayOfWeek(iso));
}

export function todayISO(timeZone = "Africa/Johannesburg"): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

export function monthOf(iso: string): number {
  return Number(iso.slice(5, 7));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function shortDate(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTHS[monthOf(iso) - 1]}`;
}

export function dayName(iso: string): string {
  return DAYS[dayOfWeek(iso) - 1];
}

export function monthName(iso: string): string {
  const long = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${long[monthOf(iso) - 1]} ${iso.slice(0, 4)}`;
}

export function weeksBetween(a: string, b: string): number {
  return Math.round((toUTC(weekStart(b)) - toUTC(weekStart(a))) / (7 * DAY));
}
