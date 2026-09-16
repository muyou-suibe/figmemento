import { handleLocalPersistentDigitalGrantActivation } from "../../../../../server/local-persistent-digital-grant.server.ts";

interface RouteContext { params: Promise<{ reference: string }> }

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { reference } = await context.params;
  return handleLocalPersistentDigitalGrantActivation(request, reference);
}
