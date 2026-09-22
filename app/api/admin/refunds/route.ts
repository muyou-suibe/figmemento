import { handleAdminRefund } from "../../../server/admin-refunds-http.server.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleAdminRefund(request);
}
