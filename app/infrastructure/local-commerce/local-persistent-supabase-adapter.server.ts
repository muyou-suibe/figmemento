import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  LOCAL_COMMERCE_MARKER_DIGEST_ENV,
  LOCAL_COMMERCE_PRIVATE_STORAGE_BUCKET,
  LOCAL_COMMERCE_SERVICE_ROLE_KEY_ENV,
  resolveLocalPersistentComposition,
  type LocalPersistentComposition,
  type LocalPersistentCompositionIssue,
} from "../../application/local-persistent-commerce-composition.server.ts";

export { LOCAL_COMMERCE_PRIVATE_STORAGE_BUCKET } from "../../application/local-persistent-commerce-composition.server.ts";

export type LocalCommerceRelation =
  | "migration_ledger"
  | "project_identities"
  | "commerce_owners"
  | "customer_accounts"
  | "customer_sessions"
  | "access_grants"
  | "catalog_products"
  | "catalog_variants"
  | "catalog_configuration_snapshots"
  | "catalog_pricing_rules"
  | "carts"
  | "cart_lines"
  | "configuration_drafts"
  | "media_objects"
  | "media_receipts"
  | "media_derivatives"
  | "draft_media_links"
  | "media_copy_bindings"
  | "orders"
  | "order_creation_bindings"
  | "order_purchase_snapshots"
  | "order_items"
  | "order_item_purchase_snapshots"
  | "order_item_receipt_bindings"
  | "payment_attempts"
  | "payment_actions"
  | "fulfillments"
  | "photo_reviews"
  | "preview_manifests"
  | "fulfillment_decisions"
  | "shipments"
  | "shipment_events"
  | "digital_versions"
  | "digital_grants"
  | "digital_tickets"
  | "digital_delivery_attempts";

export const LOCAL_COMMERCE_RELATIONS: ReadonlySet<LocalCommerceRelation> = new Set([
  "migration_ledger",
  "project_identities",
  "commerce_owners",
  "customer_accounts",
  "customer_sessions",
  "access_grants",
  "catalog_products",
  "catalog_variants",
  "catalog_configuration_snapshots",
  "catalog_pricing_rules",
  "carts",
  "cart_lines",
  "configuration_drafts",
  "media_objects",
  "media_receipts",
  "media_derivatives",
  "draft_media_links",
  "media_copy_bindings",
  "orders",
  "order_creation_bindings",
  "order_purchase_snapshots",
  "order_items",
  "order_item_purchase_snapshots",
  "order_item_receipt_bindings",
  "payment_attempts",
  "payment_actions",
  "fulfillments",
  "photo_reviews",
  "preview_manifests",
  "fulfillment_decisions",
  "shipments",
  "shipment_events",
  "digital_versions",
  "digital_grants",
  "digital_tickets",
  "digital_delivery_attempts",
]);

export const LOCAL_COMMERCE_RPC_FUNCTIONS = [
  "digital_download_stream_result",
  "digital_grant_revoke",
  "digital_download_prepare",
  "digital_download_claim",
  "digital_ticket_issue",
  "digital_grant_activate",
  "digital_publication_command",
  "digital_publication_complete",
  "admin_orders_read",
  "read_customer_tracking",
  "shipment_command",
  "fulfillment_lifecycle_command",
  "fulfillment_admin_timeout_command",
  "fulfillment_photo_review_command",
  "fulfillment_admission",
  "fulfillment_preview_command",
  "fulfillment_customer_command",
  "payment_command",
  "read_order_history",
  "order_commit",
  "media_upload_command",
  "media_copy_command",
  "media_cleanup_command",
  "media_operation_command",
  "draft_command",
  "cart_command",
  "verify_project_identity",
  "read_catalog_authority",
  "register_customer_account",
  "create_customer_session",
  "lookup_customer_session",
  "revoke_customer_session",
] as const;
export type LocalCommerceRpcFunction = (typeof LOCAL_COMMERCE_RPC_FUNCTIONS)[number];

export interface LocalPersistentCustomerAccountRegistration {
  readonly status: "created" | "conflict";
  readonly customerId?: string;
  readonly ownerId?: string;
  readonly normalizedEmail?: string;
}

export interface LocalPersistentCustomerAccountCredential {
  readonly projectId: string;
  readonly customerId: string;
  readonly ownerId: string;
  readonly normalizedEmail: string;
  readonly subjectHash: string;
  readonly passwordHash: string;
  readonly accountStatus: "active" | "disabled";
}

export interface LocalPersistentCustomerAccountIdentity {
  readonly projectId: string;
  readonly customerId: string;
  readonly ownerId: string;
  readonly normalizedEmail: string;
}

