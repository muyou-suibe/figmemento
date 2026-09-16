import type { CustomerUploadOwnerId } from "../domain/customer-upload.ts";
import type { GuestDraftOwnerService } from "../lib/guest-draft-owner.ts";

const PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const RESOURCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const CAPABILITY_HASH_PATTERN = /^[0-9a-f]{64}$/;
const RAW_CAPABILITY_PATTERN = /^\S{16,512}$/;

export type GuestResourceKind = "cart" | "draft" | "upload_receipt" | "order";

export interface GuestResourceOwner {
  readonly kind: "guest";
  readonly projectId: string;
  readonly ownerId: CustomerUploadOwnerId;
  readonly expiresAt: number;
}

export interface CustomerResourceOwner {
  readonly kind: "customer";
  readonly projectId: string;
  /** Server-derived opaque customer owner identity; never browser supplied. */
  readonly ownerId: string;
  readonly customerId: string;
}

export type VerifiedResourceOwner = GuestResourceOwner | CustomerResourceOwner;

export type GuestResourceOwnerResolution =
  | { readonly status: "authorized"; readonly owner: GuestResourceOwner }
  | { readonly status: "issued"; readonly owner: GuestResourceOwner; readonly context: string }
  | { readonly status: "unavailable"; readonly reason: "invalid_project" | "missing" | "invalid" | "expired" | "source_failure" };

export interface GuestResourceBinding {
  readonly projectId: string;
  readonly ownerKind: "guest" | "customer";
  readonly ownerId: string;
  readonly customerId?: string;
  readonly resourceKind: GuestResourceKind;
  readonly resourceId: string;
  /** Only a digest may cross this boundary; raw bearer material is not retained. */
  readonly capabilityHash?: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly version: number;
  readonly lifecycle: "active" | "expired" | "revoked" | "removed";
}

export type GuestResourceAuthorizationResult =
  | { readonly status: "authorized"; readonly binding: GuestResourceBinding }
  | { readonly status: "unavailable"; readonly reason: "invalid_binding" | "not_found" | "expired" | "revoked" | "project_mismatch" };

function validProjectId(value: unknown): value is string {
  return typeof value === "string" && PROJECT_ID_PATTERN.test(value);
}

function validResourceId(value: unknown): value is string {
  return typeof value === "string" && RESOURCE_ID_PATTERN.test(value);
}

function validTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validOwnerId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 8 && value.trim().length <= 200;
}

function validResourceKind(value: unknown): value is GuestResourceKind {
  return value === "cart" || value === "draft" || value === "upload_receipt" || value === "order";
}

/**
 * Convert server-issued bearer material to the only form that may cross a
 * persistence/action-binding boundary. The raw value is never returned from
 * or retained by this module.
 */
