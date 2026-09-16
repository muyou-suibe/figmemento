import { handleLocalPersistentDigitalDownload } from "../../../../../server/local-persistent-digital-download.server.ts";

interface RouteContext { params: Promise<{ reference: string }> }

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { reference } = await context.params;
  return handleLocalPersistentDigitalDownload(request, reference);
}

export async function HEAD(request: Request, context: RouteContext): Promise<Response> {
  const { reference } = await context.params;
  return handleLocalPersistentDigitalDownload(request, reference);
}
