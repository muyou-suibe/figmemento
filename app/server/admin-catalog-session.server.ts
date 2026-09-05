import type {
  AdminAuthorizationResult,
  AdminSessionVerifier,
} from "../application/admin-catalog-boundary.ts";
import { verifySignedAdminSession } from "../application/admin-session.ts";
import { readAdminPassword } from "../config/server.ts";

// This adapter belongs to the server composition layer. Client components must
// never import it or receive the signed administrator token it verifies.
export class ExistingAdminSessionVerifier implements AdminSessionVerifier {
  private readonly token: string | null | undefined;

  constructor(token: string | null | undefined) {
    this.token = token;
  }

  async verifyAdminSession(): Promise<AdminAuthorizationResult> {
    return (await verifySignedAdminSession(this.token, readAdminPassword()))
      ? {
          status: "authorized",
          principal: { role: "admin", identity: "configured-admin" },
        }
      : { status: "unauthorized" };
  }
}
