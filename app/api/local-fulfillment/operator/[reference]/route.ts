import { createLocalFulfillmentOperatorHttpHandler } from "../../../../server/local-fulfillment-operator-http.server.ts";

const handleLocalFulfillmentOperatorHttp = createLocalFulfillmentOperatorHttpHandler();

interface LocalFulfillmentOperatorRouteContext {
  params: Promise<{ reference: string }>;
}

export async function GET(request: Request, context: LocalFulfillmentOperatorRouteContext): Promise<Response> {
  const { reference } = await context.params;
  return handleLocalFulfillmentOperatorHttp(request, reference);
}

export async function POST(request: Request, context: LocalFulfillmentOperatorRouteContext): Promise<Response> {
  const { reference } = await context.params;
  return handleLocalFulfillmentOperatorHttp(request, reference);
}
