# Batch B Shared Shell Audit

Date: 2026-08-30
Change: `integrate-figmemento-fusion-frontend`
Scope: Tasks 2.1–2.5 only

## Batch B correction audit

- The shared mark now uses the complete FM crest SVG from the audited
  reference (`viewBox="0 0 64 64"`, concentric paths/circle, FIGMEMENTO arc,
  scripted F/M paths, and leaf detail). No authoritative repository logo asset
  existed, so no formal asset was overwritten. The real `FigMemento` text label
  remains beside it for navigation clarity.
- The header still derives its quantity only from `GET /api/cart`. Successful
  PDP Add to Cart and Cart quantity/remove/clear mutations now emit the
  payload-free `figmemento:cart-changed` presentation event after the existing
  Cart API has returned success; the header responds by refetching the
  authoritative projection. Failed mutations emit no event.
- Mobile links now share the existing `activeNav` class as well as
  `aria-current`, giving the active route the Fusion dotted terracotta
  treatment without a second active-style authority.

## Changed presentation surface

- `CatalogShell` retains the existing skip link, top note, fixture notice,
  footer copy, and legal destinations.
- `CatalogShellNavigation` owns the shared brand mark, real navigation,
  search handoff, live cart indicator, account link, active-link state, and
  compact menu behavior.
- `CatalogBrowser` reads the real `/shop?q=` handoff through its existing
  filter path and keeps its existing result feedback.
- `catalog-storefront.module.css` adds the Fusion header/footer grammar,
  search expansion, active-link treatment, compact navigation, focus states,
  reduced-motion behavior, and 44px interactive targets.

## Authority and route audit

- Search submits to the real `/shop` route and does not derive catalog data in
  the shell.
- Cart quantity is read from the real `/api/cart` public projection and is
  never a static badge or browser-provided price/state authority.
- Account and tracking links remain the existing application routes; account
  authentication state remains owned by the existing account page/runtime.
- Existing fixture/source notices and unavailable catalog states remain
  visible. No Supabase, fixture fallback, product, SKU, customization,
  upload, Cart authority/API/mutation behavior, checkout, order, payment,
  fulfillment, tracking, or authorization behavior was changed; the
  correction adds only the payload-free successful-mutation presentation
  refresh signal described above.
- Reference-only Journal, About, and Contact destinations are not presented.
- Reference-only prices, ratings, shipping promises, discounts, preview
  claims, and language-switch behavior were not copied into the shell.

## Acceptance evidence

- Desktop local Worker: shell, fixture notice, live empty-cart state, and
  unavailable route rendered successfully.
- 375px local Worker: no horizontal overflow; compact menu opened with focus
  on its first link and Escape returned focus to the menu button.
- Real search button navigation reached `/shop?q=couple`, where the existing
  catalog filter displayed the matching results.
- Real same-page Cart mutations updated the authoritative header badge for
  Add, quantity changes, remove, and clear without navigation or reload.
- Real mobile route checks showed the active dotted navigation treatment for
  Home, Shop, Cart, Account, and Track order.
- Offline focused shell tests: 7/7.
- Rendered shell tests: 2/2; complete rendered suite: 9/9.
- `npm run test:offline`: 844/844.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS, 0 errors; one pre-existing `<img>` warning remains.
- `npm run build`: PASS.
- `openspec validate --all --strict`: 17/17.
- `git diff --check`: PASS.

## Scope conclusion

Batch B changed shared presentation and its route/state wiring only. No
business workflow, persistence, provider, infrastructure, or OpenSpec
canonical requirement was changed.
