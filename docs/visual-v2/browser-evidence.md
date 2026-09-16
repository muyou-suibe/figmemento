# Browser evidence

Status: PASS for the isolated fixture-backed Visual V2 runtime on `http://localhost:3001`.

Runtime source: the existing development-only `fixture` Catalog source. No retained database, remote provider or production environment was used. The accepted baseline on port 3000 remained untouched.

Required matrix:

| Route group | 1280 | 1024 | 960 | 375 | EN | ZH | ES shell |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Home | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Shop | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 3D PDP | PASS | PASS | PASS | PASS | PASS | PASS | shell PASS |
| Pet PDP | PASS | PASS | PASS | PASS | PASS | PASS | shell PASS |
| Digital PDP | PASS | PASS | PASS | PASS | PASS | PASS | shell PASS |
| Upload-capable physical PDP | PASS | PASS | PASS | PASS | PASS | PASS | shell PASS |
| Cart / Checkout | PASS | PASS | PASS | PASS | PASS | PASS | shell PASS |
| Preview / Success | safe unavailable projection PASS | PASS | PASS | PASS | PASS | PASS | shell PASS |

Checks include horizontal overflow, 981/980 navigation behavior, focus visibility, touch-safe non-hover behavior, reduced-motion visibility, state-truthful upload/preview feedback and unchanged customer footer.

## Measured browser results

- Home, Shop, `product/figurine-keychain`, `product/pet-memorial`, `product/digital-portrait`, `product/glass-light-picture`, Cart, Checkout and a non-enumerating unavailable Order-success projection rendered at 1280, 1024, 960 and 375 CSS pixels.
- All 36 route/viewport combinations reported zero horizontal overflow, retained the V2 root marker and the customer footer.
- The physical PDP retained two real image-upload inputs at every viewport; no visual layer replaced their existing state or authority.
- At 1024 the desktop navigation remained visible and the compact menu remained hidden. At 960 and 375 the header controls collapsed to the compact menu.
- EN, ES and ZH Home shells rendered at 1024 with zero horizontal overflow. The observed hero headings were translated and `html.lang` changed to `en`, `es` and `zh-CN` respectively.
- Reduced-motion behavior is covered by the scoped CSS contract and focused test: reveal content is immediately visible and V2 animation/transition durations collapse to near zero.
- Touch/coarse-pointer behavior is covered by the scoped CSS contract and focused test: hover lift, card straightening and image zoom are removed without hiding controls.

## Authority notes

- The development fixture is presentation evidence only and remains visibly labelled development/test-only.
- The approved stamp cannot be forced by the browser evidence harness; it is rendered only from an actual `preview_approved` Fulfillment projection.
- The unavailable Order-success check did not create or fabricate an Order, capability, receipt, payment or Fulfillment state.
