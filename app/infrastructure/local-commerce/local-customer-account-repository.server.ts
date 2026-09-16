import {
  normalizeCustomerEmail,
} from "../../domain/customer-auth.ts";
import type {
  PersistentCustomerAccountCredential,
  PersistentCustomerAccountLookup,
  PersistentCustomerAccountPort,
  PersistentCustomerAccountRegistration,
} from "../../application/customer-account-persistence.server.ts";
import type {
  LocalPersistentCustomerAccountCredential,
  LocalPersistentCustomerAccountIdentity,
  LocalPersistentSupabaseAdapter,
} from "./local-persistent-supabase-adapter.server.ts";

function validProjectId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
}

function unavailable(): { readonly status: "unavailable"; readonly reason: "source_failure" } {
  return { status: "unavailable", reason: "source_failure" };
}

/** Server-only adapter over the selected local_commerce customer tables/RPC. */
export class LocalPersistentCustomerAccountRepository implements PersistentCustomerAccountPort {
  private readonly adapter: LocalPersistentSupabaseAdapter;
  private readonly projectId: string;

  constructor(adapter: LocalPersistentSupabaseAdapter, projectId: string) {
    this.adapter = adapter;
    this.projectId = projectId;
  }

  async register(input: {
    readonly projectId: string;
    readonly normalizedEmail: string;
    readonly passwordHash: string;
    readonly subjectHash: string;
  }): Promise<PersistentCustomerAccountRegistration> {
    if (
      !validProjectId(this.projectId)
      || input.projectId !== this.projectId
      || normalizeCustomerEmail(input.normalizedEmail) !== input.normalizedEmail
      || input.passwordHash.trim().length < 32
      || input.subjectHash.trim().length < 32
    ) return unavailable();

    const result = await this.adapter.registerCustomerAccount({
      p_project_id: input.projectId,
      p_normalized_email: input.normalizedEmail,
      p_password_hash: input.passwordHash,
      p_subject_hash: input.subjectHash,
    });
    if (result.status !== "found") return unavailable();
    if (result.value.status === "conflict") return { status: "conflict", reason: "email_already_registered" };
    if (
      result.value.status !== "created"
      || !result.value.customerId
      || !result.value.ownerId
      || !result.value.normalizedEmail
    ) return unavailable();
    return {
      status: "created",
      value: {
        projectId: input.projectId,
        customerId: result.value.customerId,
        ownerId: result.value.ownerId,
        normalizedEmail: result.value.normalizedEmail,
      },
    };
  }

  async findByEmail(input: {
    readonly projectId: string;
    readonly normalizedEmail: string;
  }): Promise<PersistentCustomerAccountLookup> {
    if (!validProjectId(this.projectId) || input.projectId !== this.projectId || normalizeCustomerEmail(input.normalizedEmail) !== input.normalizedEmail) {
      return unavailable();
    }
    const result = await this.adapter.readCustomerAccountByEmail(input.projectId, input.normalizedEmail);
    if (result.status !== "found") return unavailable();
    if (!result.value) return { status: "not_found" };
    return { status: "found", value: toCredential(result.value) };
  }

  async findByCustomerId(input: {
    readonly projectId: string;
    readonly customerId: string;
  }): Promise<LocalPersistentCustomerAccountIdentity | null | { readonly status: "unavailable" }> {
    if (!validProjectId(this.projectId) || input.projectId !== this.projectId || !input.customerId.trim()) {
      return { status: "unavailable" };
    }
    const result = await this.adapter.readCustomerAccountById(input.projectId, input.customerId);
    if (result.status !== "found") return { status: "unavailable" };
    return result.value;
  }
}

function toCredential(value: LocalPersistentCustomerAccountCredential): PersistentCustomerAccountCredential {
  return {
    projectId: value.projectId,
    customerId: value.customerId,
    ownerId: value.ownerId,
    normalizedEmail: value.normalizedEmail,
    subjectHash: value.subjectHash,
    passwordHash: value.passwordHash,
    accountStatus: value.accountStatus,
  };
}
