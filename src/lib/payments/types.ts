export type ProviderId = "stripe" | "vipps";

export type CheckoutInput = {
  paymentId: string;
  amountMinor: number;
  currency: string;
  description: string;
  customerEmail?: string | null;
  /** Digits only, e.g. 4791234567. */
  customerPhone?: string | null;
  returnUrl: string;
  cancelUrl: string;
};

export type ProviderStatus = "paid" | "pending" | "failed";

/**
 * Everything the app needs from a payment provider. Add a provider by
 * implementing this and registering it in ./index.ts.
 */
export interface PaymentProvider {
  id: ProviderId;
  label: string;
  isConfigured(): boolean;
  /** Starts a hosted checkout. Returns where to send the customer. */
  createCheckout(input: CheckoutInput): Promise<{ redirectUrl: string; providerRef: string }>;
  /**
   * Asks the provider for the real state of a payment (never trust a
   * webhook body or return URL alone). May finish the payment, e.g. a Vipps capture.
   */
  getStatus(providerRef: string, amountMinor: number, currency: string): Promise<ProviderStatus>;
}
