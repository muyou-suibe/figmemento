import { handleAdminSettings } from "../../../server/admin-settings-http.server.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleAdminSettings(request);
}

export async function PATCH(request: Request) {
  return handleAdminSettings(request);
}
