import {
  evaluateFreshLocalCheckout,
  type FreshLocalCheckoutAuthorityResult,
  type LocalCheckoutEvaluatorDependencies,
} from "./local-checkout-evaluator.ts";
import type {
  LocalOrderBrowserCapability,
  LocalOrderCreationResult,
  LocalOrderRepository,
  LocalOrderSnapshotDraft,
} from "./local-order-repository.ts";
import {
  type LocalOrderCreateRequest,
} from "../domain/local-order.ts";
import type { LocalCheckoutIssue } from "../domain/local-checkout.ts";
import type { ConfiguredItemHandoff } from "../domain/configured-item.ts";
import type { LocalOrderMultiSelectChoiceFact, LocalOrderSingleSelectChoiceFact } from "../domain/local-order.ts";
import type { CustomizationMultiSelectValue, CustomizationSingleSelectValue } from "../domain/customization-value.ts";
import type { CustomerPointsRepository } from "./customer-points.ts";

export interface LocalOrderCreationDependencies extends LocalCheckoutEvaluatorDependencies {
  readonly repository: LocalOrderRepository;
  readonly now?: () => string;
  /** Derived from the authenticated server session; absent for guest checkout. */
  readonly customerId?: string;
  readonly pointsRepository?: CustomerPointsRepository;
}

export interface LocalOrderApplicationIssue {
  readonly code: "conflict" | "unavailable";
  readonly message: string;
}

export type LocalOrderCreationFailure =
  | { readonly status: "blocked" | "unavailable"; readonly issues: readonly LocalCheckoutIssue[] }
  | { readonly status: "conflict" | "failed"; readonly issues: readonly LocalOrderApplicationIssue[] };

export type LocalOrderCreationApplicationResult =
  | Extract<LocalOrderCreationResult, { status: "created" | "existing" }>
  | LocalOrderCreationFailure;

function conflictIssue(): LocalOrderApplicationIssue {
  return {
    code: "conflict",
    message: "This Local Order attempt no longer matches current server state.",
  };
}

function unavailableIssue(): LocalOrderApplicationIssue {
  return {
    code: "unavailable",
    message: "Local Order is temporarily unavailable.",
  };
}

function canonicalHandoff(handoff: ConfiguredItemHandoff): string {
  return JSON.stringify({
    productId: handoff.productId,
    variantId: handoff.variantId,
    skuCode: handoff.skuCode,
    selectedOptions: handoff.selectedOptions.map((selection) => ({
      optionId: selection.optionId,
      valueId: selection.valueId,
    })),
    configurationRevision: handoff.configurationRevision,
    customizationValues: handoff.customizationValues.map((value) => value.kind === "image"
      ? {
          fieldId: value.fieldId,
          fieldCode: value.fieldCode,
          kind: value.kind,
          images: value.images.map((image) => ({
            receiptId: image.receiptId,
            ...(image.crop ? { crop: { ...image.crop } } : {}),
          })),
        }
      : value.kind === "multi_select"
        ? { fieldId: value.fieldId, fieldCode: value.fieldCode, kind: value.kind, choiceIds: [...value.choiceIds] }
        : value.kind === "single_select"
        ? {
            fieldId: value.fieldId,
            fieldCode: value.fieldCode,
            kind: value.kind,
            choiceId: value.choiceId,
          }
        : value.kind === "numeric"
          ? { fieldId: value.fieldId, fieldCode: value.fieldCode, kind: value.kind, value: value.value }
        : value.kind === "generic_file"
          ? { fieldId: value.fieldId, fieldCode: value.fieldCode, kind: value.kind, files: value.files.map((file) => ({ ...file })) }
        : {
            fieldId: value.fieldId,
            fieldCode: value.fieldCode,
            kind: value.kind,
            value: value.value,
          }),
  });
}