export interface LocalPersistentCustomerSessionRpcRecord {
  readonly status: "created" | "found";
  readonly project_id: string;
  readonly session_id: string;
  readonly customer_id: string;
  readonly owner_id: string;
  readonly subject_hash: string;
  readonly created_at: string;
  readonly expires_at: string;
  readonly revoked_at: string | null;
}

export type LocalPersistentCustomerSessionRpcResult =
  | LocalPersistentCustomerSessionRpcRecord
  | { readonly status: "not_found" | "expired" | "revoked" };

interface LocalCommerceRpcArguments {
  digital_download_stream_result: {
    readonly p_project_id: string; readonly p_marker_digest: string;
    readonly p_attempt_id: string; readonly p_result: "streamed" | "failed";
    readonly p_context_digest: string;
  };
  digital_grant_revoke: {
    readonly p_project_id: string; readonly p_marker_digest: string;
    readonly p_actor_kind: "admin"; readonly p_actor_id: string;
    readonly p_public_reference: string; readonly p_order_item_id: string;
    readonly p_grant_id: string; readonly p_operation: "revoke";
    readonly p_key_digest: string; readonly p_context_digest: string;
  };
  digital_download_prepare: {
    readonly p_project_id: string; readonly p_marker_digest: string;
    readonly p_owner_kind: "guest" | "customer"; readonly p_owner_selector: string;
    readonly p_customer_id: string | null; readonly p_session_hash: string | null;
    readonly p_authority_expires_at: string; readonly p_capability_hash: string;
    readonly p_public_reference: string; readonly p_ticket_hash: string;
  };
  digital_download_claim: {
    readonly p_project_id: string; readonly p_marker_digest: string;
    readonly p_owner_kind: "guest" | "customer"; readonly p_owner_selector: string;
    readonly p_customer_id: string | null; readonly p_session_hash: string | null;
    readonly p_authority_expires_at: string; readonly p_capability_hash: string;
    readonly p_public_reference: string; readonly p_ticket_hash: string;
    readonly p_opened_version_id: string; readonly p_opened_content_digest: string;
    readonly p_opened_byte_size: number; readonly p_claim_key: string;
    readonly p_claim_context_digest: string;
  };
  digital_ticket_issue: {
    readonly p_project_id: string; readonly p_marker_digest: string;
    readonly p_owner_kind: "guest" | "customer"; readonly p_owner_selector: string;
    readonly p_customer_id: string | null; readonly p_session_hash: string | null;
    readonly p_authority_expires_at: string; readonly p_capability_hash: string;
    readonly p_public_reference: string; readonly p_order_item_id: string;
    readonly p_grant_id: string; readonly p_ticket_hash: string;
  };
  digital_grant_activate: {
    readonly p_project_id: string; readonly p_marker_digest: string;
    readonly p_owner_kind: "guest" | "customer"; readonly p_owner_selector: string;
    readonly p_customer_id: string | null; readonly p_session_hash: string | null;
    readonly p_authority_expires_at: string; readonly p_capability_hash: string;
    readonly p_public_reference: string; readonly p_order_item_id: string;
    readonly p_operation: "activate"; readonly p_key_digest: string;
    readonly p_context_digest: string;
  };
  digital_publication_command: {
    readonly p_project_id: string; readonly p_marker_digest: string;
    readonly p_actor_kind: "admin"; readonly p_actor_id: string;
    readonly p_public_reference: string; readonly p_order_item_id: string;
    readonly p_operation: "probe" | "reserve" | "ready" | "fail";
    readonly p_key_digest: string; readonly p_context_digest: string;
    readonly p_input: Readonly<Record<string, unknown>>;
  };
  digital_publication_complete: {
    readonly p_project_id: string; readonly p_marker_digest: string;
    readonly p_actor_kind: "admin"; readonly p_actor_id: string;
    readonly p_public_reference: string; readonly p_order_item_id: string;
    readonly p_operation: "ready" | "fail"; readonly p_key_digest: string;
    readonly p_context_digest: string; readonly p_version_id: string;
    readonly p_readback_digest: string;
  };
  read_customer_tracking: {
    readonly p_project_id: string; readonly p_marker_digest: string;
    readonly p_owner_kind: "guest" | "customer"; readonly p_owner_selector: string;
    readonly p_customer_id: string | null; readonly p_session_hash: string | null;
    readonly p_authority_expires_at: string; readonly p_capability_hash: string;
    readonly p_public_reference: string;
  };
  shipment_command: {
    readonly p_project_id: string; readonly p_marker_digest: string;
    readonly p_actor_kind: "operator"; readonly p_actor_id: string;
    readonly p_public_reference: string; readonly p_operation: "prepare" | "commit";
    readonly p_action: "create_shipment" | "mark_shipped" | "mark_in_transit" | "mark_delivered"; readonly p_expected_version: number;
    readonly p_key_digest: string; readonly p_context_digest: string | null;
  };
  admin_orders_read: {
    readonly p_project_id: string; readonly p_marker_digest: string;
    readonly p_actor_kind: "admin"; readonly p_actor_id: "configured-admin";
    readonly p_search: string; readonly p_fulfillment: string; readonly p_payment: string;
    readonly p_attention: boolean; readonly p_page: number; readonly p_page_size: 20;
  };
  fulfillment_photo_review_command: {
    readonly p_project_id:string; readonly p_marker_digest:string;
    readonly p_actor_kind:"operator"; readonly p_actor_id:string;
    readonly p_public_reference:string; readonly p_operation:"prepare"|"commit";
    readonly p_action:"approve_photo_review"|"reject_photo_review";
    readonly p_expected_version:number; readonly p_key_digest:string; readonly p_order_item_id:string;
  };
  fulfillment_admin_timeout_command: {
    readonly p_project_id:string; readonly p_marker_digest:string;
    readonly p_actor_kind:'admin'; readonly p_actor_id:string;
    readonly p_public_reference:string; readonly p_operation:'prepare'|'commit';
    readonly p_action:'operator_timeout'; readonly p_expected_version:number; readonly p_key_digest:string;
    readonly p_manifest_id:string; readonly p_manifest_version:number; readonly p_reason:string;
  };
  fulfillment_lifecycle_command: {
    readonly p_project_id:string; readonly p_marker_digest:string;
    readonly p_actor_kind:string; readonly p_actor_id:string;
    readonly p_public_reference:string; readonly p_operation:string;
    readonly p_action:string; readonly p_expected_version:number; readonly p_key_digest:string;
  };
  fulfillment_customer_command: {
    readonly p_project_id: string; readonly p_marker_digest: string;
    readonly p_owner_kind: "guest" | "customer"; readonly p_owner_selector: string;
    readonly p_customer_id: string | null; readonly p_session_hash: string | null;
    readonly p_authority_expires_at: string; readonly p_capability_hash: string;
    readonly p_public_reference: string; readonly p_operation: "read" | "prepare" | "approve_preview" | "request_revision";
    readonly p_key_digest: string | null; readonly p_expected_preview_version: number | null;
    readonly p_note: string; readonly p_expected_aggregate_version: number | null;
  };
  fulfillment_preview_command: {
    readonly p_project_id: string; readonly p_marker_digest: string;
    readonly p_actor_kind: "operator"; readonly p_actor_id: string;
    readonly p_public_reference: string;
    readonly p_operation: "read" | "acquire" | "reserve" | "ready" | "publish" | "probe_reserve" | "probe_ready" | "probe_publish";
    readonly p_fulfillment_id: string | null; readonly p_expected_version: number | null;
    readonly p_key_digest: string | null; readonly p_input: Readonly<Record<string, unknown>>;
  };
  fulfillment_admission: {
    readonly p_project_id: string; readonly p_marker_digest: string;
    readonly p_actor_kind: "operator"; readonly p_actor_id: string;
    readonly p_public_reference: string; readonly p_operation: "read" | "prepare" | "commit";
    readonly p_order_id: string | null; readonly p_expected_version: number | null;
    readonly p_key_digest: string | null; readonly p_context_digest: string | null;
  };
  payment_command: {
    readonly p_project_id: string; readonly p_marker_digest: string;
    readonly p_owner_kind: "guest" | "customer"; readonly p_owner_selector: string;
    readonly p_customer_id: string | null; readonly p_session_hash: string | null;
    readonly p_authority_expires_at: string; readonly p_capability_hash: string;
    readonly p_public_reference: string; readonly p_operation: "prepare" | "commit";
    readonly p_order_id: string | null; readonly p_expected_version: number | null;
    readonly p_key_digest: string; readonly p_context_digest: string | null;
    readonly p_outcome: "success" | "failed" | "cancelled";
  };
  read_order_history: {
    readonly p_project_id: string; readonly p_marker_digest: string;
    readonly p_owner_kind: "guest" | "customer"; readonly p_owner_selector: string;
    readonly p_customer_id: string | null; readonly p_session_hash: string | null;
    readonly p_authority_expires_at: string; readonly p_capability_hash: string;
    readonly p_order_id: string | null; readonly p_public_reference: string;
    readonly p_order_item_id: string | null; readonly p_projection: "canonical_item" | "customer_summary";
  };
  order_commit: {
    readonly p_project_id: string; readonly p_marker_digest: string;
    readonly p_owner_kind: "guest" | "customer"; readonly p_owner_selector: string;
    readonly p_customer_id: string | null; readonly p_session_hash: string | null;
    readonly p_authority_expires_at: string; readonly p_capability_expires_at: string;
    readonly p_grant_expires_at: string; readonly p_capability_hash: string;
    readonly p_operation: "probe" | "commit"; readonly p_cart_id: string; readonly p_expected_version: number;
    readonly p_key_digest: string; readonly p_context_digest: string; readonly p_facts: unknown;
  };
  media_copy_command: {
    readonly p_project_id: string; readonly p_marker_digest: string;
    readonly p_owner_kind: string; readonly p_owner_selector: string;
    readonly p_customer_id: string | null; readonly p_authority_expires_at: string;
    readonly p_source_receipt: string; readonly p_target_draft: string;
    readonly p_expected_version: number; readonly p_key_digest: string; readonly p_input_digest: string;
  };
  media_upload_command: {
    readonly p_project_id: string; readonly p_marker_digest: string;
    readonly p_owner_kind: string; readonly p_owner_selector: string;
    readonly p_customer_id: string | null; readonly p_authority_expires_at: string;
    readonly p_draft_id: string; readonly p_product_id: string;
    readonly p_expected_version: number; readonly p_key_digest: string;
    readonly p_fingerprint: string; readonly p_recovery_only: boolean; readonly p_input: unknown;
  };
  media_cleanup_command: {
    readonly p_project_id: string; readonly p_marker_digest: string;
    readonly p_operation_id: string; readonly p_resource: string;
    readonly p_command: string; readonly p_lease_token: string | null;
  };
  media_operation_command: {
    readonly p_project_id: string; readonly p_marker_digest: string;
    readonly p_owner_kind: string; readonly p_owner_selector: string;
    readonly p_customer_id: string | null; readonly p_authority_expires_at: string;
    readonly p_command: string; readonly p_operation_id: string | null;
    readonly p_draft_id: string | null; readonly p_slot_id: string | null;
    readonly p_expected_version: number | null; readonly p_input: unknown;
  };
  draft_command: {
    readonly p_project_id: string; readonly p_marker_digest: string;
    readonly p_owner_kind: string; readonly p_owner_selector: string;
    readonly p_customer_id: string | null; readonly p_authority_expires_at: string;
    readonly p_operation: string; readonly p_draft_id: string | null; readonly p_product_id: string | null;
    readonly p_expected_version: number; readonly p_command_key: string | null;
    readonly p_fingerprint: string | null; readonly p_slots: unknown;
  };
  cart_command: {
    readonly p_project_id: string; readonly p_marker_digest: string;
    readonly p_owner_kind: string; readonly p_owner_selector: string;
    readonly p_customer_id: string | null; readonly p_authority_expires_at: string;
    readonly p_operation: string; readonly p_cart_id: string | null; readonly p_line_id: string | null;
    readonly p_expected_version: number; readonly p_command_key: string | null;
    readonly p_fingerprint: string | null; readonly p_item: unknown; readonly p_quantity: number | null;
  };
  verify_project_identity: { readonly p_project_id: string; readonly p_marker_digest: string };
  read_catalog_authority: { readonly p_project_id: string; readonly p_marker_digest: string };
  register_customer_account: {
    readonly p_project_id: string;
    readonly p_normalized_email: string;
    readonly p_password_hash: string;
    readonly p_subject_hash: string;
  };
  create_customer_session: {
    readonly p_project_id: string;
    readonly p_owner_id: string;
    readonly p_customer_id: string;
    readonly p_subject_hash: string;
    readonly p_session_hash: string;
    readonly p_created_at: string;
    readonly p_expires_at: string;
  };
  lookup_customer_session: {
    readonly p_project_id: string;
    readonly p_session_hash: string;
    readonly p_now: string;
  };
  revoke_customer_session: {
    readonly p_project_id: string;
    readonly p_session_hash: string;
    readonly p_now: string;
  };
}

