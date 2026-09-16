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

## Hero motion visibility pass

The Home hero was reloaded independently at each viewport and sampled from live computed styles. Each tuple below is `translateX / translateY` in CSS pixels for polaroids 1–3; the measured bounding-box positions changed with the same three independent paths.

| Viewport | 0s | 1.5s | 3s | 5s |
| --- | --- | --- | --- | --- |
| 1280×900 | `0.00/-0.01`, `0/0`, `0/0` | `3.24/-8.42`, `-1.33/-3.55`, `0.34/-1.23` | `4.84/-12.58`, `-5.44/-14.51`, `2.94/-10.79` | `0.40/-1.05`, `-3.71/-9.89`, `0.79/-2.91` |
| 1024×768 | `0.00/0.00`, `0/0`, `0/0` | `3.08/-8.01`, `-1.20/-3.20`, `0.27/-0.99` | `4.88/-12.69`, `-5.35/-14.28`, `2.91/-10.68` | `0.45/-1.18`, `-3.82/-10.19`, `0.85/-3.12` |
| 375×812 | `0.00/0.00`, `0/0`, `0/0` | `3.09/-8.04`, `-1.21/-3.23`, `0.27/-1.01` | `4.89/-12.71`, `-5.33/-14.21`, `2.90/-10.64` | `0.47/-1.23`, `-3.87/-10.31`, `0.87/-3.20` |

The 1280 bounding boxes for polaroid 1 moved from `x=658.63, y=212.07, 277.18×320.82` at 0s to `x=666.77, y=202.20, 270.56×315.42` at 3s. At 375, its box moved from `x=27.41, y=841.38` to `x=35.64, y=831.40`; document width remained exactly 375px, so the motion introduced no horizontal overflow. The other two cards also moved within five seconds at all three viewports. Computed animation names and play state confirmed three separate running animations rather than one synchronized group.

Keyboard focus on polaroid 1 paused its outer animation and settled the inner layer at a transform equivalent to `translateY(-10px) rotate(4.3deg) scale(1.02)`. Moving focus away restored `inner: none` and the outer animation returned to `running`. This is the stable inspected state used by both `:hover` and `:focus-within`; the source contract also verifies the hover selector. The primary CTA settled at `translateY(-2px)` on focus and returned to `none` after focus left; its active rule is `translateY(2px)`.

At 1024×768, Selected Works began below the viewport as `pending`, `opacity: 0`, `translateY(22px)`. A real page scroll changed it to `visible`, `opacity: 1`, `transform: none`. This verifies the actual IntersectionObserver reveal path rather than a regex-only assertion.

The continuous hero budget is five animations: three polaroid paths and two small decorative drifts. Entrance animations are finite and do not delay interaction. Reduced-motion and coarse-pointer behavior remain covered by the focused contract because the browser automation surface does not override those media features.

## Authority notes

- The development fixture is presentation evidence only and remains visibly labelled development/test-only.
- The approved stamp cannot be forced by the browser evidence harness; it is rendered only from an actual `preview_approved` Fulfillment projection.
- The unavailable Order-success check did not create or fabricate an Order, capability, receipt, payment or Fulfillment state.
