import { createLocalTrackingOperatorHttpHandler } from "../../../../server/local-tracking-operator-http.server.ts";

const handle = createLocalTrackingOperatorHttpHandler();
interface Context { params: Promise<{ reference: string }> }
export async function GET(request: Request, context: Context) { return handle(request, (await context.params).reference); }
export async function POST(request: Request, context: Context) { return handle(request, (await context.params).reference); }
