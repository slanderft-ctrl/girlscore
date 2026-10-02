import { NextResponse } from "next/server";
import { settlePayment } from "@/lib/payments";

// Vipps ePayment webhook. The body is only used to learn which payment
// changed; settlePayment() asks Vipps for the real state before acting.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { reference?: string } | null;
  const reference = body?.reference;
  if (reference && /^[0-9a-f-]{36}$/.test(reference)) {
    await settlePayment(reference);
  }
  return NextResponse.json({ received: true });
}
