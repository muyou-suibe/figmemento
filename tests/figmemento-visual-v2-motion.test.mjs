import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("app/storefront/catalog-storefront.module.css", "utf8");
const globals = readFileSync("app/globals.css", "utf8");
const shell = readFileSync("app/storefront/CatalogShell.tsx", "utf8");
const cards = readFileSync("app/storefront/CatalogDiscovery.tsx", "utf8");
const home = readFileSync("app/page.tsx", "utf8");
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
  for (const [name, duration] of [["visualV2FloatOne", "5.8s"], ["visualV2FloatTwo", "6.4s"], ["visualV2FloatThree", "5.1s"]]) {
    assert.match(css, new RegExp(`animation: ${name} ${duration} ease-in-out infinite`));
  }
  assert.match(css, /@keyframes visualV2FloatOne[\s\S]*translate3d\(5px, -13px, 0\)[\s\S]*rotate\(-3\.6deg\)/);
  assert.match(css, /@keyframes visualV2FloatTwo[\s\S]*translate3d\(-6px, -16px, 0\)[\s\S]*rotate\(4\.5deg\)/);
  assert.match(css, /@keyframes visualV2FloatThree[\s\S]*translate3d\(3px, -11px, 0\)[\s\S]*rotate\(-\.2deg\)/);
  assert.match(cards, /discoveryPolaroidFrame[\s\S]*discoveryPolaroid/);
  assert.equal((home.match(/<CatalogPolaroid/g) ?? []).length, 3);
  assert.match(css, /discoveryPolaroidFrame:hover[\s\S]*animation-play-state: paused/);
  assert.match(css, /translateY\(-10px\)[\s\S]*scale\(1\.02\)/);
  assert.match(css, /visualV2HeroEntrance 620ms[\s\S]*visualV2HeroEntrance 780ms/);
  const intermediateRule = css.match(/@media \(min-width: 721px\) and \(max-width: 960px\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(intermediateRule, /fusionHomeHero[\s\S]*fusionHeroPolaroids/);
  assert.doesNotMatch(intermediateRule, /discoveryPolaroid[123][^{]*\{[^}]*display:\s*none/);
  assert.match(home, /FusionRevealSection className=\{styles\.discoverySectionHeading\}/);
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
  assert.doesNotMatch(css, /requestAnimationFrame/);
  const v2Keyframes = [...css.matchAll(/@keyframes visualV2[^}]+\{[\s\S]*?\n\}/g)].map(([block]) => block).join("\n");
  assert.doesNotMatch(v2Keyframes, /(?:^|[;{]\s*)(?:top|left|width|height)\s*:/m);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*discoveryPolaroidFrame[\s\S]*animation: none !important/);
  assert.doesNotMatch(shell, /ReferenceAnnotation|Fusion design annotation|Fusion<\/b> 02\+07\+08\+12/);
  assert.match(css, /@media \(min-width: 981px\)/);
  assert.match(css, /@media \(max-width: 980px\)/);
});
