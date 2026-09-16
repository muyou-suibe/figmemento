import { createLocalContactHttpHandler } from "../../server/local-contact-http.server.ts";

const handleLocalContact = createLocalContactHttpHandler();

export async function POST(request: Request): Promise<Response> {
  return handleLocalContact(request);
}

export async function GET(request: Request): Promise<Response> {
  return handleLocalContact(request);
}
