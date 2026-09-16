import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("Fusion shell keeps the real brand, legal routes, fixture notice, and reference copy", async () => {
  const [shell, navigation, trackOrder] = await Promise.all([
    source("app/storefront/CatalogShell.tsx"),
    source("app/storefront/CatalogShellNavigation.tsx"),
    source("app/track-order/page.tsx"),
  ]);
  assert.match(shell, /brandName/);
  assert.match(shell, /FixtureCatalogNotice/);
  assert.match(shell, /DEVELOPMENT \/ TEST ONLY/);
  assert.match(shell, /Development fixture catalog — this content is not a production catalog source\./);
  assert.match(navigation, /\/brand\/figmemento-logo\.png/);
  assert.match(trackOrder, /CatalogShell/);
  assert.doesNotMatch(navigation, /FigmementoCrest/);
  assert.doesNotMatch(navigation, /<span[^>]*brandMark[^>]*>FM<\/span>/);
  for (const href of ["/journal", "/about", "/contact", "/faq", "/shipping-returns", "/privacy", "/terms"]) {
    assert.match(shell, new RegExp(`href=\\"${href.replace("/", "\\/")}\\"`));
  }
  assert.match(shell, /Free worldwide shipping over \$69/);
  assert.match(shell, /Handmade in our little workshop, one piece at a time/);
  assert.match(shell, /Preview every order before it ships/);
  assert.match(shell, /10% off your first keepsake/);
});

