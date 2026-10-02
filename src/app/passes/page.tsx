import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { enabledProviders } from "@/lib/payments";
import { formatMoney } from "@/lib/format";
import type { PassType } from "@/lib/types";
import { startCheckout } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Klippekort" };

export default async function PassesPage({ searchParams }: { searchParams: Promise<{ cancelled?: string; error?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("pass_types").select("*").eq("active", true).order("sort_order");
  const passTypes = (data ?? []) as PassType[];
  const providers = enabledProviders().map((p) => ({ id: p.id, label: p.label }));
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-semibold">Klippekort</h1>
      <p className="mt-1 text-muted">Gyldig i 30 dager fra første time du går på.</p>
      {params.cancelled && <p className="card mt-4">Betalingen ble avbrutt. Du er ikke belastet.</p>}
      {params.error && <p className="card mt-4 text-danger">Noe gikk galt. Prøv igjen.</p>}

      <div className="mt-6 space-y-3">
        {passTypes.map((pt) => (
          <div key={pt.id} className="card">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">{pt.name}</h2>
              <span className="text-lg font-semibold">{formatMoney(pt.price_minor, pt.currency)}</span>
            </div>
            <p className="text-sm text-muted">{pt.visits} {pt.visits === 1 ? "time" : "timer"} · {pt.valid_days} dager</p>
            {pt.description && <p className="mt-1 text-sm">{pt.description}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {!user ? (
                <Link className="btn" href="/login?next=/passes">Logg inn for å kjøpe</Link>
              ) : providers.length === 0 ? (
                <p className="text-sm text-muted">Nettbetaling er ikke satt opp ennå.</p>
              ) : (
                providers.map((p) => (
                  <form key={p.id} action={startCheckout}>
                    <input type="hidden" name="passTypeId" value={pt.id} />
                    <input type="hidden" name="provider" value={p.id} />
                    <button className={p.id === "vipps" ? "btn btn-vipps" : "btn-ghost"}>
                      {p.id === "vipps" ? "Betal med Vipps" : "Betal med kort"}
                    </button>
                  </form>
                ))
              )}
            </div>
          </div>
        ))}
        {passTypes.length === 0 && <p className="text-muted">Ingen klippekort til salgs akkurat nå.</p>}
      </div>
    </div>
  );
}
