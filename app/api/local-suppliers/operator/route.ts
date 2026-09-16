import { createLocalSupplierOperatorHttpHandler } from "../../../server/local-supplier-operator-http.server.ts";

const handler = createLocalSupplierOperatorHttpHandler();

export async function GET(request: Request): Promise<Response> {
  return handler(request);
}

export async function POST(request: Request): Promise<Response> {
  return handler(request);
}
