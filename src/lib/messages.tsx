// Feedback shown after client actions (Norwegian).
export const okMessages: Record<string, string> = {
  slot_added: "Lagt til i timeplanen din. Du er påmeldt alle timene fremover.",
  slot_removed: "Fjernet fra timeplanen din.",
  coming: "Supert, du er påmeldt.",
  absent: "Registrert at du ikke kommer. Timen blir ikke trukket.",
  absent_used: "Registrert. Det var mindre enn 12 timer igjen, så timen blir trukket, men plassen din går til andre.",
  booked: "Du er påmeldt denne timen.",
  paused: "Pausen er lagt inn.",
  unpaused: "Pausen er fjernet.",
  saved: "Lagret.",
};

export const errorMessages: Record<string, string> = {
  group_full: "Denne gruppen er full.",
  full: "Timen er full.",
  no_pass: "Du trenger et klippekort med timer igjen.",
  too_late: "Det er for sent å melde seg på igjen.",
  already_started: "Timen har allerede startet.",
  not_available: "Timen er ikke tilgjengelig.",
  not_booked: "Du er ikke påmeldt denne timen.",
  not_signed_in: "Logg inn først.",
  error: "Noe gikk galt. Prøv igjen.",
};

export function Notice({ ok, err }: { ok?: string; err?: string }) {
  if (err) return <p className="card mb-4 border-danger text-danger">{errorMessages[err] ?? errorMessages.error}</p>;
  if (ok && okMessages[ok]) return <p className="card mb-4">{okMessages[ok]}</p>;
  return null;
}
