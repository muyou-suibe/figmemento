import { createLocalCheckoutHttpHandler } from "../../server/local-checkout-http.server.ts";

const handleLocalCheckout = createLocalCheckoutHttpHandler();

export async function POST(request: Request): Promise<Response> {
  return handleLocalCheckout(request);
}

export async function GET(request: Request): Promise<Response> {
  return handleLocalCheckout(request);
}
