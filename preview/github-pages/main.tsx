/// <reference types="vite/client" />

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { previewBasePath, previewHref, parsePreviewRoute } from "./router.ts";
import {
  DEMO_PAYMENT_NOTICE,
  DEMO_PRICE_NOTICE,
  LOCAL_IMAGE_PREVIEW_NOTICE,
  OPERATOR_PREVIEW_NOTICE,
  PREVIEW_NOTICE,
  PREVIEW_NOTICE_DETAIL,
  TRACKING_PREVIEW_NOTICE,
  previewCategories,
  previewCategoryForSlug,
  previewFulfillmentFixtures,
  previewProductForSlug,
  previewProducts,
  previewProductsForCategory,
  previewPaymentFixtures,
} from "./fixtures.ts";
import {
  addPreviewCartItem,
  applyPreviewFulfillmentAction,
  calculatePreviewCheckoutSummary,
  clearPreviewCart,
  createPreviewCheckoutDraft,
  createPreviewFulfillmentState,
  PREVIEW_ORDER_REFERENCE,
  previewCartSubtotal,
  previewShippingOptions,
  removePreviewCartItem,
  updatePreviewCartQuantity,
} from "./demo-state.ts";
import type {
  PreviewCartItem,
  PreviewCartLineDraft,
  PreviewCheckoutDraft,
  PreviewFulfillmentAction,
  PreviewFulfillmentDemoState,
  PreviewProduct,
  PreviewRoute,
} from "./types.ts";
import "./styles.css";

const BASE_PATH = previewBasePath(import.meta.env.BASE_URL);
type PaymentDemoOutcome = "idle" | "success" | "failed" | "cancelled";

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function navigatePreview(route: string): void {
  if (typeof window !== "undefined") window.location.hash = route;
}

