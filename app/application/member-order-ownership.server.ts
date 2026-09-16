import type { PersistentCustomerSessionIdentity } from "./customer-auth-session-persistence.server.ts";

const PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const ORDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const PUBLIC_REFERENCE_PATTERN = /^FM-LOCAL-[A-Z0-9]{16}$/;
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/;
const CAPABILITY_HASH_PATTERN = /^[0-9a-f]{64}$/;

export interface VerifiedMemberOrderSession {
  readonly kind: "verified_member_session";
  readonly projectId: string;
  /** Stable opaque customer subject derived from the durable session. */
  readonly ownerId: string;
  readonly customerId: string;
  readonly sessionId: string;
  readonly sessionStatus: "active";
  readonly expiresAt: number;
}

export type MemberOrderSessionResolution =
  | { readonly status: "authorized"; readonly session: VerifiedMemberOrderSession }
  | { readonly status: "unavailable"; readonly reason: "invalid_session" | "project_mismatch" | "expired" | "revoked" };

export interface MemberOrderBinding {
  readonly ownerKind: "customer";
  readonly projectId: string;
  readonly ownerId: string;
  readonly customerId: string;
  readonly internalOrderId: string;
  readonly publicReference: string;
  /** Only a digest crosses the persisted binding boundary. */
  readonly capabilityHash: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly version: number;
  readonly lifecycle: "active" | "expired" | "revoked";
}

export type MemberOrderReadResult =
  | { readonly status: "authorized"; readonly binding: MemberOrderBinding }
  | {
    readonly status: "unavailable";
    readonly reason: "invalid_session" | "project_mismatch" | "not_found" | "expired" | "revoked";
  };

function validProjectId(value: unknown): value is string {
  return typeof value === "string" && PROJECT_ID_PATTERN.test(value);
}

function validOpaqueId(value: unknown): value is string {
  return typeof value === "string" && OPAQUE_ID_PATTERN.test(value);
}

function validOrderId(value: unknown): value is string {
  return typeof value === "string" && ORDER_ID_PATTERN.test(value);
}

function validPublicReference(value: unknown): value is string {
  return typeof value === "string" && PUBLIC_REFERENCE_PATTERN.test(value);
}

function validTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validMemberOrderBinding(value: MemberOrderBinding): boolean {
  return value.ownerKind === "customer"
    && validProjectId(value.projectId)
    && validOpaqueId(value.ownerId)
    && validOpaqueId(value.customerId)
    && validOrderId(value.internalOrderId)
    && validPublicReference(value.publicReference)
    && CAPABILITY_HASH_PATTERN.test(value.capabilityHash)
    && validTimestamp(value.createdAt)
    && validTimestamp(value.expiresAt)
    && value.expiresAt > value.createdAt
    && Number.isSafeInteger(value.version)
    && value.version >= 1
    && (value.lifecycle === "active" || value.lifecycle === "expired" || value.lifecycle === "revoked");
}

function validSessionIdentity(value: PersistentCustomerSessionIdentity): boolean {
  return validProjectId(value.projectId)
    && validOpaqueId(value.sessionId)
    && validOpaqueId(value.customerId)
    && validOpaqueId(value.ownerId)
    && typeof value.subjectHash === "string"
    && value.subjectHash.length >= 32
    && typeof value.issuedAt === "string"
    && Number.isFinite(Date.parse(value.issuedAt))
    && typeof value.expiresAt === "string"
    && Number.isFinite(Date.parse(value.expiresAt))
    && (value.revokedAt === null || (typeof value.revokedAt === "string" && Number.isFinite(Date.parse(value.revokedAt))));
}

/**
 * Convert a freshly read durable session identity into the only member
 * authority accepted by the Order binding. The browser token is not an
 * input, and contact email is deliberately absent from this contract.
 */
