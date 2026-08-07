export type StripeCheckoutSession = {
  id: string;
  url: string | null;
};

export type StripeWebhookSession = {
  id: string;
  payment_status?: string;
  client_reference_id?: string | null;
  metadata?: { order_number?: string };
  payment_intent?: string | null;
};

export type StripeWebhookEvent = {
  type?: string;
  data?: { object?: StripeWebhookSession };
};
