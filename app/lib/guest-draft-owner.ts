import {
  createGuestDraftOwnerContextCodec,
  type GuestDraftOwnerContextConfiguration,
  type GuestDraftOwnerContextDependencies,
  type GuestDraftOwnerContextIssueResult,
  type GuestDraftOwnerContextVerification,
} from "../application/guest-draft-owner-context.ts";
import { readGuestDraftOwnerContextConfig, type RuntimeEnvironment } from "../config/server.ts";

const guestDraftOwnerCookieName = "photogift-guest-draft-owner";

export interface GuestDraftOwnerService {
  issueGuestDraftOwner(): Promise<GuestDraftOwnerContextIssueResult>;
  verifyGuestDraftOwnerContext(
    context: string | null | undefined,
  ): Promise<GuestDraftOwnerContextVerification>;
  ensureGuestDraftOwnerContext(
    context: string | null | undefined,
  ): Promise<GuestDraftOwnerContextEnsureResult>;
  getSetCookieHeader(context: string, runtimeMode?: string): string;
}

export type GuestDraftOwnerContextEnsureResult =
  | { status: "existing"; value: Extract<GuestDraftOwnerContextVerification, { status: "valid" }> }
  | { status: "issued"; value: Extract<GuestDraftOwnerContextIssueResult, { status: "issued" }>["value"] }
  | { status: "invalid" | "expired" | "source_failure" };

/** Server-only constructor; framework routes later decide when to set the cookie. */
export function createGuestDraftOwnerService(
  configuration: GuestDraftOwnerContextConfiguration,
  dependencies: GuestDraftOwnerContextDependencies = {},
): GuestDraftOwnerService {
  const codec = createGuestDraftOwnerContextCodec(configuration, dependencies);
  return {
    issueGuestDraftOwner: () => codec.issueGuestDraftOwner(),
    verifyGuestDraftOwnerContext: (context) => codec.verifyGuestDraftOwnerContext(context),
    async ensureGuestDraftOwnerContext(context): Promise<GuestDraftOwnerContextEnsureResult> {
      const verified = await codec.verifyGuestDraftOwnerContext(context);
      if (verified.status === "valid") return { status: "existing", value: verified };
      if (verified.status !== "missing") return { status: verified.status };
      const issued = await codec.issueGuestDraftOwner();
      return issued.status === "issued" ? issued : { status: "source_failure" };
    },
    getSetCookieHeader(context, runtimeMode = process.env.NODE_ENV): string {
      const secureAttribute = runtimeMode === "production" ? "; Secure" : "";
      return `${guestDraftOwnerCookieName}=${context}; Path=/; Max-Age=${configuration.contextLifetimeSeconds}; HttpOnly; SameSite=Lax${secureAttribute}`;
    },
  };
}

export function createConfiguredGuestDraftOwnerService(
  environment: RuntimeEnvironment = process.env,
): GuestDraftOwnerService {
  return createGuestDraftOwnerService(readGuestDraftOwnerContextConfig(environment));
}

export function getGuestDraftOwnerCookieName(): string {
  return guestDraftOwnerCookieName;
}
