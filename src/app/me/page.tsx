import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dayKey, formatDate, formatDateTime, formatPhone, weeklyLabel } from "@/lib/format";
import { Notice } from "@/lib/messages";
import { passSummary } from "@/lib/status";
import type { Attendance, ClientPass, GroupTime, Pause, Session } from "@/lib/types";
import { addPause, removePause, removeSlot, setComing, signOut, updateMyProfile } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Min side" };

type SlotRow = { id: string; group_time_id: string; group_times: GroupTime & { groups: { name: string } } };
type Row = Attendance & { sessions: Session & { groups: { name: string } } };

const statusText: Record<string, string> = {
  coming: "Kommer",
  absent: "Kommer ikke",
  no_pass: "Trenger klippekort",
};

export default async function MePage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { ok, err } = await searchParams;
  const user = await requireUser("/me");
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const [{ data: passes }, { data: slots }, { data: rows }, { data: pauses }] = await Promise.all([
    supabase.from("client_passes").select("*, pass_types(name)").eq("client_id", user.id).order("created_at", { ascending: false }),
    supabase.from("schedule_slots").select("id, group_time_id, group_times(*, groups(name))").eq("client_id", user.id).is("ended_at", null),
    supabase.from("attendance").select("*, sessions!inner(*, groups(name))").eq("client_id", user.id)
      .gte("sessions.starts_at", nowIso),
    supabase.from("pauses").select("*").eq("client_id", user.id).gte("ends_on", dayKey(new Date())).order("starts_on"),
  ]);
  const mySlots = ((slots ?? []) as unknown as SlotRow[])
    .sort((a, b) => a.group_times.weekday - b.group_times.weekday || a.group_times.start_time.localeCompare(b.group_times.start_time));
  const upcoming = ((rows ?? []) as unknown as Row[])
    .filter((r) => !r.sessions.cancelled)
    .sort((a, b) => a.sessions.starts_at.localeCompare(b.sessions.starts_at))
    .slice(0, 8);
  const summary = passSummary((passes ?? []) as ClientPass[], mySlots.length > 0);

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Hei{user.full_name ? `, ${user.full_name}` : ""}!</h1>
          <p className="text-sm text-muted">{formatPhone(user.phone)}</p>
        </div>
        <form action={signOut}><button className="btn-ghost text-sm">Logg ut</button></form>
      </div>
      <Notice ok={ok} err={err} />

      {!user.full_name && (
        <form action={updateMyProfile} className="card space-y-3">
          <p className="font-medium">Hva heter du?</p>
          <input type="hidden" name="back" value="/me" />
          <input className="input" name="full_name" placeholder="Navn" required autoComplete="name" />
          <input className="input" name="email" type="email" placeholder="E-post for kvitteringer (valgfritt)" autoComplete="email" />
          <button className="btn w-full">Lagre</button>
        </form>
      )}

      {/* Pass status */}
      <section className={`card ${summary.needsNewPass || summary.low ? "border-accent" : ""}`}>
        {summary.visitsLeft > 0 ? (
          <>
            <div className="text-sm text-muted">Klippekort</div>
            <div className="text-3xl font-semibold">{summary.visitsLeft} {summary.visitsLeft === 1 ? "time" : "timer"} igjen</div>
            <div className="text-sm text-muted">
              {summary.notStarted ? "Gyldig i 30 dager fra første time." : `Gyldig til ${formatDate(summary.expiresAt!)}`}
            </div>
            {summary.low && <Link href="/passes" className="btn mt-3 w-full">Forleng klippekortet</Link>}
          </>
        ) : (
          <>
            <div className="text-lg font-semibold">{summary.needsNewPass ? "Du trenger et nytt klippekort" : "Du har ikke klippekort ennå"}</div>
            <p className="text-sm text-muted">
              {mySlots.length > 0 ? "Plassen din i timeplanen beholdes, men du blir ikke påmeldt før du har kjøpt nytt." : "Kjøp et klippekort for å melde deg på timer."}
            </p>
            <Link href="/passes" className="btn mt-3 w-full">Kjøp klippekort</Link>
          </>
        )}
      </section>

      {/* My schedule */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Min timeplan</h2>
        {mySlots.length === 0 ? (
          <div className="card text-sm">
            Du går ikke fast på noen gruppe ennå. <Link href="/" className="underline">Velg en time i timeplanen</Link> og trykk «Gå fast».
          </div>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {mySlots.map((sl) => (
              <li key={sl.id} className="flex items-center justify-between gap-2 p-3">
                <span><span className="capitalize">{weeklyLabel(sl.group_times.weekday, sl.group_times.start_time)}</span> · {sl.group_times.groups.name}</span>
                <form action={removeSlot}>
                  <input type="hidden" name="groupTimeId" value={sl.group_time_id} />
                  <input type="hidden" name="back" value="/me" />
                  <button className="text-sm underline">Fjern</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <Link href="/" className="mt-2 inline-block text-sm underline">+ Legg til en tid</Link>
      </section>

      {/* Upcoming */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Neste timer</h2>
        {upcoming.length === 0 ? <p className="text-sm text-muted">Ingen kommende timer.</p> : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {upcoming.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 p-3">
                <Link href={`/class/${r.session_id}`}>
                  <div className="font-medium capitalize">{formatDateTime(r.sessions.starts_at)}</div>
                  <div className="text-sm text-muted">{r.sessions.groups.name}{r.kind === "single" ? " · én gang" : ""} · {statusText[r.status] ?? r.status}</div>
                </Link>
                {r.status === "coming" && (
                  <form action={setComing}>
                    <input type="hidden" name="sessionId" value={r.session_id} />
                    <input type="hidden" name="coming" value="0" />
                    <input type="hidden" name="back" value="/me" />
                    <button className="btn-ghost text-sm">Kommer ikke</button>
                  </form>
                )}
                {r.status === "absent" && <Link href="/?makeup=1" className="text-sm underline">Ta igjen</Link>}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">Si fra senest 12 timer før, så blir ikke timen trukket.</p>
      </section>

      {/* Pause */}
      {mySlots.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Ferie eller syk?</h2>
          {((pauses ?? []) as Pause[]).map((p) => (
            <form key={p.id} action={removePause} className="card mb-2 flex items-center justify-between">
              <span>Pause {formatDate(`${p.starts_on}T12:00:00Z`)} – {formatDate(`${p.ends_on}T12:00:00Z`)}</span>
              <input type="hidden" name="pauseId" value={p.id} />
              <input type="hidden" name="back" value="/me" />
              <button className="text-sm underline">Fjern</button>
            </form>
          ))}
          <form action={addPause} className="card grid grid-cols-2 gap-3">
            <input type="hidden" name="back" value="/me" />
            <label className="label">Fra<input className="input" type="date" name="from" required min={dayKey(new Date())} /></label>
            <label className="label">Til<input className="input" type="date" name="to" required min={dayKey(new Date())} /></label>
            <button className="btn-ghost col-span-2">Legg inn pause</button>
            <p className="col-span-2 text-xs text-muted">Du blir meldt av alle timene dine i perioden. Klippekortet løper som vanlig.</p>
          </form>
        </section>
      )}
    </div>
  );
}
