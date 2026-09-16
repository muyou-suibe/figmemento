import { createLocalOrderReadHttpHandler } from "../../../server/local-order-http.server.ts";

const handleLocalOrderRead = createLocalOrderReadHttpHandler();

interface LocalOrderReadRouteContext {
  params: Promise<{ reference: string }>;
}

export async function GET(request: Request, context: LocalOrderReadRouteContext): Promise<Response> {
  const { reference } = await context.params;
  return handleLocalOrderRead(request, reference);
}