function deriveAuthorityKey(
  cartId: string,
  evaluated: Extract<FreshLocalCheckoutAuthorityResult, { status: "accepted" }>,
): string {
  return JSON.stringify([
    "cart",
    cartId,
    evaluated.lines.map((line) => ({
      lineId: line.cartLine.lineId,
      handoff: canonicalHandoff(line.handoff),
      productId: line.summary.productId,
      productName: line.summary.productName,
      productSlug: line.summary.productSlug,
      variantId: line.summary.variantId,
      skuCode: line.summary.skuCode,
      selectedOptions: line.summary.selectedOptions,
      quantity: line.summary.quantity,
      unitBasePriceCents: line.summary.unitBasePriceCents,
      currency: line.summary.currency,
      fulfillmentType: line.summary.fulfillmentType,
      lineSubtotalCents: line.summary.lineSubtotalCents,
    })),
    evaluated.value.currency,
    evaluated.value.subtotalCents,
    evaluated.value.shipping,
    evaluated.value.coupon,
    evaluated.value.tax,
    evaluated.value.localDemoTotalCents,
  ]);
}

async function deriveInputFingerprint(request: LocalOrderCreateRequest): Promise<string> {
  const canonicalInput = JSON.stringify([
    request.address.email,
    request.address.firstName,
    request.address.lastName,
    request.address.country,
    request.address.stateProvince ?? "",
    request.address.city,
    request.address.addressLine1,
    request.address.postalCode,
    request.address.phone ?? "",
    request.shippingMethod,
    request.couponCode ?? "",
  ]);
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalInput),
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createSnapshotDraft(
  evaluated: Extract<FreshLocalCheckoutAuthorityResult, { status: "accepted" }>,
  address: LocalOrderCreateRequest["address"],
  customerId: string | undefined,
  singleSelectChoiceFactsByLine: ReadonlyMap<string, readonly LocalOrderSingleSelectChoiceFact[]>,
  multiSelectChoiceFactsByLine: ReadonlyMap<string, readonly LocalOrderMultiSelectChoiceFact[]>,
): LocalOrderSnapshotDraft {
  return {
    ...(customerId ? { customerId } : {}),
    contact: { ...address },
    commercial: {
      currency: evaluated.value.currency,
      subtotalCents: evaluated.value.subtotalCents,
      shipping: { ...evaluated.value.shipping },
      coupon: { ...evaluated.value.coupon },
      ...(evaluated.value.promotionDiscountCents !== undefined ? { promotionDiscountCents: evaluated.value.promotionDiscountCents } : {}),
      ...(evaluated.value.pointsDiscountCents !== undefined ? { pointsDiscountCents: evaluated.value.pointsDiscountCents } : {}),
      ...(evaluated.value.pointsRedeemed !== undefined ? { pointsRedeemed: evaluated.value.pointsRedeemed } : {}),
      tax: { ...evaluated.value.tax },
      localArithmeticTotalCents: evaluated.value.localDemoTotalCents,
      developmentOnly: true,
    },
    lines: evaluated.lines.map((line) => ({
      productId: line.summary.productId,
      productName: line.summary.productName,
      productSlug: line.summary.productSlug,
      variantId: line.summary.variantId,
      skuCode: line.summary.skuCode,
      selectedOptions: line.summary.selectedOptions.map((selection) => ({ ...selection })),
      quantity: line.summary.quantity,
      unitBasePriceCents: line.summary.unitBasePriceCents,
      currency: line.summary.currency,
      fulfillmentType: line.summary.fulfillmentType,
      lineSubtotalCents: line.summary.lineSubtotalCents,
      customization: {
        configurationRevision: line.handoff.configurationRevision,
        values: line.handoff.customizationValues,
        ...(singleSelectChoiceFactsByLine.has(line.cartLine.lineId)
          ? { singleSelectChoiceFacts: singleSelectChoiceFactsByLine.get(line.cartLine.lineId) }
          : {}),
        ...(multiSelectChoiceFactsByLine.has(line.cartLine.lineId)
          ? { multiSelectChoiceFacts: multiSelectChoiceFactsByLine.get(line.cartLine.lineId) }
          : {}),
      },
    })),
  };
}