function usePreviewRoute(): PreviewRoute {
  const [route, setRoute] = useState<PreviewRoute>(() =>
    typeof window === "undefined" ? { kind: "home" } : parsePreviewRoute(window.location.hash),
  );
  useEffect(() => {
    const update = () => setRoute(parsePreviewRoute(window.location.hash));
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return route;
}

function PreviewLink({ route, children, className }: { route: string; children: ReactNode; className?: string }) {
  return <a className={className} href={previewHref(route, BASE_PATH)}>{children}</a>;
}

function PreviewNotice() {
  return (
    <aside className="preview-notice" role="status" aria-label="Frontend preview notice">
      <strong>{PREVIEW_NOTICE}</strong>
      <span>{PREVIEW_NOTICE_DETAIL}</span>
    </aside>
  );
}

function Header({ route, cartCount }: { route: PreviewRoute; cartCount: number }) {
  const current = route.kind === "home" ? "/" : route.kind === "shop" || route.kind === "category" ? "/shop" : undefined;
  return (
    <>
      <a className="preview-skip" href="#preview-main">Skip to content</a>
      <header className="preview-header">
        <PreviewLink route="/" className="preview-brand"><span className="preview-brand-mark">✦</span><span>Fig<span>Memento</span></span></PreviewLink>
        <nav className="preview-nav" aria-label="Preview navigation">
          <PreviewLink route="/" className={current === "/" ? "preview-nav-active" : undefined}>Home</PreviewLink>
          <PreviewLink route="/shop" className={current === "/shop" ? "preview-nav-active" : undefined}>Shop</PreviewLink>
          <PreviewLink route="/cart" className={route.kind === "placeholder" && route.route === "/cart" ? "preview-nav-active" : "preview-nav-muted"}>Cart <small>{cartCount > 0 ? `${cartCount} demo ${cartCount === 1 ? "item" : "items"}` : "demo only"}</small></PreviewLink>
        </nav>
        <PreviewLink route="/shop" className="preview-header-cta">Explore gifts <span>→</span></PreviewLink>
      </header>
    </>
  );
}

function Footer() {
  return (
    <footer className="preview-footer">
      <div>
        <PreviewLink route="/" className="preview-brand preview-brand-footer"><span className="preview-brand-mark">✦</span><span>Fig<span>Memento</span></span></PreviewLink>
        <p>A visual preview of meaningful gifts made tangible.</p>
      </div>
      <div className="preview-footer-links">
        <div><strong>Explore</strong><PreviewLink route="/shop">Shop</PreviewLink><PreviewLink route="/category/3d-figures">3D Figures</PreviewLink></div>
        <div><strong>Demo flow</strong><PreviewLink route="/cart">Cart</PreviewLink><PreviewLink route="/checkout">Checkout</PreviewLink><PreviewLink route="/payment">Payment</PreviewLink></div>
        <div><strong>Preview</strong><PreviewLink route="/product/couple-figure">Product Detail</PreviewLink><PreviewLink route="/fulfillment">Fulfillment</PreviewLink><PreviewLink route="/operator">Operator UI</PreviewLink></div>
      </div>
      <p className="preview-footer-bottom">Frontend Preview · No server authority · No real transaction</p>
    </footer>
  );
}

function PreviewLayout({ route, cartCount, children }: { route: PreviewRoute; cartCount: number; children: ReactNode }) {
  return <div className="preview-shell"><Header route={route} cartCount={cartCount} /><PreviewNotice /><main id="preview-main">{children}</main><Footer /></div>;
}

function MediaFallback({ label, compact = false }: { label: string; compact?: boolean }) {
  return <div className={`preview-media-fallback${compact ? " preview-media-fallback-compact" : ""}`} role="img" aria-label={label}><span aria-hidden="true">✦</span><small>{label}</small></div>;
}

function LocalImagePreview({ src }: { src: string }) {
  // Native img is required for browser-local blob URLs; no server image pipeline is involved.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="Selected local browser preview" />;
}

function ProductCard({ product }: { product: PreviewProduct }) {
  const category = previewCategoryForSlug(product.categorySlug);
  const firstAvailable = product.variants.find((variant) => variant.isAvailable) ?? product.variants[0];
  if (!firstAvailable) return null;
  return (
    <article className="preview-card">
      <PreviewLink route={`/product/${product.slug}`} className="preview-card-link">
        <div className="preview-card-media"><MediaFallback label={product.mediaLabel} compact /></div>
        <p className="preview-card-category">{category?.name}</p>
        <h2>{product.name}</h2>
        <div className="preview-card-footer"><span>{product.description}</span><strong>{formatPrice(firstAvailable.priceCents)}</strong></div>
      </PreviewLink>
    </article>
  );
}

function CatalogGrid({ products }: { products: readonly PreviewProduct[] }) {
  return products.length > 0 ? <div className="preview-grid">{products.map((product) => <ProductCard key={product.slug} product={product} />)}</div> : (
    <section className="preview-empty" role="status"><h2>No preview gifts match.</h2><p>Try another category or return to the collection.</p><PreviewLink route="/shop" className="preview-button preview-button-secondary">Show all gifts</PreviewLink></section>
  );
}

function HomePage() {
  return (
    <>
      <section className="preview-hero">
        <div className="preview-hero-copy"><p className="preview-eyebrow">Personal gifts with a human heart</p><h1>Your favorite moments,<br /><em>made tangible.</em></h1><p className="preview-intro">Discover personalized keepsakes shaped around the people, pets, and memories that matter most.</p><PreviewLink route="/shop" className="preview-button preview-button-primary">Browse the collection <span>→</span></PreviewLink></div>
        <div className="preview-hero-art" aria-label="Decorative FigMemento preview artwork"><div className="preview-art-card">A little piece<br /><em>of your story</em></div><span className="preview-art-mark">✦</span></div>
      </section>
      <section className="preview-section preview-section-paper"><div className="preview-section-heading"><div><p className="preview-eyebrow">The FigMemento collection</p><h2>Made for <em>meaningful</em> moments.</h2></div><p>Preview the current catalog language and choose a product to explore its exact presentation SKU.</p></div><CatalogGrid products={previewProducts.slice(0, 3)} /></section>
      <section className="preview-story"><p className="preview-eyebrow">Why FigMemento</p><h2>Some gifts are more than <em>things.</em></h2><p>The best keepsakes bring someone back to a moment, a place, or a little face they love. This preview shows how that feeling could move through the storefront.</p></section>
    </>
  );
}

function ShopPage({ categorySlug }: { categorySlug?: string }) {
  const category = categorySlug ? previewCategoryForSlug(categorySlug) : undefined;
  const [query, setQuery] = useState("");
  const products = category ? previewProductsForCategory(category.slug) : previewProducts;
  const filtered = products.filter((product) => `${product.name} ${product.description}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <section className="preview-section preview-catalog-page"><p className="preview-eyebrow">The FigMemento collection</p><h1>{category ? category.name : <>Little pieces of<br /><em>the people you love.</em></>}</h1><p className="preview-intro">{category?.description ?? "Browse preview gifts by collection, then open a product to explore its exact presentation variant."}</p>
      <div className="preview-catalog-controls"><label>Search gifts<input type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Try portrait, figure…" /></label><div className="preview-category-list" aria-label="Preview category navigation"><PreviewLink route="/shop" className={!category ? "preview-filter-active" : ""}>All gifts</PreviewLink>{previewCategories.map((item) => <PreviewLink key={item.slug} route={`/category/${item.slug}`} className={item.slug === category?.slug ? "preview-filter-active" : ""}>{item.name}</PreviewLink>)}</div></div>
      <p className="preview-results" aria-live="polite">{filtered.length} {filtered.length === 1 ? "gift" : "gifts"}</p><CatalogGrid products={filtered} />
    </section>
  );
}

function ProductPage({ slug, onAddToCart }: { slug: string; onAddToCart: (draft: PreviewCartLineDraft) => void }) {
  const product = previewProductForSlug(slug);
  const [selectedValueId, setSelectedValueId] = useState(product?.variants[0]?.optionValueId ?? "");
  const [note, setNote] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [added, setAdded] = useState(false);
  const previewUrl = useMemo(() => selectedFile ? URL.createObjectURL(selectedFile) : null, [selectedFile]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  if (!product) return <NotFoundPreview label="Product" />;
  const category = previewCategoryForSlug(product.categorySlug);
  const selectedVariant = product.variants.find((variant) => variant.optionValueId === selectedValueId) ?? product.variants[0];
  const selectedLabel = product.options[0]?.values.find((value) => value.id === selectedValueId)?.label ?? "Choose a variant";
  const noteField = product.customizationFields.find((field) => field.kind === "short_text");
  const imageField = product.customizationFields.find((field) => field.kind === "image");

  const addCurrentSelection = () => {
    const customizationSummary = [
      note.trim() ? `Note: ${note.trim()}` : "Text note: not added",
      imageField ? (selectedFile ? "Reference image selected · Local preview only" : "Reference image: not selected") : "No image field",
    ];
    onAddToCart({
      productSlug: product.slug,
      productName: product.name,
      skuCode: selectedVariant.skuCode,
      optionLabel: selectedLabel,
      unitPriceCents: selectedVariant.priceCents,
      customizationSummary,
      imageSelected: Boolean(selectedFile),
      requiresShipping: product.requiresShipping,
    });
    setAdded(true);
    navigatePreview("/cart");
  };

  return <section className="preview-section preview-product-page"><nav className="preview-breadcrumb" aria-label="Breadcrumb"><PreviewLink route="/shop">Shop</PreviewLink><span>/</span>{category && <PreviewLink route={`/category/${category.slug}`}>{category.name}</PreviewLink>}<span>/</span><span>{product.name}</span></nav><div className="preview-product-grid"><div><div className="preview-product-media"><MediaFallback label={product.mediaLabel} /></div><p className="preview-media-caption">Public marketing media presentation · controlled fallback when no local image is available.</p></div><div className="preview-product-copy"><p className="preview-eyebrow">{category?.name}</p><h1>{product.name}</h1><p className="preview-description">{product.description}</p><p className="preview-price">{formatPrice(selectedVariant.priceCents)}</p><p className="preview-price-note">{DEMO_PRICE_NOTICE}</p><dl className="preview-facts"><div><dt>Delivery format</dt><dd>{product.fulfillmentType}</dd></div><div><dt>Production</dt><dd>{product.productionMode.replace("_", " ")}</dd></div><div><dt>Lead time</dt><dd>{product.leadTime}</dd></div><div><dt>Shipping</dt><dd>{product.requiresShipping ? "Required" : "Not required"}</dd></div></dl>
        <section className="preview-control-section" aria-labelledby="preview-variant-heading"><h2 id="preview-variant-heading">Choose your gift</h2>{product.options.map((option) => <fieldset key={option.id}><legend>{option.name} · Required</legend><div className="preview-option-list">{option.values.map((value) => { const variant = product.variants.find((candidate) => candidate.optionValueId === value.id); const disabled = !variant?.isAvailable; return <button key={value.id} type="button" className={value.id === selectedValueId ? "preview-option preview-option-selected" : "preview-option"} disabled={disabled} aria-pressed={value.id === selectedValueId} onClick={() => setSelectedValueId(value.id)}>{value.label}{disabled ? " · unavailable" : ""}</button>; })}</div></fieldset>)}<div className={selectedVariant.isAvailable ? "preview-selection-ready" : "preview-selection-unavailable"} role="status"><strong>{selectedLabel} · {selectedVariant.skuCode}</strong><span>{selectedVariant.isAvailable ? "Available for preview selection" : "Unavailable in this demo catalog"}</span></div></section>
        <section className="preview-control-section" aria-labelledby="preview-customization-heading"><h2 id="preview-customization-heading">Personalize your gift</h2>{noteField && <label className="preview-field"><span>{noteField.label}<small>Optional</small></span><textarea rows={3} maxLength={noteField.maxLength} value={note} onChange={(event) => setNote(event.currentTarget.value)} placeholder="Write a short note for the visual preview" /><small>{note.length}/{noteField.maxLength} characters · presentation only</small></label>}{imageField && <label className="preview-upload-field"><span>{imageField.label}<small>Required</small></span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setSelectedFile(event.currentTarget.files?.[0] ?? null)} />{previewUrl ? <LocalImagePreview src={previewUrl} /> : <strong>Choose a local image to preview</strong>}<small>{LOCAL_IMAGE_PREVIEW_NOTICE}</small></label>}</section>
        <div className="preview-add-area"><button type="button" className="preview-button preview-button-primary" disabled={!selectedVariant.isAvailable} onClick={addCurrentSelection}>Add to Cart — Demo <span>→</span></button>{added && <p className="preview-action-status" role="status">Added to the in-memory preview cart.</p>}</div>
      </div></div></section>;
}

function CartPage({ items, onQuantityChange, onRemove, onClear }: { items: readonly PreviewCartItem[]; onQuantityChange: (lineId: string, delta: number) => void; onRemove: (lineId: string) => void; onClear: () => void }) {
  const subtotal = previewCartSubtotal(items);
  if (items.length === 0) return <section className="preview-section preview-empty preview-cart-page"><p className="preview-eyebrow">Frontend Preview</p><h1>Your demo cart is empty.</h1><p>Choose a preview gift to see the in-memory Cart and Checkout walkthrough.</p><PreviewLink route="/shop" className="preview-button preview-button-primary">Return to Shop <span>→</span></PreviewLink></section>;
  return <section className="preview-section preview-cart-page"><p className="preview-eyebrow">Frontend Preview · Cart</p><h1>Your little collection.</h1><p className="preview-intro">This Cart lives only in React memory. Refreshing the page resets the demo.</p><div className="preview-cart-layout"><div className="preview-cart-items">{items.map((item) => <article className="preview-cart-item" key={item.lineId}><div><p className="preview-card-category">{item.productName}</p><h2>{item.optionLabel}</h2><p className="preview-cart-sku">{item.skuCode}</p>{item.customizationSummary.map((entry) => <p className="preview-cart-detail" key={entry}>{entry}</p>)}</div><div className="preview-cart-item-controls"><strong>{formatPrice(item.unitPriceCents * item.quantity)}</strong><div className="preview-quantity" aria-label={`${item.productName} quantity`}><button type="button" aria-label={`Decrease quantity for ${item.productName}`} onClick={() => onQuantityChange(item.lineId, -1)}>−</button><span>{item.quantity}</span><button type="button" aria-label={`Increase quantity for ${item.productName}`} onClick={() => onQuantityChange(item.lineId, 1)}>+</button></div><button type="button" className="preview-text-button" onClick={() => onRemove(item.lineId)}>Remove</button></div></article>)}</div><aside className="preview-demo-summary" aria-labelledby="preview-cart-summary"><h2 id="preview-cart-summary">Cart summary</h2><div className="preview-summary-row"><span>Subtotal</span><strong>{formatPrice(subtotal)}</strong></div><p>Frontend Preview only · Non-authoritative arithmetic.</p><div className="preview-summary-actions"><PreviewLink route="/checkout" className="preview-button preview-button-primary">Continue to Checkout Demo <span>→</span></PreviewLink><button type="button" className="preview-button preview-button-secondary" onClick={onClear}>Clear demo cart</button><PreviewLink route="/shop" className="preview-text-link">Return to Shop</PreviewLink></div></aside></div></section>;
}

function CheckoutInput({ label, value, onChange, type = "text", required = false, placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; placeholder?: string }) {
  return <label className="preview-form-field"><span>{label}{required && <small>Required</small>}</span><input type={type} value={value} onChange={(event) => onChange(event.currentTarget.value)} required={required} placeholder={placeholder} /></label>;
}

function CheckoutPage({ items, draft, onDraftChange, onContinue }: { items: readonly PreviewCartItem[]; draft: PreviewCheckoutDraft; onDraftChange: (patch: Partial<PreviewCheckoutDraft>) => void; onContinue: () => void }) {
  const summary = calculatePreviewCheckoutSummary(items, draft);
  if (items.length === 0) return <section className="preview-section preview-empty preview-cart-page"><p className="preview-eyebrow">Checkout Demo</p><h1>Add a gift first.</h1><p>This client-only Checkout summary has no Cart items yet.</p><PreviewLink route="/shop" className="preview-button preview-button-primary">Return to Shop <span>→</span></PreviewLink></section>;
  return <section className="preview-section preview-checkout-page"><p className="preview-eyebrow">Frontend Preview · Checkout Demo</p><h1>Almost ready to make it meaningful.</h1><p className="preview-intro">Enter display-only contact and shipping details. No address provider or real checkout authority is connected.</p><div className="preview-checkout-layout"><form className="preview-demo-form" onSubmit={(event) => { event.preventDefault(); onContinue(); }}><section className="preview-demo-card"><h2>Contact</h2><CheckoutInput label="Email" value={draft.email} onChange={(value) => onDraftChange({ email: value })} type="email" required placeholder="you@example.com" /></section><section className="preview-demo-card"><h2>Shipping details</h2><div className="preview-form-grid"><CheckoutInput label="First name" value={draft.firstName} onChange={(value) => onDraftChange({ firstName: value })} required /><CheckoutInput label="Last name" value={draft.lastName} onChange={(value) => onDraftChange({ lastName: value })} required /></div><label className="preview-form-field"><span>Country <small>Required</small></span><select value={draft.country} onChange={(event) => onDraftChange({ country: event.currentTarget.value })} required><option value="US">United States</option><option value="CA">Canada</option><option value="GB">United Kingdom</option></select></label><CheckoutInput label="State / province" value={draft.stateProvince} onChange={(value) => onDraftChange({ stateProvince: value })} placeholder="Optional" /><CheckoutInput label="City" value={draft.city} onChange={(value) => onDraftChange({ city: value })} required /><CheckoutInput label="Address" value={draft.addressLine1} onChange={(value) => onDraftChange({ addressLine1: value })} required placeholder="123 Example Street" /><CheckoutInput label="Postal code" value={draft.postalCode} onChange={(value) => onDraftChange({ postalCode: value })} required /><CheckoutInput label="Phone" value={draft.phone} onChange={(value) => onDraftChange({ phone: value })} type="tel" placeholder="Optional" /></section><section className="preview-demo-card"><h2>Demo shipping</h2><label className="preview-form-field"><span>Shipping method <small>Demo only</small></span><select value={draft.shippingOptionId} onChange={(event) => onDraftChange({ shippingOptionId: event.currentTarget.value })}>{previewShippingOptions.map((option) => <option value={option.id} key={option.id}>{option.label} · {formatPrice(option.priceCents)}</option>)}</select></label><p className="preview-field-note">Demo shipping · Not a production quote.</p></section><section className="preview-demo-card"><h2>Coupon visualization</h2><label className="preview-form-field"><span>Demo coupon <small>Optional</small></span><select value={draft.couponCode} onChange={(event) => onDraftChange({ couponCode: event.currentTarget.value })}><option value="">No demo coupon</option><option value="DEMO10">DEMO10 · valid demo</option><option value="EXPIRED">EXPIRED · expired demo</option><option value="NOTREAL">NOTREAL · invalid demo</option></select></label><p className="preview-field-note">{summary.coupon.label} · Preview arithmetic only.</p></section><button type="submit" className="preview-button preview-button-primary">Continue to Payment Demo <span>→</span></button></form><CheckoutSummary summary={summary} items={items} /></div></section>;
}

function CheckoutSummary({ summary, items }: { summary: ReturnType<typeof calculatePreviewCheckoutSummary>; items: readonly PreviewCartItem[] }) {
  return <aside className="preview-demo-summary preview-checkout-summary" aria-labelledby="preview-checkout-summary"><h2 id="preview-checkout-summary">Order summary</h2><div className="preview-summary-products">{items.map((item) => <div className="preview-summary-row" key={item.lineId}><span>{item.productName} · {item.quantity}</span><strong>{formatPrice(item.unitPriceCents * item.quantity)}</strong></div>)}</div><div className="preview-summary-row"><span>Subtotal</span><strong>{formatPrice(summary.subtotalCents)}</strong></div><div className="preview-summary-row"><span>{summary.shippingLabel}</span><strong>{summary.shippingCents ? formatPrice(summary.shippingCents) : "—"}</strong></div><div className="preview-summary-row"><span>Discount · {summary.coupon.status}</span><strong>-{formatPrice(summary.coupon.discountCents)}</strong></div><div className="preview-summary-row"><span>Tax</span><strong>Not activated</strong></div><div className="preview-summary-total"><span>Local demo arithmetic total</span><strong>{formatPrice(summary.localDemoTotalCents)}</strong></div><p>Tax is not activated in this frontend preview. This total is display-only, non-authoritative arithmetic and is not payable.</p></aside>;
}

function PaymentPage({ outcome, onOutcome }: { outcome: PaymentDemoOutcome; onOutcome: (outcome: "success" | "failed" | "cancelled") => void }) {
  const status = outcome === "idle" ? "Choose a demo outcome to continue." : previewPaymentFixtures.find((fixture) => fixture.state === outcome)?.label;
  return <section className="preview-section preview-payment-page"><p className="preview-eyebrow">Frontend Preview · Payment Demo</p><h1>Choose a payment story.</h1><p className="preview-intro">These buttons change only client-side presentation state. No real money was charged.</p><div className="preview-payment-notice">{status}</div><div className="preview-payment-actions">{previewPaymentFixtures.map((fixture) => <button type="button" className={`preview-button ${fixture.state === "success" ? "preview-button-primary" : "preview-button-secondary"}`} key={fixture.state} onClick={() => onOutcome(fixture.state)}>{fixture.label}</button>)}</div><p className="preview-boundary-label">DEMO · No real payment, Order, or authorization was created.</p><PreviewLink route="/checkout" className="preview-text-link">Back to Checkout Demo</PreviewLink></section>;
}

function OrderSuccessPage({ outcome }: { outcome: PaymentDemoOutcome }) {
  if (outcome !== "success") return <section className="preview-section preview-empty"><p className="preview-eyebrow">Order Success Demo</p><h1>Complete Payment Demo first.</h1><p>This route only presents the success state after the in-memory success choice.</p><PreviewLink route="/payment" className="preview-button preview-button-primary">Return to Payment Demo <span>→</span></PreviewLink></section>;
  return <section className="preview-section preview-success-page"><p className="preview-eyebrow">Frontend Preview · Order Success</p><h1>Demo Order Success</h1><div className="preview-success-card"><p className="preview-success-mark">✦</p><h2>{DEMO_PAYMENT_NOTICE}</h2><p>Reference: <strong>{PREVIEW_ORDER_REFERENCE}</strong></p><p>No real Order was created. This is a fixed placeholder for the frontend walkthrough.</p></div><PreviewLink route="/fulfillment" className="preview-button preview-button-primary">Open Fulfillment Demo <span>→</span></PreviewLink></section>;
}

function fulfillmentLabel(state: PreviewFulfillmentDemoState["state"]): string {
  return previewFulfillmentFixtures.find((fixture) => fixture.state === state)?.label ?? state;
}

function nextPreviewVersion(state: PreviewFulfillmentDemoState): number {
  return state.state === "photo_review" ? 1 : Math.min(3, state.previewVersion + 1);
}

function FulfillmentPage({ state, onAction }: { state: PreviewFulfillmentDemoState; onAction: (action: PreviewFulfillmentAction) => void }) {
  const canRequestRevision = state.state === "preview_pending" && state.previewVersion < 3;
  return <section className="preview-section preview-fulfillment-page"><p className="preview-eyebrow">Frontend Preview · Fulfillment</p><h1>From a first look to a finished keepsake.</h1><p className="preview-intro">A deterministic visual walkthrough only. It does not create a Fulfillment aggregate or production work.</p><div className="preview-flow-status"><span>Current visual state</span><strong>{fulfillmentLabel(state.state)}</strong>{state.previewVersion > 0 && <small>Preview v{state.previewVersion} · {state.revisionCount} of 2 revisions used</small>}</div><div className="preview-flow-track">{["photo_review", "preview_pending", "preview_approved", "in_production", "quality_check"].map((step) => <span className={state.state === step || (step === "preview_pending" && state.state === "preview_revision_requested") ? "preview-flow-step preview-flow-step-active" : "preview-flow-step"} key={step}>{step.replaceAll("_", " ")}</span>)}</div><div className="preview-demo-card preview-customer-panel"><h2>Customer visual</h2>{state.state === "photo_review" && <><p>Your reference is ready for the first preview.</p><button type="button" className="preview-button preview-button-secondary" onClick={() => onAction("publish_preview")}>Publish Preview v1 — Demo</button></>}{state.state === "preview_pending" && <><p>Review preview v{state.previewVersion} in this frontend demo.</p><div className="preview-action-row"><button type="button" className="preview-button preview-button-primary" onClick={() => onAction("approve_preview")}>Approve Preview — Demo</button>{canRequestRevision ? <button type="button" className="preview-button preview-button-secondary" onClick={() => onAction("request_revision")}>Request Revision #{state.revisionCount + 1} — Demo</button> : <button type="button" className="preview-button preview-button-secondary" disabled>Request Revision unavailable after v3</button>}</div></>}{state.state === "preview_revision_requested" && <p>Revision #{state.revisionCount} requested. The next preview is a visual demo step.</p>}{state.state === "preview_approved" && <p>Preview approved in the demo. The operator visual can show the next step.</p>}{state.state === "in_production" && <p>In production — Demo. This does not represent real manufacturing.</p>}{state.state === "quality_check" && <p>Quality check — Demo. This visual state is terminal for the preview.</p>}</div>{state.state === "preview_revision_requested" && <button type="button" className="preview-button preview-button-secondary" onClick={() => onAction("publish_preview")}>Publish Preview v{nextPreviewVersion(state)} — Demo</button>}<div className="preview-demo-card"><h2>Visual boundary</h2><p>{TRACKING_PREVIEW_NOTICE}</p><p className="preview-boundary-label">No shipping, tracking, provider, or production authority is active here.</p></div><PreviewLink route="/operator" className="preview-text-link">Open Operator UI Preview</PreviewLink></section>;
}

function OperatorPage({ state, onAction }: { state: PreviewFulfillmentDemoState; onAction: (action: PreviewFulfillmentAction) => void }) {
  const canPublish = state.state === "photo_review" || state.state === "preview_revision_requested";
  return <section className="preview-section preview-operator-page"><p className="preview-eyebrow">Frontend Preview · Operator</p><h1>Operator workflow, shown visually.</h1><p className="preview-boundary-label">{OPERATOR_PREVIEW_NOTICE}</p><p className="preview-intro">This screen shares the same in-memory demo state as Fulfillment. It has no login, role, token, or server mutation.</p><div className="preview-flow-status"><span>Current visual state</span><strong>{fulfillmentLabel(state.state)}</strong><small>Refresh resets this demo sequence.</small></div><div className="preview-operator-actions"><button type="button" className="preview-button preview-button-secondary" disabled={state.state !== "photo_review"} onClick={() => onAction("enter_photo_review")}>Enter Photo Review</button><button type="button" className="preview-button preview-button-secondary" disabled={!canPublish || state.previewVersion >= 3} onClick={() => onAction("publish_preview")}>Publish Preview{canPublish ? ` v${nextPreviewVersion(state)}` : ""}</button><button type="button" className="preview-button preview-button-secondary" disabled={state.state !== "preview_approved"} onClick={() => onAction("start_production")}>Start Production</button><button type="button" className="preview-button preview-button-secondary" disabled={state.state !== "in_production"} onClick={() => onAction("mark_quality_check")}>Mark Quality Check</button></div><div className="preview-demo-card"><h2>Not a control plane</h2><p>All buttons are presentation-only. No operator authentication, action identifier, production-preview asset, shipment, or tracking record exists.</p></div><p className="preview-boundary-label">{TRACKING_PREVIEW_NOTICE}</p><PreviewLink route="/fulfillment" className="preview-button preview-button-primary">Back to Fulfillment Demo <span>→</span></PreviewLink></section>;
}

function NotFoundPreview({ label }: { label: string }) {
  return <section className="preview-section preview-empty"><p className="preview-eyebrow">Frontend Preview</p><h1>{label} not found</h1><p>This preview route is unavailable in the static fixture set.</p><PreviewLink route="/shop" className="preview-button preview-button-secondary">Return to Shop</PreviewLink></section>;
}

function PlaceholderPage({ label, route }: { label: string; route: string }) {
  return <section className="preview-section preview-placeholder"><p className="preview-eyebrow">Next batch</p><h1>{label}</h1><p>This preview surface is not configured in the current batch.</p><p className="preview-boundary-label">FRONTEND PREVIEW — UI ONLY</p><PreviewLink route="/shop" className="preview-button preview-button-secondary">Return to Shop</PreviewLink><small>Route: {route}</small></section>;
}

function App() {
  const route = usePreviewRoute();
  const [cart, setCart] = useState<readonly PreviewCartItem[]>([]);
  const nextCartLineId = useRef(1);
  const [checkout, setCheckout] = useState<PreviewCheckoutDraft>(() => createPreviewCheckoutDraft());
  const [paymentOutcome, setPaymentOutcome] = useState<PaymentDemoOutcome>("idle");
  const [fulfillment, setFulfillment] = useState<PreviewFulfillmentDemoState>(() => createPreviewFulfillmentState());

  const addToCart = (draft: PreviewCartLineDraft) => {
    const lineId = `preview-line-${nextCartLineId.current++}`;
    setCart((items) => addPreviewCartItem(items, draft, lineId));
  };
  const updateQuantity = (lineId: string, delta: number) => setCart((items) => updatePreviewCartQuantity(items, lineId, delta));
  const removeItem = (lineId: string) => setCart((items) => removePreviewCartItem(items, lineId));
  const updateCheckout = (patch: Partial<PreviewCheckoutDraft>) => setCheckout((current) => ({ ...current, ...patch }));
  const choosePaymentOutcome = (outcome: "success" | "failed" | "cancelled") => {
    setPaymentOutcome(outcome);
    if (outcome === "success") navigatePreview("/order-success");
  };
  const applyFulfillment = (action: PreviewFulfillmentAction) => setFulfillment((current) => applyPreviewFulfillmentAction(current, action));
  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);

  let content: ReactNode;
  switch (route.kind) {
    case "home": content = <HomePage />; break;
    case "shop": content = <ShopPage />; break;
    case "category": content = <ShopPage categorySlug={route.slug} />; break;
    case "product": content = <ProductPage slug={route.slug} onAddToCart={addToCart} />; break;
    case "placeholder":
      if (route.route === "/cart") content = <CartPage items={cart} onQuantityChange={updateQuantity} onRemove={removeItem} onClear={() => setCart(clearPreviewCart())} />;
      else if (route.route === "/checkout") content = <CheckoutPage items={cart} draft={checkout} onDraftChange={updateCheckout} onContinue={() => navigatePreview("/payment")} />;
      else if (route.route === "/payment") content = <PaymentPage outcome={paymentOutcome} onOutcome={choosePaymentOutcome} />;
      else if (route.route === "/order-success") content = <OrderSuccessPage outcome={paymentOutcome} />;
      else if (route.route === "/fulfillment") content = <FulfillmentPage state={fulfillment} onAction={applyFulfillment} />;
      else if (route.route === "/operator") content = <OperatorPage state={fulfillment} onAction={applyFulfillment} />;
      else content = <PlaceholderPage label={route.label} route={route.route} />;
      break;
  }
  return <PreviewLayout route={route} cartCount={cartCount}>{content}</PreviewLayout>;
}

document.getElementById("root")!.replaceChildren();
import("react-dom/client").then(({ createRoot }) => createRoot(document.getElementById("root")!).render(<App />));
