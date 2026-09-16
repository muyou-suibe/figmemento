import { handleCustomerAuthCredentialsMutation } from "../../../server/customer-auth-http.server.ts";

export async function POST(request: Request): Promise<Response> {
  return handleCustomerAuthCredentialsMutation(request, "signIn");
}
