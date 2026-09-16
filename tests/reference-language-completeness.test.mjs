import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const providerPath = path.join(root, "app/storefront/ReferenceLanguageProvider.tsx");

function decodeHtmlEntities(value) {
  return value
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function extractTranslations(source) {
  const translations = new Map();
  const entryPattern = /^\s*(?:"((?:[^"\\]|\\.)*)"|([A-Za-z_$][\w$]*))\s*:\s*\{\s*es:\s*"((?:[^"\\]|\\.)*)",\s*zh:\s*"((?:[^"\\]|\\.)*)"\s*\},?\s*$/gm;
  for (const match of source.matchAll(entryPattern)) {
    const key = match[1] ?? match[2];
    assert.equal(translations.has(key), false, `duplicate translation key: ${key}`);
    translations.set(key, { es: match[3], zh: match[4] });
  }
  return translations;
}

async function collectFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(entryPath));
    else if (entry.name.endsWith(".tsx")) files.push(entryPath);
  }
  return files;
}

async function auditedCustomerFiles() {
  const rootRoutes = [
    "app/page.tsx",
    "app/loading.tsx",
    "app/not-found.tsx",
    "app/info-page.tsx",
    "app/catalog.ts",
  ];
  const routeDirectories = [
    "app/about",
    "app/account",
    "app/cart",
    "app/category",
    "app/checkout",
    "app/contact",
    "app/faq",
    "app/journal",
    "app/login",
    "app/order",
    "app/privacy",
    "app/product",
    "app/register",
    "app/shipping-returns",
    "app/shop",
    "app/terms",
    "app/track-order",
    "app/storefront",
  ];
  const files = rootRoutes.map((file) => path.join(root, file));
  for (const directory of routeDirectories) files.push(...await collectFiles(path.join(root, directory)));
  return [...new Set(files)].filter((file) => !file.endsWith("/LocalSupplierOperatorTool.tsx") && !file.endsWith("/SupplierEconomicsDetails.tsx"));
}

function extractLiteralKeys(source) {
  const keys = new Set();
  const callPattern = /\bt\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g;
  for (const match of source.matchAll(callPattern)) keys.add(decodeHtmlEntities(match[1]));
  const referenceTextPattern = /<ReferenceText>\s*([^<{]*?)\s*<\/ReferenceText>/g;
  for (const match of source.matchAll(referenceTextPattern)) keys.add(decodeHtmlEntities(match[1]));
  return keys;
}

const providerSource = await fs.readFile(providerPath, "utf8");
const translations = extractTranslations(providerSource);
const sourceFiles = await auditedCustomerFiles();
const sourceByFile = new Map(await Promise.all(sourceFiles.map(async (file) => [file, await fs.readFile(file, "utf8")] )));
const auditedKeys = new Set([...sourceByFile.values()].flatMap((source) => [...extractLiteralKeys(source)]));

test("the translation dictionary has unique, non-empty Spanish and Chinese values", () => {
  assert.ok(translations.size > 0);
  for (const [key, value] of translations) {
    assert.notEqual(value.es.trim(), "", `empty Spanish translation: ${key}`);
    assert.notEqual(value.zh.trim(), "", `empty Chinese translation: ${key}`);
  }
});

  test("all literal customer-facing translation calls have dictionary entries", () => {
  const missing = [...auditedKeys].filter((key) => !translations.has(key));
  assert.deepEqual(missing, []);
  });

  test("editorial eyebrow and dispatch copy have dictionary entries", () => {
    const editorial = sourceByFile.get(path.join(root, "app/storefront/ReferenceEditorial.tsx"));
    const eyebrowKeys = [...editorial.matchAll(/<EditorialEyebrow>([^<{]+)<\/EditorialEyebrow>/g)].map((match) => match[1].trim());
    const referenceTextKeys = [...editorial.matchAll(/<ReferenceText>([^<{]+)<\/ReferenceText>/g)].map((match) => match[1].trim());
    const dynamicEditorialKinds = ["craft", "stories", "people", "GUIDES", "CRAFT", "STORY", "NOTES", "PEOPLE"];
    for (const key of [...eyebrowKeys, ...referenceTextKeys, ...dynamicEditorialKinds]) {
      assert.ok(translations.has(key), `missing editorial translation key: ${key}`);
    }
  });

test("the audited customer-facing key set is complete in EN, ES, and ZH", () => {
  assert.ok(auditedKeys.size > 0);
  for (const key of auditedKeys) {
    const translation = translations.get(key);
    assert.ok(translation, `missing dictionary entry: ${key}`);
    assert.notEqual(key.trim(), "");
    assert.notEqual(translation.es.trim(), "", `missing ES value: ${key}`);
    assert.notEqual(translation.zh.trim(), "", `missing ZH value: ${key}`);
  }
});

test("static shell copy routes through the translation boundary", () => {
  const shell = sourceByFile.get(path.join(root, "app/storefront/CatalogShell.tsx"));
  const navigation = sourceByFile.get(path.join(root, "app/storefront/CatalogShellNavigation.tsx"));
  assert.match(shell, /t\(note\)/);
  assert.match(shell, /t\("MADE SLOWLY, SHIPPED EVERYWHERE"\)/);
  assert.match(navigation, /t\(/);
});

test("language switching keeps the document language contract explicit", () => {
  assert.match(providerSource, /localStorage\.getItem\("fig-lang"\)/);
  assert.match(providerSource, /setLanguage/);
  assert.match(providerSource, /document\.documentElement\.lang/);
  assert.match(providerSource, /"zh-CN"/);
});

test("customer dynamic status and operational presentation use translated labels", async () => {
  const requiredFiles = [
    "app/storefront/ProductDetailExperience.tsx",
    "app/storefront/LocalTrackingExperience.tsx",
    "app/storefront/LocalOrderSuccessExperience.tsx",
    "app/account/orders/page.tsx",
  ];
  for (const relativeFile of requiredFiles) {
    const source = await fs.readFile(path.join(root, relativeFile), "utf8");
    assert.match(source, /t\(/, `${relativeFile} has no translation boundary`);
  }
  for (const key of ["Delivered", "In transit", "Order status paid", "Payment status succeeded", "Physical", "business days"]) {
    assert.ok(translations.has(key), `missing dynamic presentation key: ${key}`);
  }
});

test("high-risk customer chrome keys are translated", () => {
  for (const key of [
    "Footer links",
    "Review local checkout",
    "Contact message",
    "SUBSCRIBE",
    "Local Tracking",
    "Account",
    "Loading",
    "Sign in with a delivered local order to review.",
  ]) {
    assert.ok(translations.has(key), `missing high-risk customer key: ${key}`);
  }
});

test("dynamic Shop reference labels and guide copy are translated", () => {
  for (const key of [
    "All 21",
    "3D Figurines (5)",
    "Custom Art (6)",
    "Home & Living (7)",
    "Digital (3)",
    "Figurines, portraits and keepsakes for the ones who waited at the door — gathered from every drawer of the workshop into one quiet corner of the shop.",
    "Every physical order ships with a handwritten card. Tell us what to write — or let us improvise. We are, apparently, good at this part.",
  ]) {
    assert.ok(translations.has(key), `missing dynamic Shop key: ${key}`);
    assert.notEqual(translations.get(key).es.trim(), "");
    assert.notEqual(translations.get(key).zh.trim(), "");
  }
});
