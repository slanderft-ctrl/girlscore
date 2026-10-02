import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { WeekCalendar, weekRange } from "@/components/week-calendar";
import { weekStart } from "@/lib/format";
import { Notice } from "@/lib/messages";
import type { Attendance, Session } from "@/lib/types";

export const dynamic = "force-dynamic";

const myLabel: Record<string, string> = {
  coming: "Du kommer ✓",
  absent: "Du kommer ikke",
  no_pass: "Trenger nytt klippekort",
  attended: "Du var her ✓",
  no_show: "Ikke møtt",
};

export default async function CalendarPage({ searchParams }: {
  searchParams: Promise<{ week?: string; ok?: string; err?: string; makeup?: string }>;
}) {
  const params = await searchParams;
  const week = weekStart(params.week);
  const { from, to } = weekRange(week);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: sessions } = await supabase.from("sessions").select("*, groups(name, location)")
    .gte("starts_at", from).lt("starts_at", to).eq("cancelled", false).order("starts_at");
  const ids = (sessions ?? []).map((s) => s.id as string);
  const [{ data: spots }, { data: mine }] = await Promise.all([
    supabase.from("session_spots").select("*").in("session_id", ids),
    user
      ? supabase.from("attendance").select("*").eq("client_id", user.id).in("session_id", ids)
      : Promise.resolve({ data: [] as Attendance[] }),
  ]);
  const taken = new Map((spots ?? []).map((s) => [s.session_id as string, s.taken as number]));
  const myRows = new Map(((mine ?? []) as Attendance[]).map((a) => [a.session_id, a]));
  const now = Date.now();

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">{params.makeup ? "Velg en annen time" : "Timeplan"}</h1>
        <p className="text-muted">
          {params.makeup
            ? "Velg en time med ledig plass for å ta igjen timen du ikke kommer på."
            : "Trykk på en time for å se gruppen og melde deg på."}
        </p>
      </div>
      <Notice ok={params.ok} err={params.err} />
      {!user && (
        <div className="card mb-4 flex flex-wrap items-center justify-between gap-2">
          <span>Ny her? Velg en time, meld deg på og betal med Vipps.</span>
          <Link href="/passes" className="btn-ghost">Se priser</Link>
        </div>
      )}
      <WeekCalendar
        week={week}
        sessions={(sessions ?? []) as Session[]}
        basePath="/"
        renderSession={(s) => {
          const left = s.capacity - (taken.get(s.id) ?? 0);
          const me = myRows.get(s.id);
          const past = new Date(s.starts_at).getTime() <= now;
          return (
            <Link href={`/class/${s.id}`} className="block text-xs">
              {me && myLabel[me.status] ? (
                <span className={me.status === "coming" ? "font-medium text-accent" : "text-muted"}>{myLabel[me.status]}</span>
              ) : past ? (
                <span className="text-muted">Ferdig</span>
              ) : left <= 0 ? (
                <span className="text-muted">Full</span>
              ) : (
                <span className="underline">{left} ledig{left === 1 ? "" : "e"} plass{left === 1 ? "" : "er"}</span>
              )}
            </Link>
          );
        }}
      />
    </div>
  );
}
