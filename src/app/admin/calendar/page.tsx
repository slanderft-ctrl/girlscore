import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { WeekCalendar, weekRange } from "@/components/week-calendar";
import { weekStart } from "@/lib/format";
import type { Session } from "@/lib/types";
import { cancelRange } from "../actions";

type Row = Session & { groups: { name: string; location: string | null }; attendance: { status: string }[] };

export default async function AdminCalendar({ searchParams }: { searchParams: Promise<{ week?: string; cancelled?: string }> }) {
  const params = await searchParams;
  const week = weekStart(params.week);
  const { from, to } = weekRange(week);
  const supabase = await createClient();
  const { data } = await supabase.from("sessions").select("*, groups(name, location), attendance(status)")
    .gte("starts_at", from).lt("starts_at", to).order("starts_at");
  const sessions = (data ?? []) as Row[];
  const coming = new Map(sessions.map((s) => [s.id, s.attendance.filter((a) => ["coming", "attended", "no_show"].includes(a.status)).length]));

  return (
    <div className="space-y-8">
      {params.cancelled && <p className="card">Скасовано занять: {params.cancelled}. Заняття повернуто всім.</p>}
      <WeekCalendar
        lang="uk"
        week={week}
        sessions={sessions}
        basePath="/admin/calendar"
        renderSession={(s) => (
          <Link href={`/admin/calendar/${s.id}`} className="text-xs underline">
            {s.cancelled ? "скасовано" : `${coming.get(s.id)}/${s.capacity} прийде`}
          </Link>
        )}
      />
      <p className="text-sm text-muted">
        Заняття створюються автоматично з розкладу груп на 8 тижнів уперед. Змінити дні та час можна в <Link className="underline" href="/admin/groups">Групах</Link>.
      </p>

      <details className="card">
        <summary className="cursor-pointer font-semibold">Скасувати заняття на період (відпустка, свята)</summary>
        <form action={cancelRange} className="mt-4 grid grid-cols-2 gap-3">
          <label className="label">З<input className="input" type="date" name="from" required /></label>
          <label className="label">По<input className="input" type="date" name="to" required /></label>
          <button className="btn-danger col-span-2">Скасувати всі заняття в цей період</button>
          <p className="col-span-2 text-xs text-muted">Ні в кого заняття не списуються. Клієнтам повідомте самі.</p>
        </form>
      </details>
    </div>
  );
}