type SingleSelectChoiceFactsResolution =
  | { readonly status: "resolved"; readonly byLine: ReadonlyMap<string, readonly LocalOrderSingleSelectChoiceFact[]> }
  | { readonly status: "unavailable" };

type MultiSelectChoiceFactsResolution =
  | { readonly status: "resolved"; readonly byLine: ReadonlyMap<string, readonly LocalOrderMultiSelectChoiceFact[]> }
  | { readonly status: "unavailable" };

async function resolveSingleSelectChoiceFacts(
  evaluated: Extract<FreshLocalCheckoutAuthorityResult, { status: "accepted" }>,
  repository: LocalOrderCreationDependencies["customizationFieldRepository"],
): Promise<SingleSelectChoiceFactsResolution> {
  const configurations = new Map<string, Awaited<ReturnType<typeof repository.getCustomizationFieldsForProduct>>>();
  const byLine = new Map<string, readonly LocalOrderSingleSelectChoiceFact[]>();
  for (const line of evaluated.lines) {
    const singleSelectValues = line.handoff.customizationValues.filter(
      (value): value is CustomizationSingleSelectValue => value.kind === "single_select",
    );
    if (singleSelectValues.length === 0) continue;

    let configuration = configurations.get(line.handoff.productId);
    if (!configuration) {
      try {
        configuration = await repository.getCustomizationFieldsForProduct(line.handoff.productId);
      } catch {
        return { status: "unavailable" };
      }
      configurations.set(line.handoff.productId, configuration);
    }
    if (configuration.status !== "found"
      || configuration.value.productId !== line.handoff.productId
      || configuration.value.configurationRevision !== line.handoff.configurationRevision) {
      return { status: "unavailable" };
    }

    const facts: LocalOrderSingleSelectChoiceFact[] = [];
    for (const value of singleSelectValues) {
      const field = configuration.value.fields.find((candidate) =>
        candidate.id === value.fieldId
        && candidate.code === value.fieldCode
        && candidate.kind === "single_select"
        && candidate.isActive
      );
      if (!field || field.kind !== "single_select") return { status: "unavailable" };
      const choice = field.constraints.choices.find((candidate) => candidate.id === value.choiceId && candidate.isActive);
      if (!choice) return { status: "unavailable" };
      facts.push({
        fieldId: field.id,
        fieldCode: field.code,
        fieldLabel: field.label,
        choiceId: choice.id,
        choiceCode: choice.code,
        choiceLabel: choice.label,
        position: choice.position,
      });
    }
    byLine.set(line.cartLine.lineId, facts);
  }
  return { status: "resolved", byLine };
}

async function resolveMultiSelectChoiceFacts(
  evaluated: Extract<FreshLocalCheckoutAuthorityResult, { status: "accepted" }>,
  repository: LocalOrderCreationDependencies["customizationFieldRepository"],
): Promise<MultiSelectChoiceFactsResolution> {
  const configurations = new Map<string, Awaited<ReturnType<typeof repository.getCustomizationFieldsForProduct>>>();
  const byLine = new Map<string, readonly LocalOrderMultiSelectChoiceFact[]>();
  for (const line of evaluated.lines) {
    const values = line.handoff.customizationValues.filter((value): value is CustomizationMultiSelectValue => value.kind === "multi_select");
    if (values.length === 0) continue;
    let configuration = configurations.get(line.handoff.productId);
    if (!configuration) {
      try { configuration = await repository.getCustomizationFieldsForProduct(line.handoff.productId); } catch { return { status: "unavailable" }; }
      configurations.set(line.handoff.productId, configuration);
    }
    if (configuration.status !== "found" || configuration.value.productId !== line.handoff.productId || configuration.value.configurationRevision !== line.handoff.configurationRevision) return { status: "unavailable" };
    const facts: LocalOrderMultiSelectChoiceFact[] = [];
    for (const value of values) {
      const field = configuration.value.fields.find((candidate) => candidate.id === value.fieldId && candidate.code === value.fieldCode && candidate.kind === "multi_select" && candidate.isActive);
      if (!field || field.kind !== "multi_select") return { status: "unavailable" };
      const selectedChoices = value.choiceIds.map((choiceId) => field.constraints.choices.find((choice) => choice.id === choiceId && choice.isActive));
      if (selectedChoices.some((choice) => !choice)) return { status: "unavailable" };
      facts.push({ fieldId: field.id, fieldCode: field.code, fieldLabel: field.label, selectedChoices: selectedChoices.map((choice) => ({ fieldId: field.id, fieldCode: field.code, fieldLabel: field.label, choiceId: choice!.id, choiceCode: choice!.code, choiceLabel: choice!.label, position: choice!.position })) });
    }
    byLine.set(line.cartLine.lineId, facts);
  }
  return { status: "resolved", byLine };
}