type LocalPersistentAdapterIssue =
  | LocalPersistentCompositionIssue
  | { readonly code: "local_service_credential_required"; readonly name: typeof LOCAL_COMMERCE_SERVICE_ROLE_KEY_ENV }
  | { readonly code: "relation_not_allowlisted" }
  | { readonly code: "select_not_allowlisted" }
  | { readonly code: "rpc_not_allowlisted" }
  | { readonly code: "storage_path_not_allowlisted" }
  | { readonly code: "project_identity_rejected" }
  | { readonly code: "local_authority_unavailable" };

export type LocalPersistentAdapterResult<T> =
  | { readonly status: "found"; readonly value: T }
  | { readonly status: "unavailable"; readonly issues: readonly LocalPersistentAdapterIssue[] };

export interface LocalPersistentSupabaseClientFactory {
  create(url: string, serviceRoleKey: string): SupabaseClient;
}

export type LocalPersistentMediaReleaseBindingResult =
  | { readonly status: "found"; readonly operationId: string; readonly operationLifecycle: "ready" | "failed";
      readonly receiptLifecycle: "removed" | null }
  | { readonly status: "conflict" | "not_found" | "unavailable" };

const DEFAULT_CLIENT_FACTORY: LocalPersistentSupabaseClientFactory = {
  create(url, serviceRoleKey) {
    return createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  },
};

