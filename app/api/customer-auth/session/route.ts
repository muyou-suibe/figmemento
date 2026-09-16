import { handleCustomerAuthSession } from "../../../server/customer-auth-http.server.ts";

export async function GET(request: Request): Promise<Response> {
  return handleCustomerAuthSession(request);
}
