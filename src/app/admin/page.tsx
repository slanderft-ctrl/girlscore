import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { addDays, dayKey, formatDateUk, formatPhone, formatTime, zonedToUtc } from "@/lib/format";
import { passSummary } from "@/lib/status";
import type { ClientPass, Profile, Session } from "@/lib/types";

type SessionRow = Session & { groups: { name: string }; attendance: { status: string }[] };
type ClientRow = Profile & { client_passes: ClientPass[]; schedule_slots: { ended_at: string | null }[] };

export default async function AdminToday() {
  const supabase = await createClient();
  const today = dayKey(new Date());
  const [{ data: sessions }, { data: clients }] = await Promise.all([
    supabase.from("sessions").select("*, groups(name), attendance(status)")
      .gte("starts_at", zonedToUtc(today, "00:00")).lt("starts_at", zonedToUtc(addDays(today, 1), "00:00"))
      .order("starts_at"),
    supabase.from("profiles").select("*, client_passes(*), schedule_slots(ended_at)").eq("is_admin", false),
  ]);
  const withStatus = ((clients ?? []) as ClientRow[]).map((c) => ({
    ...c,
    summary: passSummary(c.client_passes, c.schedule_slots.some((s) => !s.ended_at)),
  }));
  const needsPass = withStatus.filter((c) => c.summary.needsNewPass && c.schedule_slots.some((s) => !s.ended_at));
  const low = withStatus.filter((c) => c.summary.low);
  const active = withStatus.filter((c) => c.summary.visitsLeft > 0).length;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-3 gap-3">
        <div className="card"><div className="text-sm text-muted">З абонементом</div><div className="text-3xl font-semibold">{active}</div></div>
        <div className="card"><div className="text-sm text-muted">Занять сьогодні</div><div className="text-3xl font-semibold">{sessions?.length ?? 0}</div></div>
        <div className="card"><div className="text-sm text-muted">Потрібен абонемент</div><div className="text-3xl font-semibold">{needsPass.length}</div></div>
      </div>

      <section>
        <h2 className="mb-2 text-lg font-semibold capitalize">Сьогодні, {formatDateUk(new Date().toISOString())}</h2>
        {(sessions ?? []).length === 0 ? <p className="text-muted">Сьогодні занять немає.</p> : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {((sessions ?? []) as SessionRow[]).map((s) => (
              <li key={s.id}>
                <Link href={`/admin/calendar/${s.id}`} className="flex items-center justify-between p-3 hover:bg-surface">
                  <span><b>{formatTime(s.starts_at)}</b> {s.groups.name} {s.cancelled && <span className="text-danger">(скасовано)</span>}</span>
                  <span className="text-sm text-muted">
                    {s.attendance.filter((a) => ["coming", "attended", "no_show"].includes(a.status)).length}/{s.capacity} прийде
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ClientList title="Потрібен новий абонемент" rows={needsPass} empty="Таких немає." />
      <ClientList title="Лишилось 1 заняття" rows={low} empty="Таких немає." />
    </div>
  );
}

function ClientList({ title, rows, empty }: { title: string; rows: (Profile & { id: string })[]; empty: string }) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      {rows.length === 0 ? <p className="text-muted">{empty}</p> : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/admin/clients/${c.id}`} className="flex justify-between gap-2 p-3 hover:bg-surface">
                <span>{c.full_name || "Без імені"}</span>
                <span className="text-sm text-muted">{formatPhone(c.phone)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