function safeSelect(columns: string): boolean {
  return columns.trim().length > 0 && !/[;*'"`]/.test(columns);
}

function safeStoragePath(value: string): boolean {
  return /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._\-/]{1,512}$/.test(value);
}

/**
 * Server-only HTTP/RPC/Storage transport for the isolated local project.
 * It deliberately exposes no client, signed URL, raw locator, or production
 * source fallback. Domain repositories are added by later persistence tasks.
 */
export class LocalPersistentSupabaseAdapter {
  private readonly client: SupabaseClient;
  private readonly localSchema;

  constructor(client: SupabaseClient) {
    this.client = client;
    this.localSchema = client.schema("local_commerce");
  }

  async readRows<T>(relation: LocalCommerceRelation, columns: string): Promise<LocalPersistentAdapterResult<readonly T[]>> {
    if (!LOCAL_COMMERCE_RELATIONS.has(relation)) return { status: "unavailable", issues: [{ code: "relation_not_allowlisted" }] };
    if (!safeSelect(columns)) return { status: "unavailable", issues: [{ code: "select_not_allowlisted" }] };
    try {
      const result = await this.localSchema.from(relation).select(columns);
      if (result.error || !Array.isArray(result.data)) return { status: "unavailable", issues: [{ code: "local_authority_unavailable" }] };
      return { status: "found", value: result.data as unknown as readonly T[] };
    } catch {
      return { status: "unavailable", issues: [{ code: "local_authority_unavailable" }] };
    }
  }

