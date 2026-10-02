import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dayKey, formatDateUk, formatMoney, formatPhone, formatTime, weeklyLabel } from "@/lib/format";
import { passSummary } from "@/lib/status";
import type { Attendance, ClientPass, Group, GroupTime, PassType, Pause, Profile, Session } from "@/lib/types";
import { addPause, addSlot, removePause, removeSlot, setComing } from "../../../actions";
import { adjustPass, grantPass, updateClientProfile } from "../../actions";

type SlotRow = { id: string; group_time_id: string; group_times: GroupTime & { groups: { name: string } } };
type AttRow = Attendance & { sessions: Session & { groups: { name: string } } };
type PaymentRow = { id: string; provider: string; amount_minor: number; currency: string; status: string; created_at: string; pass_types: { name: string } | null };

const statusUk: Record<string, string> = {
  coming: "прийде", absent: "не буде", no_pass: "потрібен абонемент", attended: "був(ла)", no_show: "не прийшов(ла)", cancelled: "скасовано",
};
const passStatusUk: Record<string, string> = { active: "активний", used_up: "використаний", expired: "прострочений", cancelled: "скасований" };

export default async function ClientDetail({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }>;
}) {
  const { id } = await params;
  const { err } = await searchParams;
  const supabase = await createClient();
  const now = new Date().toISOString();
  const [{ data: profile }, { data: passes }, { data: slots }, { data: rows }, { data: pauses }, { data: payments }, { data: passTypes }, { data: groups }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", id).single(),
      supabase.from("client_passes").select("*, pass_types(name)").eq("client_id", id).order("created_at", { ascending: false }),
      supabase.from("schedule_slots").select("id, group_time_id, group_times(*, groups(name))").eq("client_id", id).is("ended_at", null),
      supabase.from("attendance").select("*, sessions!inner(*, groups(name))").eq("client_id", id).gte("sessions.starts_at", new Date(Date.now() - 30 * 864e5).toISOString()),
      supabase.from("pauses").select("*").eq("client_id", id).gte("ends_on", dayKey(new Date())),
      supabase.from("payments").select("id, provider, amount_minor, currency, status, created_at, pass_types(name)").eq("client_id", id).order("created_at", { ascending: false }),
      supabase.from("pass_types").select("*").eq("active", true).order("sort_order"),
      supabase.from("groups").select("*, group_times(*)").eq("active", true).order("name"),
    ]);
  if (!profile) notFound();
  const p = profile as Profile;
  const mySlots = (slots ?? []) as unknown as SlotRow[];
  const summary = passSummary((passes ?? []) as ClientPass[], mySlots.length > 0);
  const att = ((rows ?? []) as unknown as AttRow[]).sort((a, b) => a.sessions.starts_at.localeCompare(b.sessions.starts_at));
  const upcoming = att.filter((r) => r.sessions.starts_at >= now).slice(0, 10);
  const recent = att.filter((r) => r.sessions.starts_at < now).reverse();
  const inSchedule = new Set(mySlots.map((s) => s.group_time_id));
  const back = `/admin/clients/${id}`;
  const hidden = (<><input type="hidden" name="clientId" value={id} /><input type="hidden" name="back" value={back} /></>);

  return (
    <div className="space-y-8">
      <Link href="/admin/clients" className="text-sm underline">← Клієнти</Link>
      {err && <p className="card text-danger">Не вдалося: {err.replace(/_/g, " ")}</p>}

      <form action={updateClientProfile} className="card grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="id" value={p.id} />
        <div className="sm:col-span-2">
          <h1 className="text-2xl font-semibold">{p.full_name || "Без імені"}</h1>
          <p className="text-sm text-muted"><a className="underline" href={`tel:+${p.phone}`}>{formatPhone(p.phone)}</a> · клієнт з {formatDateUk(p.created_at)}</p>
        </div>
        <label className="label">Імʼя<input className="input" name="full_name" defaultValue={p.full_name ?? ""} /></label>
        <label className="label">Email<input className="input" name="email" type="email" defaultValue={p.email ?? ""} /></label>
        <label className="label sm:col-span-2">Нотатки (бачите тільки ви)<textarea className="input" name="notes" rows={2} defaultValue={p.notes ?? ""} /></label>
        <button className="btn-ghost sm:col-span-2">Зберегти</button>
      </form>

      <section className="card">
        <div className="text-sm text-muted">Абонемент</div>
        <div className="text-2xl font-semibold">
          {summary.visitsLeft > 0 ? `Залишилось ${summary.visitsLeft} зан.` : summary.needsNewPass ? "Потрібен новий абонемент" : "Немає абонемента"}
        </div>
        <div className="text-sm text-muted">
          {summary.expiresAt ? `Діє до ${formatDateUk(summary.expiresAt)}` : summary.notStarted ? "30 днів почнуться з першого заняття" : ""}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Розклад</h2>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {mySlots.map((s) => (
            <li key={s.id} className="flex items-center justify-between p-3">
              <span><span className="capitalize">{weeklyLabel(s.group_times.weekday, s.group_times.start_time, "uk")}</span> · {s.group_times.groups.name}</span>
              <form action={removeSlot}>{hidden}<input type="hidden" name="groupTimeId" value={s.group_time_id} /><button className="text-sm underline">Прибрати</button></form>
            </li>
          ))}
          {mySlots.length === 0 && <li className="p-3 text-muted">Немає постійних днів.</li>}
        </ul>
        <form action={addSlot} className="mt-2 flex flex-wrap items-end gap-2">
          {hidden}
          <label className="label flex-1">Додати день
            <select className="input" name="groupTimeId">
              {((groups ?? []) as (Group & { group_times: GroupTime[] })[]).flatMap((g) =>
                g.group_times.filter((t) => t.active && !inSchedule.has(t.id)).map((t) => (
                  <option key={t.id} value={t.id}>{g.name} · {weeklyLabel(t.weekday, t.start_time, "uk")}</option>
                )))}
            </select>
          </label>
          <button className="btn-sm">Додати</button>
        </form>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Найближчі заняття</h2>
        <ul className="divide-y divide-line rounded-xl border border-line text-sm">
          {upcoming.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 p-3">
              <Link className="underline" href={`/admin/calendar/${r.session_id}`}>
                <span className="capitalize">{formatDateUk(r.sessions.starts_at)}</span> {formatTime(r.sessions.starts_at)} · {r.sessions.groups.name}
              </Link>
              <span className="flex items-center gap-2">
                <span className="text-muted">{statusUk[r.status]}</span>
                {["coming", "absent"].includes(r.status) && (
                  <form action={setComing}>
                    {hidden}<input type="hidden" name="sessionId" value={r.session_id} />
                    <input type="hidden" name="coming" value={r.status === "coming" ? "0" : "1"} />
                    <button className="btn-ghost text-xs">{r.status === "coming" ? "Не буде" : "Прийде"}</button>
                  </form>
                )}
              </span>
            </li>
          ))}
          {upcoming.length === 0 && <li className="p-3 text-muted">Немає.</li>}
        </ul>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {((pauses ?? []) as Pause[]).map((pa) => (
            <form key={pa.id} action={removePause} className="card flex items-center justify-between text-sm">
              <input type="hidden" name="back" value={back} /><input type="hidden" name="pauseId" value={pa.id} />
              <span>Пауза {pa.starts_on} – {pa.ends_on}</span><button className="underline">Прибрати</button>
            </form>
          ))}
          <form action={addPause} className="card flex flex-wrap items-end gap-2 sm:col-span-2">
            {hidden}
            <label className="label">Пауза з<input className="input" type="date" name="from" required /></label>
            <label className="label">по<input className="input" type="date" name="to" required /></label>
            <button className="btn-ghost">Додати паузу</button>
          </form>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Абонементи</h2>
        <div className="space-y-3">
          {((passes ?? []) as ClientPass[]).map((cp) => (
            <form key={cp.id} action={adjustPass} className="card grid items-end gap-3 sm:grid-cols-4">
              <input type="hidden" name="passId" value={cp.id} />
              <div>
                <div className="font-medium">{cp.pass_types?.name}</div>
                <div className="text-xs text-muted">
                  {passStatusUk[cp.status]} · куплено {formatDateUk(cp.created_at)}
                  {cp.first_class_at ? ` · почато ${formatDateUk(cp.first_class_at)}` : " · не почато"}
                </div>
              </div>
              <label className="label">Залишилось<input className="input" type="number" min={0} name="visitsLeft" defaultValue={cp.visits_left} /></label>
              <label className="label">Діє до<input className="input" type="date" name="expires" defaultValue={cp.expires_at ? dayKey(cp.expires_at) : ""} /></label>
              <button className="btn-ghost">Змінити</button>
            </form>
          ))}
        </div>
        <form action={grantPass} className="card mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="clientId" value={id} />
          <label className="label flex-1">Видати абонемент (оплата на місці)
            <select className="input" name="passTypeId">
              {((passTypes ?? []) as PassType[]).map((t) => <option key={t.id} value={t.id}>{t.name} · {formatMoney(t.price_minor, t.currency)}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="free" /> Безкоштовно</label>
          <button className="btn">Видати</button>
        </form>
      </section>

      {recent.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Останні 30 днів</h2>
          <ul className="text-sm text-muted">
            {recent.map((r) => <li key={r.id}>{formatDateUk(r.sessions.starts_at)} · {r.sessions.groups.name} · {statusUk[r.status]}{r.counted_at ? " · списано" : ""}</li>)}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-lg font-semibold">Оплати</h2>
        <ul className="divide-y divide-line rounded-xl border border-line text-sm">
          {((payments ?? []) as unknown as PaymentRow[]).map((pm) => (
            <li key={pm.id} className="flex justify-between p-3">
              <span>{formatDateUk(pm.created_at)} · {pm.pass_types?.name} · {pm.provider === "manual" ? "на місці" : pm.provider}</span>
              <span>{formatMoney(pm.amount_minor, pm.currency)} <span className="text-muted">({pm.status})</span></span>
            </li>
          ))}
          {(payments ?? []).length === 0 && <li className="p-3 text-muted">Оплат ще не було.</li>}
        </ul>
      </section>
    </div>
  );
}
