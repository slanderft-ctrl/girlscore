"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider } from "@/lib/payments";

async function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

export async function startCheckout(formData: FormData) {
  const passTypeId = String(formData.get("passTypeId"));
  const provider = getProvider(String(formData.get("provider")));
  const user = await requireUser("/passes");
  if (!provider) redirect("/passes?error=provider");

  const db = createAdminClient();
  const { data: passType } = await db.from("pass_types").select("*")
    .eq("id", passTypeId).eq("active", true).single();
  if (!passType) redirect("/passes?error=pass");

  const { data: payment, error } = await db.from("payments").insert({
    client_id: user.id,
    pass_type_id: passType.id,
    provider: provider.id,
    amount_minor: passType.price_minor,
    currency: passType.currency,
  }).select().single();
  if (error || !payment) throw error ?? new Error("could not create payment");

  const base = await siteUrl();
  const { redirectUrl, providerRef } = await provider.createCheckout({
    paymentId: payment.id,
    amountMinor: passType.price_minor,
    currency: passType.currency,
    description: passType.name,
    customerEmail: user.email,
    customerPhone: user.phone?.replace(/\D/g, "") || null,
    returnUrl: `${base}/checkout/return?payment=${payment.id}`,
    cancelUrl: `${base}/passes?cancelled=1`,
  });
  await db.from("payments").update({ provider_ref: providerRef }).eq("id", payment.id);
  redirect(redirectUrl);
}
