import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripeProvider } from "./stripe";
import { vippsProvider } from "./vipps";
import type { PaymentProvider, ProviderId } from "./types";

const providers: Record<ProviderId, PaymentProvider> = {
  vipps: vippsProvider,
  stripe: stripeProvider,
};

/** Providers with credentials set, Vipps first when available. */
export function enabledProviders() {
  return Object.values(providers).filter((p) => p.isConfigured());
}

export function getProvider(id: string): PaymentProvider | null {
  const p = providers[id as ProviderId];
  return p && p.isConfigured() ? p : null;
}

/**
 * Checks a payment with its provider and, once paid, issues the pass.
 * Idempotent: webhooks and the return page can both call it.
 */
export async function settlePayment(paymentId: string) {
  const db = createAdminClient();
  const { data: payment } = await db.from("payments").select("*").eq("id", paymentId).single();
  if (!payment) return "failed" as const;
  if (payment.status === "paid") return "paid" as const;
  if (!payment.provider_ref) return "pending" as const;

  const provider = getProvider(payment.provider);
  if (!provider) return "pending" as const;

  const status = await provider.getStatus(payment.provider_ref, payment.amount_minor, payment.currency);
  if (status === "paid") {
    const { error } = await db.rpc("fulfil_payment", { p_payment_id: paymentId });
    if (error) throw error;
  } else if (status === "failed" && payment.status === "pending") {
    await db.from("payments").update({ status: "failed" }).eq("id", paymentId);
  }
  return status;
}

export type { ProviderId };