test("Fusion shell navigation uses real destinations and live cart state", async () => {
  const navigation = await source("app/storefront/CatalogShellNavigation.tsx");
  for (const href of ["/", "/shop", "/cart", "/account", "/track-order"]) {
    assert.match(navigation, new RegExp(`href=\\"${href === "/" ? "\\/" : href.replace("/", "\\/")}\\"`));
  }
  assert.match(navigation, /usePathname/);
  assert.match(navigation, /fetch\("\/api\/cart"/);
  assert.match(navigation, /credentials: "same-origin"/);
  assert.match(navigation, /quantity \+= value/);
  assert.match(navigation, /aria-label=\{label\}/);
  for (const href of ["/journal", "/about", "/contact"]) assert.match(navigation, new RegExp(`href=\\"${href.replace("/", "\\/")}\\"`));
  assert.doesNotMatch(navigation, /data-lang|localStorage/);
  assert.doesNotMatch(navigation, /<span[^>]*>2<\/span>/);
});

test("cart mutations notify the shell only after success and carry no cart data", async () => {
  const [navigation, addToCart, cart, signal] = await Promise.all([
    source("app/storefront/CatalogShellNavigation.tsx"),
    source("app/storefront/AddToCartButton.tsx"),
    source("app/storefront/CartExperience.tsx"),
    source("app/storefront/cart-presentation.ts"),
  ]);
  assert.match(signal, /figmemento:cart-changed/);
  assert.match(signal, /window\.dispatchEvent\(new Event\(cartChangedEventName\)\)/);
  assert.match(navigation, /window\.addEventListener\(cartChangedEventName, refreshOnCartChange\)/);
  assert.match(navigation, /window\.removeEventListener\(cartChangedEventName, refreshOnCartChange\)/);
  assert.match(addToCart, /if \(!response\.ok\)[\s\S]*?return;[\s\S]*?notifyCartChanged\(\);/);
  assert.match(cart, /setCart\(next\);[\s\S]*?notifyCartChanged\(\);/);
  assert.match(cart, /method: "PATCH"/);
  assert.match(cart, /method: "DELETE"/);
  assert.match(cart, /mutate\("\/api\/cart", \{ method: "DELETE" \}\)/);
  assert.doesNotMatch(signal, /detail|price|subtotal|product|sku|line|quantity|identity/i);
});

test("cart presentation notification is one payload-free browser event", async () => {
  const previousWindow = globalThis.window;
  const events = [];
  globalThis.window = { dispatchEvent: (event) => { events.push(event); return true; } };
  try {
    const moduleUrl = new URL("../app/storefront/cart-presentation.ts", import.meta.url);
    moduleUrl.searchParams.set("test", String(Date.now()));
    const { notifyCartChanged } = await import(moduleUrl.href);
    notifyCartChanged();
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "figmemento:cart-changed");
    assert.equal("detail" in events[0], false);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("search submits to the existing catalog filter and preserves URL query feedback", async () => {
  const [navigation, browser] = await Promise.all([
    source("app/storefront/CatalogShellNavigation.tsx"),
    source("app/storefront/CatalogBrowser.tsx"),
  ]);
  assert.match(navigation, /role="search"/);
  assert.match(navigation, /action="\/shop"/);
  assert.match(navigation, /method="get"/);
  assert.match(navigation, /name="q"/);
  assert.match(browser, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(browser, /\.get\("q"\)/);
  assert.match(browser, /id="catalog-search"/);
  assert.match(browser, /aria-live="polite"/);
});

test("compact navigation has explicit keyboard and disclosure semantics", async () => {
  const navigation = await source("app/storefront/CatalogShellNavigation.tsx");
  const styles = await source("app/storefront/catalog-storefront.module.css");
  assert.match(navigation, /aria-expanded=\{menuOpen\}/);
  assert.match(navigation, /aria-controls="catalog-mobile-menu"/);
  assert.match(navigation, /event\.key !== "Escape"/);
  assert.match(navigation, /firstMobileLinkRef\.current\?\.focus\(\)/);
  assert.match(styles, /\.mobileNav/);
  assert.match(styles, /min-height: var\(--fusion-tap\)/);
  assert.match(styles, /@media \(max-width: 720px\)/);
  assert.match(styles, /\.mobileNav a:focus-visible/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
});

test("Fusion shell applies the audited header and search treatment without server config", async () => {
  const [shell, styles] = await Promise.all([
    source("app/storefront/CatalogShell.tsx"),
    source("app/storefront/catalog-storefront.module.css"),
  ]);
  assert.match(shell, /className=\{styles\.topNote\}/);
  assert.match(shell, /className=\{styles\.skipLink\}/);
  assert.match(shell, /className=\{styles\.footer/);
  assert.match(styles, /\.header \{[\s\S]*position: sticky;[\s\S]*top: 0;/);
  assert.match(styles, /\.headerSearch \{[\s\S]*width: 216px;/);
  assert.match(styles, /\.headerSearch:focus-within \{[\s\S]*width: 280px;/);
  assert.match(styles, /\.headerSearch:focus-within::before/);
  assert.match(styles, /\.brandMark/);
  assert.match(styles, /\.brandMark \{[\s\S]*width: 52px;/);
  assert.match(styles, /\.brand:hover \.brandMark[\s\S]*transform: rotate\(0deg\) scale\(1\.06\)/);
  assert.match(styles, /var\(--fusion-(?:bg|gold|honey|shadow-card|font-serif)\)/);
  assert.doesNotMatch(styles, /fonts\.googleapis\.com|import\.meta\.env|process\.env|Caveat/);
});

test("official reference logo has one uncropped CSS authority", async () => {
  const styles = await source("app/storefront/catalog-storefront.module.css");
  const logoBlocks = [...styles.matchAll(/\.referenceShell \.brandMark(?: img)?\s*\{[^}]*\}/g)].map((match) => match[0]);
  assert.equal(logoBlocks.length, 2);
  assert.match(logoBlocks[0], /height: 58px/);
  assert.match(logoBlocks[0], /overflow: visible/);
  assert.match(logoBlocks[1], /object-fit: contain/);
  assert.match(logoBlocks[1], /object-position: center/);
  assert.doesNotMatch(styles, /\.referenceShell \.brandMark img\s*\{[^}]*object-fit:\s*cover/);
  assert.match(styles, /\.referenceShell \.brandWordmark \{ display: none; \}/);
});
