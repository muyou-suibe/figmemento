"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublicProductAssetView } from "../application/catalog-assets";
import {
  applyProductCustomizationActionForConfiguration,
  applyVariantSelectionToProductCustomizationDraft,
  initializeProductCustomizationDraftForConfiguration,
  type ProductDetailVariantSelectionEvent,
} from "../application/product-detail-customization-composition";
import { evaluateProductCustomizationHandoff } from "../application/product-customization-handoff-gate.ts";
import { createProductCustomizationSummary } from "../application/product-customization-summary.ts";
import type { PublicProductCustomization } from "../application/customization-product-detail";
import {
  formatListingPrice,
  type PublicSelectorVariant,
} from "../application/catalog-storefront";
import type { ListingPrice, ProductOption, ProductOptionValue } from "../domain/catalog";
import {
  createProductCustomizationDraft,
  type ProductCustomizationDraft,
  type ProductCustomizationDraftAction,
} from "../domain/product-customization-draft";
import { ProductAssetGallery } from "./ProductAssetGallery";
import { ProductCustomizationFormShell } from "./ProductCustomizationFormShell";
import { ProductCustomizationHandoffGate } from "./ProductCustomizationHandoffGate.tsx";
import { ProductCustomizationSummary } from "./ProductCustomizationSummary.tsx";
import { AddToCartButton } from "./AddToCartButton.tsx";
import { VariantSelector } from "./VariantSelector";
import styles from "./catalog-storefront.module.css";
import { LocalProductReviews } from "./LocalProductReviews";
import { trackLocalAnalyticsEvent } from "../client/local-analytics.ts";
import { useReferenceLanguage } from "./ReferenceLanguageProvider";
import {
  createPersistentCustomizationDraft,
  hydratePersistentDraftImages,
  readPersistentCustomizationDraft,
  restorePersistentCustomizationDraft,
  savePersistentCustomizationDraft,
  type BrowserConfirmedDraft,
  type BrowserRestoredDraft,
  type PersistentCustomizationDraftController,
  selectPersistentDraftProjection,
} from "../client/local-persistent-draft.ts";

export interface ProductDetailExperienceProps {
  productId: string;
  productName: string;
  productDescription: string;
  categoryName: string;
  listingPrice: ListingPrice;
  fulfillment: {
    fulfillmentType: string;
    productionMode: string;
    leadTimeLabel: string;
    requiresShipping: boolean;
  };
  options: readonly ProductOption[];
  optionValues: readonly ProductOptionValue[];
  variants: readonly PublicSelectorVariant[];
  assets: readonly PublicProductAssetView[];
  customization: PublicProductCustomization;
  persistentDraftEnabled?: boolean;
}

export function ProductDetailExperience(props: ProductDetailExperienceProps) {
  return <ProductDetailExperienceForProduct key={props.productId} {...props} />;
}

function localizeLeadTime(value: string, t: (value: string) => string): string {
  const match = /^(\d+)(?:–(\d+))? business days$/.exec(value);
  if (!match) return t(value);
  const range = match[2] ? `${match[1]}–${match[2]}` : match[1];
  return `${range} ${t("business days")}`;
}

