import { createLocalOrderCreateHttpHandler } from "../../server/local-order-http.server.ts";

const handleLocalOrderCreate = createLocalOrderCreateHttpHandler();

export async function POST(request: Request): Promise<Response> {
  return handleLocalOrderCreate(request);
}
