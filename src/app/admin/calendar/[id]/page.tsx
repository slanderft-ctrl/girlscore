import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dayKey, formatDateUk, formatTime } from "@/lib/format";
import type { Attendance, Profile, Session } from "@/lib/types";
import { bookSingle, setComing } from "../../../actions";
import { cancelSession, markAttendance, returnVisit } from "../../actions";

type Row = Attendance & { profiles: Pick<Profile, "full_name" | "phone"> };

const statusUk: Record<string, string> = {
  coming: "прийде",
  absent: "не буде",
  no_pass: "потрібен абонемент",
  attended: "був(ла)",
  no_show: "не прийшов(ла)",
  cancelled: "скасовано",
};

const errUk: Record<string, string> = {
  full: "Немає місць.",
  no_pass: "У клієнта немає абонемента із заняттями.",
  too_late: "Вже пізно.",
};

export default async function SessionDetail({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }>;
}) {
  const { id } = await params;
  const { err } = await searchParams;
  const supabase = await createClient();
  const [{ data: session }, { data: rows }, { data: clients }] = await Promise.all([
    supabase.from("sessions").select("*, groups(name, location)").eq("id", id).single(),
    supabase.from("attendance").select("*, profiles(full_name, phone)").eq("session_id", id),
    supabase.from("profiles").select("id, full_name, phone").eq("is_admin", false).order("full_name"),
  ]);
  if (!session) notFound();
  const s = session as Session & { groups: { name: string; location: string | null } };
  const list = ((rows ?? []) as Row[]).sort((a, b) => (a.profiles.full_name ?? "").localeCompare(b.profiles.full_name ?? ""));
  const taking = list.filter((r) => ["coming", "attended", "no_show"].includes(r.status));
  const others = list.filter((r) => !taking.includes(r));
  const here = new Set(list.map((r) => r.client_id));
  const started = new Date(s.starts_at).getTime() <= Date.now();
  const back = `/admin/calendar/${id}`;

  const Person = ({ r }: { r: Row }) => (
    <li className="flex flex-wrap items-center justify-between gap-2 p-3">
      <div>
        <Link href={`/admin/clients/${r.client_id}`} className="font-medium underline">{r.profiles.full_name || "Без імені"}</Link>
        <div className="text-xs text-muted">
          {r.kind === "single" ? "разово" : "постійно"} · {statusUk[r.status]}{r.counted_at ? " · заняття списано" : ""}
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {!s.cancelled && r.status === "coming" && (
          <form action={setComing}>
            <input type="hidden" name="sessionId" value={id} /><input type="hidden" name="clientId" value={r.client_id} />
            <input type="hidden" name="coming" value="0" /><input type="hidden" name="back" value={back} />
            <button className="btn-ghost text-xs">Не буде</button>
          </form>
        )}
        {!s.cancelled && ["absent", "no_pass"].includes(r.status) && (
          <form action={setComing}>
            <input type="hidden" name="sessionId" value={id} /><input type="hidden" name="clientId" value={r.client_id} />
            <input type="hidden" name="coming" value="1" /><input type="hidden" name="back" value={back} />
            <button className="btn-ghost text-xs">Прийде</button>
          </form>
        )}
        {started && ["coming", "attended", "no_show"].includes(r.status) && (["attended", "no_show"] as const).map((st) => (
          <form key={st} action={markAttendance}>
            <input type="hidden" name="attendanceId" value={r.id} /><input type="hidden" name="sessionId" value={id} />
            <input type="hidden" name="status" value={st} />
            <button className={r.status === st ? "btn-sm" : "btn-ghost text-xs"}>{st === "attended" ? "Був(ла)" : "Не прийшов(ла)"}</button>
          </form>
        ))}
        {r.counted_at && (
          <form action={returnVisit}>
            <input type="hidden" name="attendanceId" value={r.id} />
            <button className="btn-ghost text-xs">Повернути заняття</button>
          </form>
        )}
      </div>
    </li>
  );

  return (
    <div className="space-y-6">
      <Link href={`/admin/calendar?week=${dayKey(s.starts_at)}`} className="text-sm underline">← Календар</Link>
      <div>
        <h1 className="text-2xl font-semibold">{s.groups.name} {s.cancelled && <span className="text-danger">(скасовано)</span>}</h1>
        <p className="capitalize text-muted">{formatDateUk(s.starts_at)}, {formatTime(s.starts_at)}–{formatTime(s.ends_at)} · {taking.length}/{s.capacity} прийде</p>
      </div>
      {err && <p className="card text-danger">{errUk[err] ?? "Не вдалося."}</p>}

      <section>
        <h2 className="mb-2 text-lg font-semibold">Прийдуть</h2>
        {taking.length === 0 ? <p className="text-muted">Поки нікого.</p> : (
          <ul className="divide-y divide-line rounded-xl border border-line">{taking.map((r) => <Person key={r.id} r={r} />)}</ul>
        )}
      </section>
      {others.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Не прийдуть</h2>
          <ul className="divide-y divide-line rounded-xl border border-line">{others.map((r) => <Person key={r.id} r={r} />)}</ul>
        </section>
      )}

      {!s.cancelled && (
        <form action={bookSingle} className="card flex flex-wrap items-end gap-2">
          <input type="hidden" name="sessionId" value={id} />
          <input type="hidden" name="back" value={back} />
          <label className="label flex-1">Додати клієнта на це заняття
            <select className="input" name="clientId" required>
              {(clients ?? []).filter((c) => !here.has(c.id)).map((c) => (
                <option key={c.id} value={c.id}>{c.full_name || c.phone}</option>
              ))}
            </select>
          </label>
          <button className="btn">Додати</button>
        </form>
      )}

      {!s.cancelled && (
        <form action={cancelSession} className="border-t border-line pt-4">
          <input type="hidden" name="sessionId" value={id} />
          <button className="btn-danger">Скасувати заняття (всім повернеться заняття)</button>
        </form>
      )}
    </div>
  );
}