export async function hashGuestResourceCapability(rawCapability: string): Promise<string | null> {
  if (typeof rawCapability !== "string" || !RAW_CAPABILITY_PATTERN.test(rawCapability)) {
    return null;
  }
  const bytes = new TextEncoder().encode(rawCapability);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validBinding(value: GuestResourceBinding): boolean {
  return validProjectId(value.projectId)
    && (value.ownerKind === "guest" || value.ownerKind === "customer")
    && validOwnerId(value.ownerId)
    && (value.ownerKind === "customer"
      ? typeof value.customerId === "string" && value.customerId.trim().length >= 1
      : value.customerId === undefined)
    && validResourceKind(value.resourceKind)
    && validResourceId(value.resourceId)
    && (value.capabilityHash === undefined || CAPABILITY_HASH_PATTERN.test(value.capabilityHash))
    && validTimestamp(value.createdAt)
    && validTimestamp(value.expiresAt)
    && value.expiresAt > value.createdAt
    && Number.isSafeInteger(value.version)
    && value.version >= 1
    && (value.lifecycle === "active"
      || value.lifecycle === "expired"
      || value.lifecycle === "revoked"
      || value.lifecycle === "removed");
}

/**
 * Resolve the existing signed guest context into a server-owned resource
 * owner. Project scope comes from trusted server composition, not the cookie.
 */
export async function resolveGuestResourceOwner(input: {
  readonly projectId: string;
  readonly context: string | null | undefined;
  readonly ownerService: Pick<GuestDraftOwnerService, "verifyGuestDraftOwnerContext">;
}): Promise<GuestResourceOwnerResolution> {
  if (!validProjectId(input.projectId)) return { status: "unavailable", reason: "invalid_project" };
  try {
    const verified = await input.ownerService.verifyGuestDraftOwnerContext(input.context);
    if (verified.status === "valid") {
      return {
        status: "authorized",
        owner: {
          kind: "guest",
          projectId: input.projectId,
          ownerId: verified.ownerId,
          expiresAt: verified.expiresAt,
        },
      };
    }
    if (verified.status === "expired") return { status: "unavailable", reason: "expired" };
    if (verified.status === "source_failure") return { status: "unavailable", reason: "source_failure" };
    return { status: "unavailable", reason: verified.status === "missing" ? "missing" : "invalid" };
  } catch {
    return { status: "unavailable", reason: "source_failure" };
  }
}

/** Missing guest context may be issued, but only by the existing server codec. */
export async function ensureGuestResourceOwner(input: {
  readonly projectId: string;
  readonly context: string | null | undefined;
  readonly ownerService: Pick<GuestDraftOwnerService, "ensureGuestDraftOwnerContext">;
}): Promise<GuestResourceOwnerResolution> {
  if (!validProjectId(input.projectId)) return { status: "unavailable", reason: "invalid_project" };
  try {
    const ensured = await input.ownerService.ensureGuestDraftOwnerContext(input.context);
    if (ensured.status === "existing") {
      return {
        status: "authorized",
        owner: {
          kind: "guest",
          projectId: input.projectId,
          ownerId: ensured.value.ownerId,
          expiresAt: ensured.value.expiresAt,
        },
      };
    }
    if (ensured.status === "issued") {
      return {
        status: "issued",
        context: ensured.value.context,
        owner: {
          kind: "guest",
          projectId: input.projectId,
          ownerId: ensured.value.ownerId,
          expiresAt: ensured.value.expiresAt,
        },
      };
    }
    return { status: "unavailable", reason: ensured.status };
  } catch {
    return { status: "unavailable", reason: "source_failure" };
  }
}

/** Customer ownership is accepted only from an already verified server session. */
export function createCustomerResourceOwner(input: {
  readonly projectId: string;
  readonly customerId: string;
  readonly ownerId: string;
}): CustomerResourceOwner | null {
  if (!validProjectId(input.projectId) || !validOwnerId(input.customerId) || !validOwnerId(input.ownerId)) return null;
  return {
    kind: "customer",
    projectId: input.projectId,
    ownerId: input.ownerId,
    customerId: input.customerId,
  };
}

/**
 * Create the persisted ownership projection from server-derived identity only.
 * It deliberately accepts no email, browser owner ID, or raw capability.
 */
export function createGuestResourceBinding(input: {
  readonly owner: VerifiedResourceOwner;
  readonly resourceKind: GuestResourceKind;
  readonly resourceId: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly version?: number;
  readonly capabilityHash?: string;
}): GuestResourceBinding | null {
  if (!validProjectId(input.owner.projectId)
    || !validOwnerId(input.owner.ownerId)
    || !validResourceKind(input.resourceKind)
    || !validResourceId(input.resourceId)
    || !validTimestamp(input.createdAt)
    || !validTimestamp(input.expiresAt)
    || input.expiresAt <= input.createdAt
    || (input.version !== undefined && (!Number.isSafeInteger(input.version) || input.version < 1))
    || (input.capabilityHash !== undefined && !CAPABILITY_HASH_PATTERN.test(input.capabilityHash))) {
    return null;
  }
  const binding: GuestResourceBinding = {
    projectId: input.owner.projectId,
    ownerKind: input.owner.kind,
    ownerId: input.owner.ownerId,
    ...(input.owner.kind === "customer" ? { customerId: input.owner.customerId } : {}),
    resourceKind: input.resourceKind,
    resourceId: input.resourceId,
    ...(input.capabilityHash ? { capabilityHash: input.capabilityHash } : {}),
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
    version: input.version ?? 1,
    lifecycle: "active",
  };
  return validBinding(binding) ? binding : null;
}

/**
 * Verify exact project + owner + resource identity. Customer sessions never
 * claim guest bindings, even when contact emails happen to match.
 */
export function authorizeGuestResourceBinding(input: {
  readonly binding: GuestResourceBinding;
  readonly owner: VerifiedResourceOwner;
  readonly resourceKind: GuestResourceKind;
  readonly resourceId: string;
  readonly nowSeconds: number;
}): GuestResourceAuthorizationResult {
  if (!validBinding(input.binding)
    || !validProjectId(input.owner.projectId)
    || !validOwnerId(input.owner.ownerId)
    || !validResourceKind(input.resourceKind)
    || !validResourceId(input.resourceId)
    || !validTimestamp(input.nowSeconds)) {
    return { status: "unavailable", reason: "invalid_binding" };
  }
  if (input.binding.projectId !== input.owner.projectId) return { status: "unavailable", reason: "project_mismatch" };
  if (input.binding.resourceKind !== input.resourceKind || input.binding.resourceId !== input.resourceId) {
    return { status: "unavailable", reason: "not_found" };
  }
  if (input.binding.lifecycle !== "active") {
    return {
      status: "unavailable",
      reason: input.binding.lifecycle === "expired" ? "expired" : "revoked",
    };
  }
  const ownerExpired = input.owner.kind === "guest" && input.nowSeconds >= input.owner.expiresAt;
  if (input.nowSeconds >= input.binding.expiresAt || ownerExpired) {
    return { status: "unavailable", reason: "expired" };
  }
  if (input.binding.ownerKind !== input.owner.kind || input.binding.ownerId !== input.owner.ownerId) {
    return { status: "unavailable", reason: "not_found" };
  }
  if (input.owner.kind === "guest" && input.binding.customerId !== undefined) {
    return { status: "unavailable", reason: "invalid_binding" };
  }
  if (input.owner.kind === "customer"
    && (input.binding.customerId === undefined || input.binding.customerId !== input.owner.customerId)) {
    return { status: "unavailable", reason: "not_found" };
  }
  return { status: "authorized", binding: input.binding };
}
