import "server-only";
import Stripe from "stripe";
import type { PaymentProvider } from "./types";

let client: Stripe | null = null;
export function stripeClient() {
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return client;
}

export const stripeProvider: PaymentProvider = {
  id: "stripe",
  label: "Card (Stripe)",
  isConfigured: () => Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),

  async createCheckout(input) {
    const session = await stripeClient().checkout.sessions.create({
      mode: "payment",
      customer_email: input.customerEmail ?? undefined,
      client_reference_id: input.paymentId,
      metadata: { payment_id: input.paymentId },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: input.currency.toLowerCase(),
          unit_amount: input.amountMinor,
          product_data: { name: input.description },
        },
      }],
      success_url: input.returnUrl,
      cancel_url: input.cancelUrl,
    }, { idempotencyKey: `checkout-${input.paymentId}` });
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { redirectUrl: session.url, providerRef: session.id };
  },

  async getStatus(providerRef) {
    const session = await stripeClient().checkout.sessions.retrieve(providerRef);
    if (session.payment_status === "paid" || session.payment_status === "no_payment_required") return "paid";
    if (session.status === "expired") return "failed";
    return "pending";
  },
};