export function resolveVerifiedMemberOrderSession(input: {
  readonly projectId: string;
  readonly session: PersistentCustomerSessionIdentity | null;
  readonly nowMilliseconds: number;
}): MemberOrderSessionResolution {
  if (!validProjectId(input.projectId) || !Number.isSafeInteger(input.nowMilliseconds) || input.nowMilliseconds < 0) {
    return { status: "unavailable", reason: "invalid_session" };
  }
  if (!input.session || !validSessionIdentity(input.session)) {
    return { status: "unavailable", reason: "invalid_session" };
  }
  if (input.session.projectId !== input.projectId) return { status: "unavailable", reason: "project_mismatch" };
  if (input.session.revokedAt !== null) return { status: "unavailable", reason: "revoked" };
  const expiresAtMilliseconds = Date.parse(input.session.expiresAt);
  if (input.nowMilliseconds >= expiresAtMilliseconds) return { status: "unavailable", reason: "expired" };
  return {
    status: "authorized",
    session: {
      kind: "verified_member_session",
      projectId: input.session.projectId,
      ownerId: input.session.ownerId,
      customerId: input.session.customerId,
      sessionId: input.session.sessionId,
      sessionStatus: "active",
      expiresAt: Math.floor(expiresAtMilliseconds / 1000),
    },
  };
}

/**
 * Bind an Order to the customer subject verified at creation time. The Order
 * capability is supplied only as a pre-hashed server-side digest.
 */
export function createMemberOrderBinding(input: {
  readonly session: VerifiedMemberOrderSession;
  readonly internalOrderId: string;
  readonly publicReference: string;
  readonly capabilityHash: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly version?: number;
}): MemberOrderBinding | null {
  if (input.session.kind !== "verified_member_session"
    || input.session.sessionStatus !== "active"
    || !validProjectId(input.session.projectId)
    || !validOpaqueId(input.session.ownerId)
    || !validOpaqueId(input.session.customerId)
    || !validOpaqueId(input.session.sessionId)
    || !validTimestamp(input.session.expiresAt)
    || !validOrderId(input.internalOrderId)
    || !validPublicReference(input.publicReference)
    || !CAPABILITY_HASH_PATTERN.test(input.capabilityHash)
    || !validTimestamp(input.createdAt)
    || !validTimestamp(input.expiresAt)
    || input.expiresAt <= input.createdAt
    || input.expiresAt > input.session.expiresAt
    || (input.version !== undefined && (!Number.isSafeInteger(input.version) || input.version < 1))) {
    return null;
  }
  const binding: MemberOrderBinding = {
    ownerKind: "customer",
    projectId: input.session.projectId,
    ownerId: input.session.ownerId,
    customerId: input.session.customerId,
    internalOrderId: input.internalOrderId,
    publicReference: input.publicReference,
    capabilityHash: input.capabilityHash,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
    version: input.version ?? 1,
    lifecycle: "active",
  };
  return validMemberOrderBinding(binding) ? binding : null;
}

/**
 * Freshly verified membership, exact Order identity, and the original Order
 * capability are all required. A member session never claims a guest binding.
 */
export function authorizeMemberOrderRead(input: {
  readonly binding: MemberOrderBinding;
  readonly session: VerifiedMemberOrderSession | null;
  readonly internalOrderId: string;
  readonly publicReference: string;
  readonly capabilityHash: string;
  readonly nowSeconds: number;
}): MemberOrderReadResult {
  if (!input.session || input.session.kind !== "verified_member_session" || input.session.sessionStatus !== "active") {
    return { status: "unavailable", reason: "invalid_session" };
  }
  if (!validMemberOrderBinding(input.binding)
    || !validProjectId(input.session.projectId)
    || !validOpaqueId(input.session.ownerId)
    || !validOpaqueId(input.session.customerId)
    || !validOrderId(input.internalOrderId)
    || !validPublicReference(input.publicReference)
    || !CAPABILITY_HASH_PATTERN.test(input.capabilityHash)
    || !validTimestamp(input.nowSeconds)) {
    return { status: "unavailable", reason: "not_found" };
  }
  if (input.binding.projectId !== input.session.projectId) return { status: "unavailable", reason: "project_mismatch" };
  if (input.binding.lifecycle !== "active") {
    return { status: "unavailable", reason: input.binding.lifecycle === "expired" ? "expired" : "revoked" };
  }
  if (input.nowSeconds >= input.binding.expiresAt || input.nowSeconds >= input.session.expiresAt) {
    return { status: "unavailable", reason: "expired" };
  }
  if (input.binding.internalOrderId !== input.internalOrderId
    || input.binding.publicReference !== input.publicReference
    || input.binding.ownerId !== input.session.ownerId
    || input.binding.customerId !== input.session.customerId
    || input.binding.capabilityHash !== input.capabilityHash) {
    return { status: "unavailable", reason: "not_found" };
  }
  return { status: "authorized", binding: input.binding };
}
