import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDateUk, formatPhone, weeklyLabel } from "@/lib/format";
import { passSummary } from "@/lib/status";
import type { ClientPass, GroupTime, Profile } from "@/lib/types";
import { createClientProfile } from "../actions";

type Row = Profile & {
  client_passes: ClientPass[];
  schedule_slots: { ended_at: string | null; group_times: GroupTime & { groups: { name: string } } }[];
};

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string }> }) {
  const { q = "", error } = await searchParams;
  const supabase = await createClient();
  let query = supabase.from("profiles").select("*, client_passes(*), schedule_slots(ended_at, group_times(*, groups(name)))")
    .eq("is_admin", false).order("full_name");
  const term = q.replace(/[%,()]/g, "");
  if (term) query = query.or(`full_name.ilike.%${term}%,phone.ilike.%${term.replace(/\D/g, "") || term}%`);
  const { data } = await query;
  const clients = ((data ?? []) as Row[]).map((c) => {
    const slots = c.schedule_slots.filter((s) => !s.ended_at);
    return { ...c, slots, summary: passSummary(c.client_passes, slots.length > 0) };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-semibold">Клієнти</h1>
        <form className="flex gap-2">
          <input className="input" name="q" defaultValue={q} placeholder="Імʼя або телефон" />
          <button className="btn-ghost">Пошук</button>
        </form>
      </div>
      {error && <p className="card text-danger">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left">
            <tr><th className="p-3">Клієнт</th><th className="p-3">Розклад</th><th className="p-3">Залишилось</th><th className="p-3">Діє до</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {clients.map((c) => (
              <tr key={c.id}>
                <td className="p-3">
                  <Link href={`/admin/clients/${c.id}`} className="font-medium underline">{c.full_name || "Без імені"}</Link>
                  <div className="text-xs text-muted">{formatPhone(c.phone)}</div>
                </td>
                <td className="p-3 text-xs">
                  {c.slots.map((s, i) => <div key={i}>{weeklyLabel(s.group_times.weekday, s.group_times.start_time, "uk")} · {s.group_times.groups.name}</div>)}
                </td>
                <td className="p-3">
                  {c.summary.visitsLeft > 0 ? `${c.summary.visitsLeft} зан.` : c.summary.needsNewPass ? <span className="text-danger">потрібен новий</span> : "–"}
                </td>
                <td className="p-3">{c.summary.expiresAt ? formatDateUk(c.summary.expiresAt) : c.summary.notStarted ? "не почато" : "–"}</td>
              </tr>
            ))}
            {clients.length === 0 && <tr><td colSpan={4} className="p-3 text-muted">Нікого не знайдено.</td></tr>}
          </tbody>
        </table>
      </div>

      <details className="card">
        <summary className="cursor-pointer font-semibold">Додати клієнта</summary>
        <p className="mt-2 text-sm text-muted">Для тих, хто платить на місці. Пізніше клієнт може увійти з цим же номером.</p>
        <form action={createClientProfile} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="label">Імʼя<input className="input" name="full_name" required /></label>
          <label className="label">Телефон<input className="input" type="tel" name="phone" required placeholder="912 34 567" /></label>
          <button className="btn sm:col-span-2">Додати</button>
        </form>
      </details>
    </div>
  );
}
