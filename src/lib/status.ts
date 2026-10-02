import type { ClientPass } from "@/lib/types";

/** What a client has left across all their usable passes. */
export function passSummary(passes: ClientPass[], hasSchedule: boolean) {
  const now = new Date().toISOString();
  const usable = passes.filter(
    (p) => p.status === "active" && p.visits_left > 0 && (!p.expires_at || p.expires_at >= now),
  );
  const visitsLeft = usable.reduce((n, p) => n + p.visits_left, 0);
  const started = usable.filter((p) => p.expires_at).sort((a, b) => a.expires_at!.localeCompare(b.expires_at!));
  return {
    usable,
    visitsLeft,
    expiresAt: started[0]?.expires_at ?? null,
    notStarted: usable.length > 0 && started.length === 0,
    needsNewPass: visitsLeft === 0 && (hasSchedule || passes.length > 0),
    low: visitsLeft === 1,
  };
}
