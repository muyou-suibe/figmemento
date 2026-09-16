import type { RuntimeEnvironment } from "../../config/server.ts";
import { resolveLocalPersistentComposition } from "../../application/local-persistent-commerce-composition.server.ts";
import { calculateCouponDiscount } from "../../application/pricing.ts";
import { createNotActivatedTaxState, type LocalCouponResult, type LocalShippingResult } from "../../domain/local-checkout.ts";
import { isRecord } from "../../domain/catalog/validation.ts";
import { LocalCatalogAuthority } from "./local-catalog-authority.server.ts";
import type { LocalPersistentSupabaseClientFactory } from "./local-persistent-supabase-adapter.server.ts";

interface ShippingRule {
  kind: "shipping";
  ruleRevision: number;
  country: string;
  method: string;
  currency: "USD";
  eligible: boolean;
  amountCents: number;
  minSubtotalCents: number;
  minDisplayDays: number;
  maxDisplayDays: number;
}
interface CouponRule {
  kind: "coupon";
  ruleRevision: number;
  code: string;
  currency: "USD";
  eligible: boolean;
  minSubtotalCents: number;
  validFrom: string;
  expiresAt: string;
  discountType: "fixed" | "percent";
  discountValue: number;
}
function nonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function parseRule(value: unknown, revision: unknown): ShippingRule | CouponRule | null {
  if(!isRecord(value) || value.ruleRevision !== revision || !nonnegative(revision) || revision === 0
    || value.currency !== "USD" || typeof value.eligible !== "boolean" || !nonnegative(value.minSubtotalCents)) return null;
  if(value.kind === "shipping" && typeof value.country === "string" && /^[A-Z]{2}$/.test(value.country)
    && typeof value.method === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(value.method)
    && nonnegative(value.amountCents) && nonnegative(value.minDisplayDays) && nonnegative(value.maxDisplayDays)
    && value.minDisplayDays <= value.maxDisplayDays) {
    return {kind:"shipping",ruleRevision:revision,country:value.country,method:value.method,currency:"USD",eligible:value.eligible,
      amountCents:value.amountCents,minSubtotalCents:value.minSubtotalCents,minDisplayDays:value.minDisplayDays,maxDisplayDays:value.maxDisplayDays};
  }
  if(value.kind === "coupon" && typeof value.code === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value.code)
    && typeof value.validFrom === "string" && typeof value.expiresAt === "string"
    && Number.isFinite(Date.parse(value.validFrom)) && Date.parse(value.expiresAt)>Date.parse(value.validFrom)
    && (value.discountType === "fixed" || value.discountType === "percent") && nonnegative(value.discountValue)
    && (value.discountType!=="percent" || value.discountValue<=100)) {
    return {kind:"coupon",ruleRevision:revision,code:value.code,currency:"USD",eligible:value.eligible,minSubtotalCents:value.minSubtotalCents,
      validFrom:value.validFrom,expiresAt:value.expiresAt,discountType:value.discountType,discountValue:value.discountValue};
  }
  return null;
}
export interface PersistentRuleInput {
  readonly country?: string;
  readonly method?: string;
  readonly requiresShipping: boolean; // supplied by server-resolved fulfillment, never an HTTP authority flag
  readonly subtotalCents: number;
  readonly currency: string;
  readonly couponCode?: string;
  readonly expectedVersions?: Readonly<Record<string, number>>;
}
type Shipping = LocalShippingResult | { readonly status: "not_applicable"; readonly amountCents: 0; readonly developmentOnly: true };
export type PersistentRulesResult =
  | { readonly status:"found"; readonly value:{ readonly shipping:Shipping; readonly coupon:LocalCouponResult;
      readonly tax:ReturnType<typeof createNotActivatedTaxState>; readonly versions:Readonly<Record<string,number>>; readonly developmentOnly:true } }
  | { readonly status:"unavailable" };

/** Read-only rule resolution. No Checkout session, Cart mutation, or provider. */
export class LocalCheckoutRuleAuthority {
  private readonly environment: RuntimeEnvironment;
  private readonly clientFactory?: LocalPersistentSupabaseClientFactory;
  constructor(environment:RuntimeEnvironment, clientFactory?:LocalPersistentSupabaseClientFactory) {
    this.environment=environment; this.clientFactory=clientFactory;
  }
  async evaluate(input:PersistentRuleInput, serverNowMilliseconds:number = Date.now()):Promise<PersistentRulesResult> {
    const unavailable = {status:"unavailable" as const};
    if(resolveLocalPersistentComposition(this.environment,{requiredCapabilities:["checkout"]}).status!=="ready"
      || !nonnegative(input.subtotalCents) || input.currency!=="USD" || !Number.isFinite(serverNowMilliseconds)
      || typeof input.requiresShipping!=="boolean") return unavailable;
    const snapshot = await new LocalCatalogAuthority(this.environment,this.clientFactory).readSnapshot(input.expectedVersions);
    if(snapshot.status!=="found") return unavailable;
    const rules = snapshot.value.rules.map(r=>parseRule(r.definition,r.revision));
    if(rules.some(r=>r===null)) return unavailable;
    const shippingRules = rules.filter((r):r is ShippingRule=>r?.kind==="shipping");
    const couponRules = rules.filter((r):r is CouponRule=>r?.kind==="coupon");
    if(new Set(shippingRules.map(r=>`${r.country}:${r.method}`)).size!==shippingRules.length
      || new Set(couponRules.map(r=>r.code)).size!==couponRules.length) return unavailable;
    let shipping:Shipping = {status:"not_applicable",amountCents:0,developmentOnly:true};
    if(input.requiresShipping) {
      const r=shippingRules.find(r=>r.country===input.country?.toUpperCase() && r.method===input.method);
      shipping = r && r.eligible && input.subtotalCents>=r.minSubtotalCents
        ? {status:"eligible",country:r.country,method:r.method,amountCents:r.amountCents,currency:r.currency,
          estimatedRange:`Local demo estimate: ${r.minDisplayDays}–${r.maxDisplayDays} days`,developmentOnly:true}
        : {status:"unsupported",issueCode:"SHIPPING_UNAVAILABLE",developmentOnly:true};
    }
    const code=input.couponCode?.trim();
    if(code && !/^[A-Za-z0-9_-]{1,64}$/.test(code)) return {status:"found",value:{shipping,coupon:{status:"invalid",discountCents:0,developmentOnly:true},tax:createNotActivatedTaxState(),versions:snapshot.value.versions,developmentOnly:true}};
    const rule=couponRules.find(r=>r.code===code);
    let coupon:LocalCouponResult = {status:code?"invalid":"not_selected",discountCents:0,...(code?{code}:{}),developmentOnly:true};
    if(rule) {
      if(serverNowMilliseconds>=Date.parse(rule.expiresAt)) coupon={...coupon,status:"expired"};
      else if(!rule.eligible || serverNowMilliseconds<Date.parse(rule.validFrom) || input.subtotalCents<rule.minSubtotalCents) coupon={...coupon,status:"not_applicable"};
      else coupon={...coupon,status:"valid",discountCents:calculateCouponDiscount({discount_type:rule.discountType,discount_value:rule.discountValue},input.subtotalCents)};
    }
    if(!nonnegative(coupon.discountCents)) return unavailable;
    return {status:"found",value:{shipping,coupon,tax:createNotActivatedTaxState(),versions:snapshot.value.versions,developmentOnly:true}};
  }
}
