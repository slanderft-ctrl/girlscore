import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { settlePayment } from "@/lib/payments";

export const dynamic = "force-dynamic";

export default async function CheckoutReturn({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const { payment: paymentId } = await searchParams;
  const user = await requireUser("/me");
  const supabase = await createClient();
  // RLS: the user can only see their own payment.
  const { data: payment } = paymentId
    ? await supabase.from("payments").select("id, client_id").eq("id", paymentId).maybeSingle()
    : { data: null };

  const status = payment && payment.client_id === user.id ? await settlePayment(payment.id) : "failed";

  return (
    <div className="mx-auto max-w-md py-10 text-center">
      {status === "paid" && (
        <>
          <h1 className="text-2xl font-semibold">Takk!</h1>
          <p className="mt-2 text-muted">Klippekortet ditt er klart.</p>
          <Link href="/me" className="btn mt-6">Til min side</Link>
        </>
      )}
      {status === "pending" && (
        <>
          <h1 className="text-2xl font-semibold">Bekrefter betalingen…</h1>
          <p className="mt-2 text-muted">Dette tar vanligvis noen sekunder.</p>
          <Link href={`/checkout/return?payment=${paymentId}`} className="btn mt-6">Sjekk igjen</Link>
        </>
      )}
      {status === "failed" && (
        <>
          <h1 className="text-2xl font-semibold">Betalingen ble ikke fullført</h1>
          <p className="mt-2 text-muted">Du er ikke belastet.</p>
          <Link href="/passes" className="btn mt-6">Tilbake</Link>
        </>
      )}
    </div>
  );
}