/**
 * Fresh server-side Local Order creation. It owns the only transition from
 * current Cart authority to the process-memory repository and never accepts a
 * browser Checkout result as input.
 */
export class LocalOrderCreationService {
  private readonly dependencies: LocalOrderCreationDependencies;

  constructor(dependencies: LocalOrderCreationDependencies) {
    this.dependencies = dependencies;
  }

  async create(
    cartId: string | null,
    request: LocalOrderCreateRequest,
    existingBrowserCapability?: LocalOrderBrowserCapability,
  ): Promise<LocalOrderCreationApplicationResult> {
    let evaluated: FreshLocalCheckoutAuthorityResult;
    try {
      evaluated = await evaluateFreshLocalCheckout(
        cartId,
        request,
        this.dependencies,
        this.dependencies.now?.() ?? new Date().toISOString(),
      );
    } catch {
      return {
        status: "unavailable",
        issues: [{ code: "CHECKOUT_UNAVAILABLE", message: "Local Order cannot be evaluated right now." }],
      };
    }
    if (evaluated.status !== "accepted") return evaluated;

    let inputFingerprint: string;
    try {
      inputFingerprint = await deriveInputFingerprint(request);
    } catch {
      return { status: "failed", issues: [unavailableIssue()] };
    }
    const choiceFacts = await resolveSingleSelectChoiceFacts(evaluated, this.dependencies.customizationFieldRepository);
    if (choiceFacts.status !== "resolved") {
      return { status: "unavailable", issues: [{ code: "CHECKOUT_UNAVAILABLE", message: "Local Order cannot be evaluated right now." }] };
    }
    const multiChoiceFacts = await resolveMultiSelectChoiceFacts(evaluated, this.dependencies.customizationFieldRepository);
    if (multiChoiceFacts.status !== "resolved") return { status: "unavailable", issues: [{ code: "CHECKOUT_UNAVAILABLE", message: "Local Order cannot be evaluated right now." }] };
    const snapshot = createSnapshotDraft(
      evaluated,
      request.address,
      this.dependencies.customerId,
      choiceFacts.byLine,
      multiChoiceFacts.byLine,
    );
    let result: LocalOrderCreationResult;
    try {
      result = await this.dependencies.repository.findOrCreate({
        creationAttemptId: request.creationAttemptId,
        context: {
          cartId: evaluated.cart.cartId,
          authorityKey: deriveAuthorityKey(evaluated.cart.cartId, evaluated),
        },
        inputFingerprint,
        snapshot,
        ...(existingBrowserCapability ? { existingBrowserCapability } : {}),
      });
    } catch {
      return { status: "failed", issues: [unavailableIssue()] };
    }
    if (result.status === "conflict") return { status: "conflict", issues: [conflictIssue()] };
    if (result.status === "failed") return { status: "failed", issues: [unavailableIssue()] };
    if (this.dependencies.customerId && this.dependencies.pointsRepository && result.snapshot.commercial.pointsRedeemed) {
      this.dependencies.pointsRepository.reserveForOrder({
        customerId: this.dependencies.customerId,
        orderReference: result.snapshot.publicReference,
        points: result.snapshot.commercial.pointsRedeemed,
        now: this.dependencies.now?.() ?? new Date().toISOString(),
      });
    }
    return result;
  }
}
