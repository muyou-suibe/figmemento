import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("app/storefront/catalog-storefront.module.css", "utf8");
const globals = readFileSync("app/globals.css", "utf8");
const shell = readFileSync("app/storefront/CatalogShell.tsx", "utf8");
const cards = readFileSync("app/storefront/CatalogDiscovery.tsx", "utf8");
const pdp = readFileSync("app/storefront/ProductDetailExperience.tsx", "utf8");
const upload = readFileSync("app/storefront/ProductCustomizationImageField.tsx", "utf8");
const preview = readFileSync("app/storefront/LocalOrderSuccessExperience.tsx", "utf8");
const cart = readFileSync("app/storefront/CartExperience.tsx", "utf8");
const checkout = readFileSync("app/storefront/LocalCheckoutExperience.tsx", "utf8");
const pkg = readFileSync("package.json", "utf8");

test("V2 has one scoped motion vocabulary and an immediate reduced-motion projection", () => {
  for (const token of ["--v2-motion-micro: 160ms", "--v2-motion-control: 230ms", "--v2-motion-reveal: 520ms", "--v2-motion-editorial: 680ms"]) assert.match(globals, new RegExp(token));
  assert.match(shell, /styles\.visualV2[\s\S]*data-visual-version="v2"/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.visualV2 \*[\s\S]*animation-duration: \.001ms !important/);
  assert.match(css, /\.visualV2 \.fusionReveal \{ opacity: 1 !important; transform: none !important; \}/);
});

test("Home and Catalog motion stays presentational and touch-safe", () => {
  assert.match(css, /visualV2FloatOne/);
  assert.match(css, /\.visualV2 \.referenceProductCard:hover[\s\S]*translateY/);
  assert.match(css, /scale\(1\.035\)/);
  assert.match(css, /@media \(hover: none\), \(pointer: coarse\)/);
  assert.match(cards, /item\.product\.name/);
  assert.match(cards, /formatListingPrice\(item\.listingPrice\)/);
});

test("PDP and upload motion consume existing authority states without fabricating acceptance", () => {
  assert.match(pdp, /VariantSelector/);
  assert.match(pdp, /ProductCustomizationHandoffGate/);
  assert.match(upload, /data-upload-state=\{slot\.status\}/);
  assert.match(upload, /slot\.status === "accepted"/);
  assert.match(css, /data-upload-state="accepted"/);
  assert.doesNotMatch(upload, /setTimeout\([^)]*accepted|status:\s*"accepted"\s*}\),\s*\d/);
});

test("approved stamp exists only behind the durable preview-approved projection", () => {
  assert.match(preview, /fulfillment\.value\.status === "preview_approved"[\s\S]*visualV2ApprovedStamp/);
  assert.match(preview, /submitFulfillment\("approve_preview"\)/);
  assert.match(css, /data-preview-state="preview_approved"[\s\S]*visualV2Stamp/);
});

test("Cart and Checkout keep their existing mutation boundaries", () => {
  assert.match(cart, /fetch\("\/api\/cart"/);
  assert.match(cart, /method: "PATCH"/);
  assert.match(cart, /method: "DELETE"/);
  assert.match(checkout, /fetch\("\/api\/checkout"/);
  assert.match(checkout, /submitLocalOrderWithEstablishment/);
  assert.match(css, /\.visualV2 \.cartLine/);
  assert.match(checkout, /data-checkout-state=\{submitting \? "submitting" : result\?\.status \?\? "editing"\}/);
});

test("V2 adds no animation dependency or customer annotation regression", () => {
  assert.doesNotMatch(pkg, /"motion"\s*:|framer-motion|@formkit\/auto-animate/);
  assert.doesNotMatch(shell, /ReferenceAnnotation|Fusion design annotation|Fusion<\/b> 02\+07\+08\+12/);
  assert.match(css, /@media \(min-width: 981px\)/);
  assert.match(css, /@media \(max-width: 980px\)/);
});
