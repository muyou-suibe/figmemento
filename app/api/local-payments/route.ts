import { createLocalPaymentMutationHttpHandler } from "../../server/local-payment-http.server.ts";

const handleLocalPaymentMutation = createLocalPaymentMutationHttpHandler();

export async function POST(request: Request): Promise<Response> {
  return handleLocalPaymentMutation(request);
}
