import { createLocalAnalyticsHttpHandler } from "../../server/local-analytics-http.server.ts";

const handle = createLocalAnalyticsHttpHandler();

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}
