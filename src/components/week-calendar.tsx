import Link from "next/link";
import { addDays, dayKey, formatTime, TIME_ZONE } from "@/lib/format";
import type { Session } from "@/lib/types";

const labels = {
  nb: { prev: "← Forrige", next: "Neste →", thisWeek: "Denne uken", none: "Ingen timer", noneWeek: "Ingen timer denne uken.", tz: "Tider i" },
  uk: { prev: "← Назад", next: "Далі →", thisWeek: "Цей тиждень", none: "Немає занять", noneWeek: "Цього тижня занять немає.", tz: "Час за" },
};

/**
 * Week view: seven columns on wide screens, a day-by-day list on phones.
 * `renderSession` draws each class (booking button, attendee count, …).
 */
export function WeekCalendar({
  week, sessions, basePath, renderSession, lang = "nb",
}: {
  lang?: "nb" | "uk";
  week: string;
  sessions: Session[];
  basePath: string;
  renderSession: (s: Session) => React.ReactNode;
}) {
  const t = labels[lang];
  const dayHeader = new Intl.DateTimeFormat(lang === "nb" ? "nb-NO" : "uk-UA", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const today = dayKey(new Date());
  const byDay = new Map<string, Session[]>();
  for (const s of sessions) {
    const k = dayKey(s.starts_at);
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link className="btn-ghost" href={`${basePath}?week=${addDays(week, -7)}`}>{t.prev}</Link>
        <div className="text-center">
          <div className="font-medium">
            {dayHeader.format(new Date(`${days[0]}T12:00:00Z`))} – {dayHeader.format(new Date(`${days[6]}T12:00:00Z`))}
          </div>
          <Link className="text-xs text-muted underline" href={basePath}>{t.thisWeek}</Link>
        </div>
        <Link className="btn-ghost" href={`${basePath}?week=${addDays(week, 7)}`}>{t.next}</Link>
      </div>
      <div className="grid gap-3 md:grid-cols-7">
        {days.map((d) => {
          const list = (byDay.get(d) ?? []).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
          return (
            <div key={d} className={`rounded-xl border p-2 ${d === today ? "border-accent" : "border-line"} ${list.length === 0 ? "hidden md:block" : ""}`}>
              <div className={`mb-2 text-sm font-medium ${d === today ? "text-accent" : ""}`}>
                {dayHeader.format(new Date(`${d}T12:00:00Z`))}
              </div>
              <div className="space-y-2">
                {list.map((s) => (
                  <div key={s.id} className={`rounded-lg bg-surface p-2 text-sm ${s.cancelled ? "opacity-50 line-through" : ""}`}>
                    <div className="font-medium">{formatTime(s.starts_at)}–{formatTime(s.ends_at)}</div>
                    <div>{s.groups?.name}</div>
                    {s.groups?.location && <div className="text-xs text-muted">{s.groups.location}</div>}
                    <div className="mt-1">{renderSession(s)}</div>
                  </div>
                ))}
                {list.length === 0 && <div className="text-xs text-muted">{t.none}</div>}
              </div>
            </div>
          );
        })}
      </div>
      {sessions.length === 0 && <p className="mt-4 text-center text-muted md:hidden">{t.noneWeek}</p>}
      <p className="mt-3 text-xs text-muted">{t.tz} {TIME_ZONE}.</p>
    </div>
  );
}

/** Loads the sessions for the week starting on `week` (YYYY-MM-DD). */
export function weekRange(week: string) {
  // Pad by a day each side; WeekCalendar buckets by local day.
  return { from: `${addDays(week, -1)}T00:00:00Z`, to: `${addDays(week, 8)}T00:00:00Z` };
}
