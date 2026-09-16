import { createLocalTrackingCustomerHttpHandler } from "../../../server/local-tracking-customer-http.server.ts";

const handler = createLocalTrackingCustomerHttpHandler();

export async function GET(request: Request, context: { params: Promise<{ reference: string }> }): Promise<Response> {
  const { reference } = await context.params;
  return handler(request, reference);
}