function ProductDetailExperienceForProduct(props: ProductDetailExperienceProps) {
  const { t } = useReferenceLanguage();
  const customizationConfiguration = props.customization.status === "configured"
    ? props.customization
    : null;
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [lastVariantSelection, setLastVariantSelection] = useState<ProductDetailVariantSelectionEvent | null>(null);
  const customizationEventSent = useRef(false);
  const [persistentProjection, setPersistentProjection] = useState<BrowserConfirmedDraft | null>(null);
  const persistentProjectionRef = useRef<BrowserConfirmedDraft | null>(null);
  const persistentCreateKey = useRef<string | null>(null);
  const persistentCreatePromise = useRef<Promise<ReturnType<typeof createPersistentCustomizationDraft> extends Promise<infer R> ? R : never> | null>(null);
  const restoreStarted = useRef(false);
  const restorePromise = useRef<Promise<void> | null>(null);
  const localEditEpoch = useRef(0);
  const [restoredDraft, setRestoredDraft] = useState<BrowserRestoredDraft | null>(null);
  const [draft, setDraft] = useState<ProductCustomizationDraft | null>(() =>
    props.customization.status === "configured"
      ? createProductCustomizationDraft({
          productId: props.productId,
          configurationRevision: props.customization.configurationRevision,
        })
      : null,
  );
  const visibleDraft = customizationConfiguration
    ? initializeProductCustomizationDraftForConfiguration(draft, {
        productId: props.productId,
        configurationRevision: customizationConfiguration.configurationRevision,
        variantSelection: lastVariantSelection,
      })
    : null;
  const handleVariantSelection = useCallback((event: ProductDetailVariantSelectionEvent) => {
    // VariantSelector emits its empty initial projection on mount. That is not
    // a customer edit and must not fence an exact durable Draft restore.
    if (event.selectedOptions.length > 0) localEditEpoch.current += 1;
    const resolved = event.resolved?.productId === props.productId ? event.resolved : null;
    setSelectedVariantId(resolved?.variantId ?? null);
    setLastVariantSelection(event);
    if (!customizationConfiguration) return;
    setDraft((current) => applyVariantSelectionToProductCustomizationDraft(
      initializeProductCustomizationDraftForConfiguration(current, {
        productId: props.productId,
        configurationRevision: customizationConfiguration.configurationRevision,
        variantSelection: lastVariantSelection,
      }),
      event,
    ));
  }, [customizationConfiguration, lastVariantSelection, props.productId]);
  const handleCustomizationAction = useCallback((action: ProductCustomizationDraftAction) => {
    if (!customizationConfiguration) return;
    localEditEpoch.current += 1;
    setDraft((current) => applyProductCustomizationActionForConfiguration(current, {
        productId: props.productId,
        configurationRevision: customizationConfiguration.configurationRevision,
        variantSelection: lastVariantSelection,
      action,
    }));
  }, [customizationConfiguration, lastVariantSelection, props.productId]);
  const publishPersistentProjection = useCallback((value: BrowserConfirmedDraft, allowDraftSelection = false) => {
    const next = selectPersistentDraftProjection(persistentProjectionRef.current, value, allowDraftSelection);
    if (!next || next === persistentProjectionRef.current) return;
    persistentProjectionRef.current = next;
    setPersistentProjection(next);
  }, []);
  useEffect(() => {
    if (!props.persistentDraftEnabled || !customizationConfiguration || restoreStarted.current) return;
    restoreStarted.current = true;
    const startingEpoch = localEditEpoch.current;
    restorePromise.current = restorePersistentCustomizationDraft(props.productId).then(result => {
      if (result.status !== "found" || localEditEpoch.current !== startingEpoch || persistentProjectionRef.current) return;
      publishPersistentProjection(result.value.draft, true);
      setRestoredDraft(result.value);
      setDraft(current => current && localEditEpoch.current === startingEpoch
        ? hydratePersistentDraftImages({ current, fields: customizationConfiguration.fields, restored: result.value })
        : current);
    }).finally(() => { restorePromise.current = null; });
  }, [customizationConfiguration, props.persistentDraftEnabled, props.productId, publishPersistentProjection]);
  const ensurePersistentDraft = useCallback(async () => {
    if (!props.persistentDraftEnabled) return { status: "unavailable" as const };
    if (restorePromise.current) await restorePromise.current;
    if (persistentProjectionRef.current) return { status: "found" as const, value: persistentProjectionRef.current };
    if (!persistentCreatePromise.current) {
      persistentCreateKey.current ??= crypto.randomUUID();
      persistentCreatePromise.current = createPersistentCustomizationDraft(props.productId, persistentCreateKey.current)
        .then(result => {
          if (result.status === "found") {
            publishPersistentProjection(result.value, true);
            persistentCreateKey.current = null;
          }
          return result;
        }).finally(() => { persistentCreatePromise.current = null; });
    }
    return persistentCreatePromise.current;
  }, [props.persistentDraftEnabled, props.productId, publishPersistentProjection]);
  const persistentDraftController = useMemo<PersistentCustomizationDraftController | undefined>(() => {
    if (!props.persistentDraftEnabled) return undefined;
    return {
      projection: persistentProjection,
      ensure: ensurePersistentDraft,
      async read(draftId) {
        const result = await readPersistentCustomizationDraft(draftId);
        if (result.status === "found") publishPersistentProjection(result.value);
        return result;
      },
      async saveField(input) {
        const previous = input.base.slots;
        const first = previous.findIndex(slot => slot.fieldId === input.fieldId);
        const retained = previous.filter(slot => slot.fieldId !== input.fieldId);
        const incoming = input.images.map(image => {
          const existing = previous.find(slot => slot.fieldId === input.fieldId
            && slot.receiptReference === image.receiptReference);
          return { ...(existing ? { slotId: existing.slotId } : {}), fieldId: input.fieldId,
            receiptReference: image.receiptReference, ...(image.crop ? { crop: image.crop } : {}) };
        });
        const insertion = first < 0 ? retained.length : previous.slice(0, first).filter(slot => slot.fieldId !== input.fieldId).length;
        const slots = [...retained.slice(0, insertion), ...incoming, ...retained.slice(insertion)];
        const result = await savePersistentCustomizationDraft({ draftId: input.base.draftId,
          expectedVersion: input.base.version, slots, idempotencyKey: input.idempotencyKey });
        if (result.status === "found") publishPersistentProjection(result.value);
        return result;
      },
    };
  }, [ensurePersistentDraft, persistentProjection, props.persistentDraftEnabled, publishPersistentProjection]);
  const summary = customizationConfiguration && visibleDraft
    ? createProductCustomizationSummary({
        draft: visibleDraft,
        configurationRevision: customizationConfiguration.configurationRevision,
        fields: customizationConfiguration.fields,
        options: props.options,
        optionValues: props.optionValues,
      })
    : null;
  const handoffGate = customizationConfiguration && visibleDraft
    ? evaluateProductCustomizationHandoff({
        draft: visibleDraft,
        productId: props.productId,
        configurationRevision: customizationConfiguration.configurationRevision,
        fields: customizationConfiguration.fields,
        options: props.options,
        optionValues: props.optionValues,
        variants: props.variants,
        observedAt: new Date().toISOString(),
    })
    : null;
  useEffect(() => {
    trackLocalAnalyticsEvent({ eventName: "view_item", productId: props.productId });
  }, [props.productId]);
  useEffect(() => {
    if (handoffGate?.status !== "locally_ready" || customizationEventSent.current) return;
    customizationEventSent.current = true;
    trackLocalAnalyticsEvent({ eventName: "customization_complete", productId: props.productId });
  }, [handoffGate?.status, props.productId]);

  return (
    <div className={styles.fusionPdp} data-product-id={props.productId}>
      <div className={styles.detailGrid}>
        <ProductAssetGallery
          productId={props.productId}
          assets={props.assets}
          selectedVariantId={selectedVariantId}
        />
        <div className={styles.detailCopy}>
          <div className={styles.fusionPdpTitleBlock}>
            <p className={styles.eyebrow}>{props.categoryName}</p>
            <h1 className={styles.detailTitle}>{props.productName}</h1>
            <p className={styles.description}>{props.productDescription}</p>
          </div>
          <p className={styles.listingPrice}>{formatListingPrice(props.listingPrice)}</p>
          <section className={styles.fusionPdpSpec} aria-labelledby="product-details-heading">
            <div className={styles.fusionPdpSpecHeading}>
              <span>{t("Product details")}</span>
              <h2 id="product-details-heading">{t("At a glance")}</h2>
            </div>
            <dl className={styles.fulfillment}>
              <div>
                <dt>{t("Delivery format")}</dt>
                <dd>{t(props.fulfillment.fulfillmentType)}</dd>
              </div>
              <div>
                <dt>{t("Production")}</dt>
                <dd>{t(props.fulfillment.productionMode)}</dd>
              </div>
              <div>
                <dt>{t("Production lead time")}</dt>
                <dd>{localizeLeadTime(props.fulfillment.leadTimeLabel, t)}</dd>
              </div>
              <div>
                <dt>{t("Shipping")}</dt>
                <dd>{props.fulfillment.requiresShipping ? t("Required") : t("Not required")}</dd>
              </div>
            </dl>
          </section>
          <VariantSelector
            productId={props.productId}
            options={props.options}
            optionValues={props.optionValues}
            variants={props.variants}
            listingPrice={props.listingPrice}
            onSelectionChange={handleVariantSelection}
          />
          {customizationConfiguration && visibleDraft && (
            <ProductCustomizationFormShell
              configurationRevision={customizationConfiguration.configurationRevision}
              fields={customizationConfiguration.fields}
              draft={visibleDraft}
              onDraftAction={handleCustomizationAction}
              persistentDraft={persistentDraftController}
              restoredDraft={restoredDraft}
              onBeginCustomization={() => trackLocalAnalyticsEvent({ eventName: "begin_customization", productId: props.productId })}
            />
          )}
          {summary && <ProductCustomizationSummary model={summary} />}
          {handoffGate && <ProductCustomizationHandoffGate result={handoffGate} />}
          {handoffGate?.status === "locally_ready" && <AddToCartButton handoff={handoffGate.handoff} />}
          {props.customization.status === "not_configured" && (
            <p className={styles.fixtureNotice} role="status">
              {t("Customization is explicitly unavailable for this local item until its configuration is published.")}
            </p>
          )}
          <LocalProductReviews productId={props.productId} />
        </div>
      </div>
    </div>
  );
}
