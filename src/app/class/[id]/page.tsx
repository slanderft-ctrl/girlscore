import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dayKey, formatDateTime, formatTime, weeklyLabel } from "@/lib/format";
import { Notice } from "@/lib/messages";
import type { Attendance, GroupTime, Session } from "@/lib/types";
import { addSlot, bookSingle, setComing } from "../../actions";

export const dynamic = "force-dynamic";

export default async function ClassPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const { id } = await params;
  const { ok, err } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: session } = await supabase.from("sessions").select("*, groups(name, location, description)").eq("id", id).single();
  if (!session) notFound();
  const s = session as Session & { groups: { name: string; location: string | null; description: string | null } };

  const [{ data: times }, { data: spots }, { data: me }, { data: mySlots }] = await Promise.all([
    supabase.from("group_times").select("*").eq("group_id", s.group_id).eq("active", true).order("weekday"),
    supabase.from("session_spots").select("taken").eq("session_id", id).single(),
    user ? supabase.from("attendance").select("*").eq("session_id", id).eq("client_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    user ? supabase.from("schedule_slots").select("group_time_id").eq("client_id", user.id).is("ended_at", null) : Promise.resolve({ data: [] }),
  ]);
  const groupTimes = (times ?? []) as GroupTime[];
  const { data: memberCounts } = await supabase.from("group_time_spots").select("*").in("group_time_id", groupTimes.map((t) => t.id));
  const members = new Map((memberCounts ?? []).map((m) => [m.group_time_id as string, m.members as number]));
  const inSchedule = new Set((mySlots ?? []).map((x) => x.group_time_id as string));
  const mine = me as Attendance | null;
  const left = s.capacity - ((spots?.taken as number) ?? 0);
  const started = new Date(s.starts_at).getTime() <= Date.now();
  const cutoffPassed = new Date(s.starts_at).getTime() - 12 * 3600e3 <= Date.now();
  const back = `/class/${id}`;
  const login = `/login?next=${encodeURIComponent(back)}`;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Link href={`/?week=${dayKey(s.starts_at)}`} className="text-sm underline">← Timeplan</Link>
      <div>
        <h1 className="text-2xl font-semibold">{s.groups.name}</h1>
        <p className="text-lg">{formatDateTime(s.starts_at)}–{formatTime(s.ends_at)}</p>
        <p className="text-muted">
          {s.groups.location ? `${s.groups.location} · ` : ""}
          {s.cancelled ? "Avlyst" : left > 0 ? `${left} ledige plasser` : "Full"}
        </p>
        {s.groups.description && <p className="mt-2 text-sm">{s.groups.description}</p>}
      </div>
      <Notice ok={ok} err={err} />

      {/* This one class */}
      {!s.cancelled && !started && (
        <section className="card space-y-3">
          {mine && (mine.status === "coming") ? (
            <>
              <p className="font-medium text-accent">Du er påmeldt denne timen.</p>
              <form action={setComing}>
                <input type="hidden" name="sessionId" value={id} />
                <input type="hidden" name="coming" value="0" />
                <input type="hidden" name="back" value={back} />
                <button className="btn-ghost w-full">Jeg kommer ikke</button>
              </form>
              <p className="text-xs text-muted">
                {cutoffPassed
                  ? "Det er mindre enn 12 timer igjen, så timen blir trukket uansett. Men plassen går til noen andre."
                  : "Gi beskjed senest 12 timer før, så blir ikke timen trukket."}
              </p>
            </>
          ) : mine && mine.status === "absent" ? (
            <>
              <p>Du har sagt at du ikke kommer.</p>
              <Link href="/?makeup=1" className="btn w-full">Ta igjen timen en annen dag</Link>
              {!cutoffPassed && left > 0 && (
                <form action={setComing}>
                  <input type="hidden" name="sessionId" value={id} />
                  <input type="hidden" name="coming" value="1" />
                  <input type="hidden" name="back" value={back} />
                  <button className="btn-ghost w-full">Jeg kommer likevel</button>
                </form>
              )}
            </>
          ) : mine && mine.status === "no_pass" ? (
            <>
              <p>Du står på denne timen, men trenger et nytt klippekort.</p>
              <Link href="/passes" className="btn w-full">Kjøp klippekort</Link>
            </>
          ) : left > 0 ? (
            user ? (
              <form action={bookSingle}>
                <input type="hidden" name="sessionId" value={id} />
                <input type="hidden" name="back" value={back} />
                <button className="btn-ghost w-full">Bare denne gangen</button>
                <p className="mt-1 text-xs text-muted">Bruker én time fra klippekortet ditt.</p>
              </form>
            ) : (
              <Link href={login} className="btn-ghost w-full">Logg inn for å melde deg på</Link>
            )
          ) : (
            <p className="text-muted">Timen er full.</p>
          )}
        </section>
      )}

      {/* Every week */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Gå fast på {s.groups.name}</h2>
        <p className="text-sm text-muted">Legg tiden til i timeplanen din, så er du påmeldt hver uke. Du trenger bare å si fra når du ikke kommer.</p>
        {groupTimes.map((t) => {
          const full = (members.get(t.id) ?? 0) >= s.capacity;
          return (
            <div key={t.id} className="card flex items-center justify-between gap-2">
              <span className="capitalize">{weeklyLabel(t.weekday, t.start_time)}–{t.end_time.slice(0, 5)}</span>
              {inSchedule.has(t.id) ? (
                <span className="text-sm font-medium text-accent">I timeplanen din ✓</span>
              ) : full ? (
                <span className="text-sm text-muted">Full</span>
              ) : user ? (
                <form action={addSlot}>
                  <input type="hidden" name="groupTimeId" value={t.id} />
                  <input type="hidden" name="back" value={back} />
                  <button className="btn-sm">Gå fast</button>
                </form>
              ) : (
                <Link href={login} className="btn-sm">Gå fast</Link>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
