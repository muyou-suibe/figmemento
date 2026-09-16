import { createLocalNewsletterHttpHandler } from "../../server/local-newsletter-http.server.ts";

const handleLocalNewsletter = createLocalNewsletterHttpHandler();

export async function POST(request: Request): Promise<Response> {
  return handleLocalNewsletter(request);
}

export async function GET(request: Request): Promise<Response> {
  return handleLocalNewsletter(request);
}
