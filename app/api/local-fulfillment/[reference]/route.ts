import { createLocalFulfillmentCustomerHttpHandler } from "../../../server/local-fulfillment-customer-http.server.ts";

const handleLocalFulfillmentCustomerHttp = createLocalFulfillmentCustomerHttpHandler();

interface LocalFulfillmentRouteContext {
  params: Promise<{ reference: string }>;
}

export async function GET(request: Request, context: LocalFulfillmentRouteContext): Promise<Response> {
  const { reference } = await context.params;
  return handleLocalFulfillmentCustomerHttp(request, reference);
}

export async function POST(request: Request, context: LocalFulfillmentRouteContext): Promise<Response> {
  const { reference } = await context.params;
  return handleLocalFulfillmentCustomerHttp(request, reference);
}
