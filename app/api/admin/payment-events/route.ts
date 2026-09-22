import { handleAdminPaymentEvents } from "../../../server/admin-payment-events-http.server.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) { return handleAdminPaymentEvents(request); }
export async function POST(request: Request) { return handleAdminPaymentEvents(request); }
