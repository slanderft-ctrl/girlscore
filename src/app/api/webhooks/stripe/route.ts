import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripeClient } from "@/lib/payments/stripe";
import { settlePayment } from "@/lib/payments";

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(
      await req.text(),
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      const paymentId = event.data.object.client_reference_id;
      if (paymentId) await settlePayment(paymentId);
      break;
    }
  }
  return NextResponse.json({ received: true });
}
