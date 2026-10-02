export const TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE ?? "Europe/Oslo";
const LOCALE = "nb-NO";

export function formatMoney(minor: number, currency = "NOK") {
  return new Intl.NumberFormat(LOCALE, { style: "currency", currency, maximumFractionDigits: 0 })
    .format(minor / 100);
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, weekday: "short", day: "numeric", month: "short" })
    .format(new Date(iso));
}

export function formatTime(iso: string) {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" })
    .format(new Date(iso));
}

export function formatDateTime(iso: string) {
  return `${formatDate(iso)} ${formatTime(iso)}`;
}

const WEEKDAYS_NB = ["", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag"];
const WEEKDAYS_UK = ["", "понеділок", "вівторок", "середа", "четвер", "пʼятниця", "субота", "неділя"];

/** "tirsdag 18:00" for a weekly time (weekday 1 = Monday). */
export function weeklyLabel(weekday: number, start: string, lang: "nb" | "uk" = "nb") {
  return `${(lang === "nb" ? WEEKDAYS_NB : WEEKDAYS_UK)[weekday]} ${start.slice(0, 5)}`;
}

export function formatDateUk(iso: string) {
  return new Intl.DateTimeFormat("uk-UA", { timeZone: TIME_ZONE, weekday: "short", day: "numeric", month: "short" })
    .format(new Date(iso));
}

/** Norwegian numbers are stored without "+", e.g. 4791234567. */
export function formatPhone(phone: string | null) {
  if (!phone) return "";
  const p = phone.replace(/^\+/, "");
  if (p.startsWith("47") && p.length === 10) return `+47 ${p.slice(2, 5)} ${p.slice(5, 7)} ${p.slice(7)}`;
  return `+${p}`;
}

/** Calendar date (YYYY-MM-DD) of an instant in the studio's time zone. */
export function dayKey(iso: string | Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date(iso));
}

/** Monday (YYYY-MM-DD) of the week containing `date`. */
export function weekStart(date: string | undefined) {
  const d = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00Z`) : new Date(`${dayKey(new Date())}T12:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

export function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Converts a wall-clock time in the studio's time zone to a UTC ISO string.
 * Works across DST by measuring the zone offset at that instant.
 */
export function zonedToUtc(day: string, time: string) {
  const guess = new Date(`${day}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(guess);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asZoned = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return new Date(guess.getTime() - (asZoned - guess.getTime())).toISOString();
}