  async callRestrictedRpc<T>(
    functionName: LocalCommerceRpcFunction,
    arguments_: LocalCommerceRpcArguments[LocalCommerceRpcFunction],
  ): Promise<LocalPersistentAdapterResult<T>> {
    if (!LOCAL_COMMERCE_RPC_FUNCTIONS.includes(functionName)) return { status: "unavailable", issues: [{ code: "rpc_not_allowlisted" }] };
    try {
      const result = await this.localSchema.rpc(functionName, arguments_);
      if (result.error) return { status: "unavailable", issues: [{ code: "local_authority_unavailable" }] };
      return { status: "found", value: result.data as T };
    } catch {
      return { status: "unavailable", issues: [{ code: "local_authority_unavailable" }] };
    }
  }

  /** Server-only replay probe for a release whose canonical receipt is already
   * ineligible. It resolves through the freshly verified owner plus digests;
   * neither raw request key nor provider locator crosses this boundary. */
  async readMediaUploadReleaseBinding(input: { readonly projectId: string; readonly ownerKind: "guest" | "customer";
    readonly ownerSelector: string; readonly customerId: string | null; readonly keyDigest: string;
    readonly fingerprint: string }): Promise<LocalPersistentMediaReleaseBindingResult> {
    try {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(input.projectId)
        || !/^[a-f0-9]{64}$/.test(input.keyDigest) || !/^[a-f0-9]{64}$/.test(input.fingerprint)) return { status: "unavailable" };
      let ownerId: string | null = null;
      if (input.ownerKind === "guest" && /^[a-f0-9]{64}$/.test(input.ownerSelector) && input.customerId === null) {
        const owner = await this.localSchema.from("commerce_owners").select("id").eq("project_id", input.projectId)
          .eq("owner_kind", "guest").eq("subject_hash", input.ownerSelector).eq("lifecycle", "active").maybeSingle();
        if (owner.error) return { status: "unavailable" };
        ownerId = typeof owner.data?.id === "string" ? owner.data.id : null;
      } else if (input.ownerKind === "customer" && input.customerId && /^[a-f0-9-]{36}$/i.test(input.ownerSelector)) {
        const account = await this.localSchema.from("customer_accounts").select("owner_id").eq("project_id", input.projectId)
          .eq("id", input.customerId).eq("owner_id", input.ownerSelector).eq("account_status", "active").eq("lifecycle", "active").maybeSingle();
        if (account.error) return { status: "unavailable" };
        ownerId = typeof account.data?.owner_id === "string" ? account.data.owner_id : null;
      }
      if (!ownerId) return { status: "not_found" };
      const binding = await this.localSchema.from("media_upload_command_bindings")
        .select("operation_id,fingerprint").eq("project_id", input.projectId).eq("owner_id", ownerId)
        .eq("key_digest", input.keyDigest).maybeSingle();
      if (binding.error) return { status: "unavailable" };
      if (!binding.data) return { status: "not_found" };
      if (binding.data.fingerprint !== input.fingerprint) return { status: "conflict" };
      const operation = await this.localSchema.from("media_operations").select("id,lifecycle,receipt_id")
        .eq("project_id", input.projectId).eq("owner_id", ownerId).eq("id", binding.data.operation_id).maybeSingle();
      if (operation.error || !operation.data || !["ready", "failed"].includes(operation.data.lifecycle)) return { status: "unavailable" };
      let receiptLifecycle: "removed" | null = null;
      if (operation.data.receipt_id) {
        const receipt = await this.localSchema.from("media_receipts").select("lifecycle").eq("project_id", input.projectId)
          .eq("owner_id", ownerId).eq("id", operation.data.receipt_id).maybeSingle();
        if (receipt.error || !receipt.data || receipt.data.lifecycle !== "removed") return { status: "unavailable" };
        receiptLifecycle = "removed";
      }
      return { status: "found", operationId: operation.data.id,
        operationLifecycle: operation.data.lifecycle as "ready" | "failed", receiptLifecycle };
    } catch { return { status: "unavailable" }; }
  }

  async registerCustomerAccount(input: LocalCommerceRpcArguments["register_customer_account"]): Promise<LocalPersistentAdapterResult<LocalPersistentCustomerAccountRegistration>> {
    const result = await this.callRestrictedRpc<unknown>("register_customer_account", input);
    if (result.status !== "found" || !isCustomerAccountRegistration(result.value)) {
      return { status: "unavailable", issues: [{ code: "local_authority_unavailable" }] };
    }
    if (result.value.status === "conflict") return { status: "found", value: { status: "conflict" } };
    return {
      status: "found",
      value: {
        status: "created",
        customerId: result.value.customer_id,
        ownerId: result.value.owner_id,
        normalizedEmail: result.value.normalized_email,
      },
    };
  }

  async readCustomerAccountByEmail(
    projectId: string,
    normalizedEmail: string,
  ): Promise<LocalPersistentAdapterResult<LocalPersistentCustomerAccountCredential | null>> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(projectId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return { status: "unavailable", issues: [{ code: "local_authority_unavailable" }] };
    }
    try {
      const result = await this.localSchema
        .from("customer_accounts")
        .select("project_id,id,owner_id,normalized_email,password_hash,account_status,commerce_owners(subject_hash)")
        .eq("project_id", projectId)
        .eq("normalized_email", normalizedEmail)
        .maybeSingle();
      if (result.error) return { status: "unavailable", issues: [{ code: "local_authority_unavailable" }] };
      if (!result.data) return { status: "found", value: null };
      if (!isCustomerAccountCredential(result.data)) {
        return { status: "unavailable", issues: [{ code: "local_authority_unavailable" }] };
      }
      const subjectHash = readCustomerSubjectHash(result.data.commerce_owners);
      if (!subjectHash) {
        return { status: "unavailable", issues: [{ code: "local_authority_unavailable" }] };
      }
      return {
        status: "found",
        value: {
          projectId: result.data.project_id,
          customerId: result.data.id,
          ownerId: result.data.owner_id,
          normalizedEmail: result.data.normalized_email,
          subjectHash,
          passwordHash: result.data.password_hash,
          accountStatus: result.data.account_status,
        },
      };
    } catch {
      return { status: "unavailable", issues: [{ code: "local_authority_unavailable" }] };
    }
  }

  async readCustomerAccountById(
    projectId: string,
    customerId: string,
  ): Promise<LocalPersistentAdapterResult<LocalPersistentCustomerAccountIdentity | null>> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(projectId) || !customerId.trim()) {
      return { status: "unavailable", issues: [{ code: "local_authority_unavailable" }] };
    }
    try {
      const result = await this.localSchema
        .from("customer_accounts")
        .select("project_id,id,owner_id,normalized_email")
        .eq("project_id", projectId)
        .eq("id", customerId)
        .maybeSingle();
      if (result.error) return { status: "unavailable", issues: [{ code: "local_authority_unavailable" }] };
      if (!result.data || !isCustomerAccountIdentity(result.data)) return { status: "found", value: null };
      return {
        status: "found",
        value: {
          projectId: result.data.project_id,
          customerId: result.data.id,
          ownerId: result.data.owner_id,
          normalizedEmail: result.data.normalized_email,
        },
      };
    } catch {
      return { status: "unavailable", issues: [{ code: "local_authority_unavailable" }] };
    }
  }

  async createCustomerSession(input: LocalCommerceRpcArguments["create_customer_session"]): Promise<LocalPersistentAdapterResult<LocalPersistentCustomerSessionRpcResult>> {
    const result = await this.callRestrictedRpc<unknown>("create_customer_session", input);
    if (result.status !== "found" || !isCustomerSessionRpcResult(result.value, "created")) {
      return { status: "unavailable", issues: [{ code: "local_authority_unavailable" }] };
    }
    return { status: "found", value: result.value };
  }

  async lookupCustomerSession(input: LocalCommerceRpcArguments["lookup_customer_session"]): Promise<LocalPersistentAdapterResult<LocalPersistentCustomerSessionRpcResult>> {
    const result = await this.callRestrictedRpc<unknown>("lookup_customer_session", input);
    if (result.status !== "found" || !isCustomerSessionRpcResult(result.value)) {
      return { status: "unavailable", issues: [{ code: "local_authority_unavailable" }] };
    }
    return { status: "found", value: result.value };
  }

  async revokeCustomerSession(input: LocalCommerceRpcArguments["revoke_customer_session"]): Promise<LocalPersistentAdapterResult<LocalPersistentCustomerSessionRpcResult>> {
    const result = await this.callRestrictedRpc<unknown>("revoke_customer_session", input);
    if (result.status !== "found" || !isCustomerSessionRpcResult(result.value)) {
      return { status: "unavailable", issues: [{ code: "local_authority_unavailable" }] };
    }
    return { status: "found", value: result.value };
  }

  async verifyProjectIdentity(projectId: string, markerDigest: string): Promise<LocalPersistentAdapterResult<true>> {
    const result = await this.callRestrictedRpc<boolean>("verify_project_identity", {
      p_project_id: projectId,
      p_marker_digest: markerDigest,
    });
    if (result.status !== "found" || result.value !== true) {
      return {
        status: "unavailable",
        issues: [{ code: "project_identity_rejected" }],
      };
    }
    return { status: "found", value: true };
  }

  async downloadPrivateObject(path: string): Promise<LocalPersistentAdapterResult<Blob>> {
    if (!safeStoragePath(path)) return { status: "unavailable", issues: [{ code: "storage_path_not_allowlisted" }] };
    try {
      const result = await this.client.storage.from(LOCAL_COMMERCE_PRIVATE_STORAGE_BUCKET).download(path);
      if (result.error || !result.data) return { status: "unavailable", issues: [{ code: "local_authority_unavailable" }] };
      return { status: "found", value: result.data };
    } catch {
      return { status: "unavailable", issues: [{ code: "local_authority_unavailable" }] };
    }
  }

  async uploadPrivateObject(
    path: string,
    body: Blob | ArrayBuffer | Uint8Array,
    contentType: string,
  ): Promise<LocalPersistentAdapterResult<{ readonly path: string }>> {
    if (!safeStoragePath(path) || !/^[\w.+\-/]{1,160}$/.test(contentType)) {
      return { status: "unavailable", issues: [{ code: "storage_path_not_allowlisted" }] };
    }
    try {
      const result = await this.client.storage.from(LOCAL_COMMERCE_PRIVATE_STORAGE_BUCKET).upload(path, body, {
        contentType,
        upsert: false,
      });
      if (result.error) return { status: "unavailable", issues: [{ code: "local_authority_unavailable" }] };
      return { status: "found", value: { path } };
    } catch {
      return { status: "unavailable", issues: [{ code: "local_authority_unavailable" }] };
    }
  }

  async removePrivateObjects(paths: readonly string[]): Promise<LocalPersistentAdapterResult<true>> {
    if (paths.some((path) => !safeStoragePath(path))) return { status: "unavailable", issues: [{ code: "storage_path_not_allowlisted" }] };
    try {
      const result = await this.client.storage.from(LOCAL_COMMERCE_PRIVATE_STORAGE_BUCKET).remove([...paths]);
      if (result.error) return { status: "unavailable", issues: [{ code: "local_authority_unavailable" }] };
      // RLS-filtered DELETE can return HTTP 200 with an empty result. Only an
      // exact deleted name, or a trusted metadata read proving absence, confirms
      // cleanup. The latter permits retry after a lost successful response.
      for (const path of paths) {
        if (result.data?.some((object) => object.name === path)) continue;
        const remaining = await this.client.storage.from(LOCAL_COMMERCE_PRIVATE_STORAGE_BUCKET).info(path);
        if (!remaining.error || !("code" in remaining.error) || remaining.error.code !== "NoSuchKey") {
          return { status: "unavailable", issues: [{ code: "local_authority_unavailable" }] };
        }
      }
      return { status: "found", value: true };
    } catch {
      return { status: "unavailable", issues: [{ code: "local_authority_unavailable" }] };
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCustomerAccountRegistration(value: unknown): value is {
  readonly status: "created" | "conflict";
  readonly customer_id?: string;
  readonly owner_id?: string;
  readonly normalized_email?: string;
} {
  if (!isRecord(value) || (value.status !== "created" && value.status !== "conflict")) return false;
  if (value.status === "conflict") return true;
  return typeof value.customer_id === "string"
    && typeof value.owner_id === "string"
    && typeof value.normalized_email === "string";
}

function isCustomerAccountCredential(value: unknown): value is {
  readonly project_id: string;
  readonly id: string;
  readonly owner_id: string;
  readonly normalized_email: string;
  readonly commerce_owners?: unknown;
  readonly password_hash: string;
  readonly account_status: "active" | "disabled";
} {
  if (!isRecord(value)) return false;
  return typeof value.project_id === "string"
    && typeof value.id === "string"
    && typeof value.owner_id === "string"
    && typeof value.normalized_email === "string"
    && readCustomerSubjectHash(value.commerce_owners) !== null
    && typeof value.password_hash === "string"
    && (value.account_status === "active" || value.account_status === "disabled");
}

function readCustomerSubjectHash(value: unknown): string | null {
  if (isRecord(value) && typeof value.subject_hash === "string" && value.subject_hash.length >= 32) {
    return value.subject_hash;
  }
  if (Array.isArray(value) && value.length === 1) {
    return readCustomerSubjectHash(value[0]);
  }
  return null;
}

function isCustomerAccountIdentity(value: unknown): value is {
  readonly project_id: string;
  readonly id: string;
  readonly owner_id: string;
  readonly normalized_email: string;
} {
  return isRecord(value)
    && typeof value.project_id === "string"
    && typeof value.id === "string"
    && typeof value.owner_id === "string"
    && typeof value.normalized_email === "string";
}

function isCustomerSessionRpcResult(
  value: unknown,
  expectedStatus?: "created",
): value is LocalPersistentCustomerSessionRpcResult {
  if (!isRecord(value)) return false;
  if (value.status === "not_found" || value.status === "expired" || value.status === "revoked") return expectedStatus === undefined;
  if (value.status !== "created" && value.status !== "found") return false;
  if (expectedStatus && value.status !== expectedStatus) return false;
  if ("session_hash" in value || "token" in value || "session_token" in value) return false;
  return typeof value.project_id === "string"
    && typeof value.session_id === "string"
    && typeof value.customer_id === "string"
    && typeof value.owner_id === "string"
    && typeof value.subject_hash === "string"
    && value.subject_hash.length >= 32
    && typeof value.created_at === "string"
    && typeof value.expires_at === "string"
    && (value.revoked_at === null || typeof value.revoked_at === "string");
}

export async function createLocalPersistentSupabaseAdapter(
  environment: Record<string, string | undefined> = process.env,
  options: { readonly clientFactory?: LocalPersistentSupabaseClientFactory } = {},
): Promise<
  | { readonly status: "ready"; readonly adapter: LocalPersistentSupabaseAdapter; readonly composition: LocalPersistentComposition }
  | { readonly status: "unavailable"; readonly issues: readonly LocalPersistentAdapterIssue[] }
> {
  const composition = resolveLocalPersistentComposition(environment);
  if (composition.status !== "ready") {
    return composition.status === "not_selected"
      ? { status: "unavailable", issues: [{ code: "local_authority_unavailable" }] }
      : { status: "unavailable", issues: composition.issues };
  }
  const serviceRoleKey = environment[LOCAL_COMMERCE_SERVICE_ROLE_KEY_ENV]?.trim();
  if (!serviceRoleKey) {
    return {
      status: "unavailable",
      issues: [{ code: "local_service_credential_required", name: LOCAL_COMMERCE_SERVICE_ROLE_KEY_ENV }],
    };
  }
  const adapter = new LocalPersistentSupabaseAdapter(
    (options.clientFactory ?? DEFAULT_CLIENT_FACTORY).create(composition.value.config.endpoints.apiUrl, serviceRoleKey),
  );
  const identity = await adapter.verifyProjectIdentity(composition.value.projectId, composition.value.markerDigest);
  if (identity.status !== "found") return identity;
  return { status: "ready", adapter, composition: composition.value };
}

export function localPersistentMarkerDigestFromEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): string | null {
  const value = environment[LOCAL_COMMERCE_MARKER_DIGEST_ENV]?.trim();
  return value && /^[0-9a-f]{64}$/.test(value) ? value : null;
}
