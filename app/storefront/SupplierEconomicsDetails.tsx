import type { SupplierEconomicsProjection } from "../application/local-supplier-economics.ts";

function money(cents: number | null, currency: string | null): string {
  return cents === null || currency === null ? "Unknown" : `${currency} ${(cents / 100).toFixed(2)}`;
}

/** Presentation only: all availability and historical-source decisions arrive from the server. */
export function SupplierEconomicsDetails({ value }: { readonly value: SupplierEconomicsProjection }) {
  const cost = value.supplierProductionCost;
  const lead = value.productionLeadTime;
  const weight = value.packagedWeight;
  return <details>
    <summary>{value.authority === "committed_assignment" ? "Committed assignment economics" : "Current source evidence"}</summary>
    <dl>
      {value.authority === "committed_assignment" && <><dt>Customer item revenue — historical line subtotal</dt><dd>{value.customerRevenue.status === "known" ? `${money(value.customerRevenue.amountCents, value.customerRevenue.currency)} · ${value.customerRevenue.quantity} unit(s)` : "Unavailable"} · before Order-level shipping, coupon and tax</dd></>}
      <dt>{cost.status === "known" ? "Supplier production cost per unit" : cost.status === "area_based" ? "Area-based pricing — fixed unit cost unavailable" : cost.status === "manual_quote_required" ? "Manual quote required" : "Supplier production cost unavailable"}</dt>
      <dd>{cost.status === "known" ? money(cost.unitCostCents, cost.currency) : "Unavailable"}</dd>
      <dt>Source quote / pricing basis</dt><dd>{money(cost.amountCents, cost.currency)} · {cost.pricingBasis} · {cost.priceUnit}</dd>
      <dt>Source option surcharge (not added to quote)</dt><dd>{money(cost.optionSurchargeCents, cost.currency)}</dd>
      <dt>Supplier production business days</dt><dd>{lead.status === "known" ? `${lead.minProductionBusinessDays}–${lead.maxProductionBusinessDays}` : "Unavailable"} · production only; excludes international transit, customs and customer delivery</dd>
      <dt>Standard packaged/shipping weight</dt><dd>{weight.status === "known" ? `${weight.grams} g` : "Unknown"} · {weight.reviewStatus}{weight.approvalRequired ? " · approval required" : ""}{weight.rawText ? ` · source: ${weight.rawText}` : ""}</dd>
      <dt>Package dimensions</dt><dd>Unknown</dd>
      <dt>Fact review (separate from catalog mapping)</dt><dd>{value.factReviewStatus}</dd>
      <dt>Landed cost / gross margin</dt><dd>Unavailable</dd>
    </dl>
    <p>Logistics, duties, tariffs, payment fees, warehouse cost, packaging extras, returns/rework, carrier charges and customs costs: unavailable. No FX conversion or margin calculation.</p>
    {value.provenance.length === 0 ? <p>Source provenance unavailable.</p> : <ul>{value.provenance.map((source, index) => <li key={`${source.sourceRow}-${index}`}>
      Source row {source.sourceRow} · {source.reviewStatus} · {source.reviewNote}
      {source.sourceUrl && <span> · Source URL: {source.sourceUrl}</span>}
      <br />Raw quote: {source.quotedPrice ?? "Unknown"}; packaged weight: {source.packagedWeight ?? "Unknown"}; production min/max: {source.fastestProductionDays ?? "Unknown"} / {source.slowestProductionDays ?? "Unknown"}.
    </li>)}</ul>}
  </details>;
}
