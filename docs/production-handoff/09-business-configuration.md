# 09 — Business configuration checklist

Overall status: **BUSINESS CONFIGURATION REQUIRED**.

Technical integration and business inputs are tracked separately. Integration
must not invent missing commercial facts merely to make a test pass.

## Business input required

### Brand and customer service

- [ ] Final brand name; reconcile current `FigMemento` code identity with the
  requirement document's provisional `PhotoGift` name.
- [ ] Canonical domain and approved staging/preview domains.
- [ ] Final logo and permitted variants.
- [ ] Brand colors, fonts and usage guide.
- [ ] Customer-support email and service hours.
- [ ] Returns/remake address and responsible legal entity.
- [ ] Launch language: currently expected English.
- [ ] Launch countries: proposed US, UK, Canada and Australia; confirm each.
- [ ] Launch currency: proposed USD; confirm settlement/display policy.

### Catalog and content

- [ ] Initial launch Products and category hierarchy.
- [ ] Canonical SKU/Variant codes, options and availability.
- [ ] Product fulfillment classification: physical, digital or mixed.
- [ ] Product-specific customization fields and validation constraints.
- [ ] Whether each Product requires production preview.
- [ ] Product photos, videos, examples and SEO/social images with usage rights.
- [ ] English Product/category/SEO copy and customer instructions.
- [ ] Production lead-time ranges and non-guaranteed delivery wording.
- [ ] Digital-delivery duration/download-limit policy per applicable Product.

The requirements mention at least 21 test SKUs, but the launch assortment must
be confirmed from actual supplier, margin and content evidence. Do not hardcode
21 placeholder SKUs into production.

### Supplier and unit economics

- [ ] Supplier mapping for every physical SKU.
- [ ] Supplier contact and operational escalation owner.
- [ ] Supplier cost, currency and validity date.
- [ ] Minimum order, setup/sample and remake costs.
- [ ] Production method and realistic lead-time range.
- [ ] Product/package weight and dimensions.
- [ ] Quality criteria, photo suitability rules and remake policy.
- [ ] Factory submission and manual fallback process.

Supplier persistence/integration remains **DEFERRED / NOT AUTHORIZED**. These
inputs are still required for launch planning and manual operations.

### Shipping and promotions

- [ ] Launch destination eligibility and exclusions.
- [ ] Shipping methods, service names and currencies.
- [ ] Country/region, weight, quantity and Product-type rules.
- [ ] Estimated ranges; no guaranteed international arrival date.
- [ ] Free-shipping threshold; requirement baseline suggests `$49`, but confirm.
- [ ] Coupon strategy and approved campaigns.
- [ ] Percentage/fixed/free-shipping applicability and stacking policy.
- [ ] Usage limits, date windows, minimums, country/Product/customer restrictions.
- [ ] Treatment of zero-total Orders and provider/payment behavior.

### Legal and policy

- [ ] Refund/remake/cancellation policy.
- [ ] Custom-product no-reason-return position and jurisdiction review.
- [ ] Privacy policy, including customer images, account/order data, retention,
  deletion and provider processing.
- [ ] Terms of service.
- [ ] Shipping and returns policy.
- [ ] Cookie/analytics consent policy.
- [ ] Account deletion and legal-retention procedure.
- [ ] Digital-download license/usage terms.

## Technical integration checklist

Classification: **PRODUCTION INTEGRATION REQUIRED**.

- [ ] Cloudflare project, environments, rollback and access controls.
- [ ] Production Supabase project and approved canonical migration plan.
- [ ] Supabase Auth OTP/Google and server-session integration.
- [ ] Production private Storage provider and renderer strategy.
- [ ] Stripe and PayPal provider adapters/webhooks/reconciliation/refunds.
- [ ] Transactional email outbox/templates/provider callbacks.
- [ ] Shipping-rule persistence/operations and tracking-provider adapter.
- [ ] GA4/Meta/TikTok plus consent and safe event pipeline.
- [ ] Production Admin identity/roles and audit operation.
- [ ] Logging, monitoring, alerts, backup/restore and incident response.

## Deferred/second phase

- Reviews and post-delivery review automation: **SECOND PHASE**.
- Points, referrals and member tiers: **SECOND PHASE**.
- Abandoned-cart and marketing automation: **SECOND PHASE**.
- Spanish localization: **SECOND PHASE**.
- Expanded supplier/warehouse collaboration and staff roles: **SECOND PHASE**.
- C1 historical backfill and Customization Phase C:
  **DEFERRED / NOT AUTHORIZED** pending separate approval.
