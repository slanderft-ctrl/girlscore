import { createClient } from "@/lib/supabase/server";
import { weeklyLabel } from "@/lib/format";
import type { Group, GroupTime } from "@/lib/types";
import { addGroupTime, removeGroupTime, saveGroup } from "../actions";

type Row = Group & { group_times: GroupTime[] };

const days = ["понеділок", "вівторок", "середа", "четвер", "пʼятниця", "субота", "неділя"];

function GroupForm({ g }: { g?: Group }) {
  return (
    <form action={saveGroup} className="grid gap-3 sm:grid-cols-4">
      {g && <input type="hidden" name="id" value={g.id} />}
      <label className="label">Назва<input className="input" name="name" required defaultValue={g?.name} placeholder="Gruppe 1" /></label>
      <label className="label">Місць<input className="input" type="number" min={1} name="capacity" defaultValue={g?.capacity ?? 10} /></label>
      <label className="label sm:col-span-2">Адреса / зал<input className="input" name="location" defaultValue={g?.location ?? ""} /></label>
      <label className="label sm:col-span-3">Опис для клієнтів<input className="input" name="description" defaultValue={g?.description ?? ""} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={g?.active ?? true} /> Активна</label>
      <button className="btn-ghost sm:col-span-4">{g ? "Зберегти" : "Створити групу"}</button>
    </form>
  );
}

export default async function GroupsPage() {
  const supabase = await createClient();
  const [{ data }, { data: counts }] = await Promise.all([
    supabase.from("groups").select("*, group_times(*)").order("sort_order").order("name"),
    supabase.from("group_time_spots").select("*"),
  ]);
  const members = new Map((counts ?? []).map((c) => [c.group_time_id as string, c.members as number]));
  const groups = (data ?? []) as Row[];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Групи</h1>
      <p className="text-sm text-muted">
        Кожна група має свої дні та час. Клієнти додають потрібні дні у «Мій розклад», і їх автоматично записує на кожне заняття.
      </p>
      {groups.map((g) => (
        <div key={g.id} className="card space-y-4">
          <GroupForm g={g} />
          <div>
            <div className="mb-1 text-sm font-medium">Дні та час</div>
            <ul className="divide-y divide-line rounded-lg border border-line text-sm">
              {g.group_times.filter((t) => t.active).sort((a, b) => a.weekday - b.weekday).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 p-2">
                  <span className="capitalize">{weeklyLabel(t.weekday, t.start_time, "uk")}–{t.end_time.slice(0, 5)}</span>
                  <span className="text-muted">{members.get(t.id) ?? 0}/{g.capacity} постійних</span>
                  <form action={removeGroupTime}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className="text-xs text-danger underline">Прибрати</button>
                  </form>
                </li>
              ))}
            </ul>
            <form action={addGroupTime} className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="groupId" value={g.id} />
              <label className="label">День<select className="input" name="weekday">
                {days.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
              </select></label>
              <label className="label">Початок<input className="input" type="time" name="start" defaultValue="18:00" required /></label>
              <label className="label">Кінець<input className="input" type="time" name="end" defaultValue="19:00" required /></label>
              <button className="btn-sm">Додати час</button>
            </form>
          </div>
        </div>
      ))}
      <div className="card">
        <h2 className="mb-3 font-semibold">Нова група</h2>
        <GroupForm />
      </div>
    </div>
  );
}
