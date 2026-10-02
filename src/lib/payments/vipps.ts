import "server-only";
import type { PaymentProvider } from "./types";

// Vipps MobilePay ePayment API.
// Docs: https://developer.vippsmobilepay.com/docs/APIs/epayment-api/
const baseUrl = () =>
  process.env.VIPPS_ENV === "production" ? "https://api.vipps.no" : "https://apitest.vipps.no";

function baseHeaders(): Record<string, string> {
  return {
    "Ocp-Apim-Subscription-Key": process.env.VIPPS_SUBSCRIPTION_KEY!,
    "Merchant-Serial-Number": process.env.VIPPS_MERCHANT_SERIAL_NUMBER!,
    "Vipps-System-Name": "booking-app",
    "Vipps-System-Version": "0.1.0",
  };
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const res = await fetch(`${baseUrl()}/accesstoken/get`, {
    method: "POST",
    headers: {
      ...baseHeaders(),
      client_id: process.env.VIPPS_CLIENT_ID!,
      client_secret: process.env.VIPPS_CLIENT_SECRET!,
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Vipps token request failed: ${res.status}`);
  const body = (await res.json()) as { access_token: string; expires_in: string | number };
  cachedToken = { value: body.access_token, expiresAt: Date.now() + Number(body.expires_in) * 1000 };
  return cachedToken.value;
}

async function vipps(path: string, init: { method: string; body?: unknown; idempotencyKey?: string }) {
  const headers: Record<string, string> = {
    ...baseHeaders(),
    Authorization: `Bearer ${await accessToken()}`,
    "Content-Type": "application/json",
  };
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;
  const res = await fetch(`${baseUrl()}/epayment/v1${path}`, {
    method: init.method,
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Vipps ${init.method} ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

type VippsPayment = {
  state: "CREATED" | "AUTHORIZED" | "ABORTED" | "EXPIRED" | "TERMINATED";
  aggregate: { capturedAmount: { value: number; currency: string } };
};

export const vippsProvider: PaymentProvider = {
  id: "vipps",
  label: "Vipps",
  isConfigured: () =>
    Boolean(
      process.env.VIPPS_CLIENT_ID && process.env.VIPPS_CLIENT_SECRET &&
      process.env.VIPPS_SUBSCRIPTION_KEY && process.env.VIPPS_MERCHANT_SERIAL_NUMBER,
    ),

  async createCheckout(input) {
    // Our payment id doubles as the Vipps reference (8-64 chars, a-z, 0-9, '-').
    const reference = input.paymentId;
    const body = (await vipps("/payments", {
      method: "POST",
      idempotencyKey: `create-${reference}`,
      body: {
        amount: { currency: input.currency, value: input.amountMinor },
        paymentMethod: { type: "WALLET" },
        // Prefills the Vipps app with the client's number.
        ...(input.customerPhone ? { customer: { phoneNumber: input.customerPhone } } : {}),
        reference,
        returnUrl: input.returnUrl,
        userFlow: "WEB_REDIRECT",
        paymentDescription: input.description.slice(0, 100),
      },
    })) as { redirectUrl: string };
    return { redirectUrl: body.redirectUrl, providerRef: reference };
  },

  async getStatus(reference, amountMinor, currency) {
    let payment = (await vipps(`/payments/${reference}`, { method: "GET" })) as VippsPayment;
    if (payment.aggregate.capturedAmount.value >= amountMinor) return "paid";
    if (payment.state === "AUTHORIZED") {
      // Passes are delivered immediately, so capture straight away.
      await vipps(`/payments/${reference}/capture`, {
        method: "POST",
        idempotencyKey: `capture-${reference}`,
        body: { modificationAmount: { currency, value: amountMinor } },
      });
      payment = (await vipps(`/payments/${reference}`, { method: "GET" })) as VippsPayment;
      return payment.aggregate.capturedAmount.value >= amountMinor ? "paid" : "pending";
    }
    if (payment.state === "CREATED") return "pending";
    return "failed";
  },
};
