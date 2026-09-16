# High-Fidelity Port Traceability Matrix

This matrix links every modified high-fidelity requirement to at least one
named scenario and to implementation and/or acceptance tasks. The HTML
reference is the visual, interaction, and motion authority; the real
application remains the business authority.

| Requirement | Scenario(s) | Task(s) | Batch | Acceptance Gate |
| --- | --- | --- | --- | --- |
| Fusion visual tokens remain the presentation authority | Shared token rendering; Reference material fidelity; Existing business state is restyled | 1.1, 1.2, 1.5, 2.1, 2.2, 2.3, 2.4, 2.6, 3.2, 3.3, 3.4, 3.5, 4.4, 5.2, 5.3, 5.6, 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 8.1, 8.2, 8.3, 9.1, 9.2, 9.3, 10.1, 10.2, 11.1, 11.3, 12.1, 12.2 | A–H | Screenshot comparison, scoped style review, business regression, and final cross-site audit |
| Editorial typography hierarchy is consistent | Font fallback; Long product copy | 1.1, 1.2, 1.5, 2.1, 3.1, 3.4, 4.3, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 7.1, 7.3, 8.1, 8.3, 9.1, 9.3, 10.1, 10.2, 11.1, 11.2, 12.2 | A–H | Reference-vs-real screenshots, fallback/font availability check, and long-copy wrapping at desktop/375px |
| Real navigation uses the current route surface | Navigation to an existing route; Reference-only destination; Search interaction | 1.1, 1.4, 2.3, 2.4, 2.5, 2.6, 3.1, 4.2, 4.3, 5.1, 5.3, 5.4, 6.1, 6.2, 6.3, 7.1, 7.3, 8.1, 8.3, 9.1, 9.3, 10.1, 10.2, 11.1, 11.3, 12.1 | A–H | Real-route click/direct/back/forward checks, active-state screenshots, keyboard/coarse-pointer checks, and no fabricated destinations |
| Header and footer preserve real utility state | Cart indicator; Fixture notice; Marquee behavior | 1.4, 2.2, 2.4, 2.5, 3.5, 4.2, 4.3, 5.1, 5.3, 5.4, 5.5, 5.6, 11.3, 12.2 | A, G, H | Real cart/source state, fixture notice, marquee observation, footer route checks, and business regression |
| Home presents real catalog discovery | Home with available catalog; Catalog unavailable; Unsupported reference content | 1.2, 1.4, 1.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6 | A | Desktop/375 Home screenshots, real catalog/fallback assertions, content-authority audit, and Batch A gate |
| Responsive layouts cover desktop and narrow mobile | 375px Home journey; Desktop composition | 1.5, 2.2, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 4.3, 5.2, 5.3, 5.4, 5.5, 6.2, 6.3, 7.3, 8.3, 9.3, 10.2, 11.1, 11.2, 12.2 | A–H | Screenshots at desktop/960/720/520/375px, scroll-width check, touch target check, and responsive regression matrix |
| Motion is purposeful and bounded | Reference motion fidelity; Interaction feedback; Motion does not gate content; Reveal and stagger behavior | 1.1, 1.3, 2.2, 2.3, 2.4, 2.5, 2.6, 3.2, 3.3, 4.1, 4.2, 4.4, 5.3, 5.5, 5.6, 6.2, 6.3, 7.2, 7.3, 8.2, 8.3, 9.2, 9.3, 10.2, 11.2 | A–G | Real-browser motion observation with independent PASS/FAIL for each inventoried primitive |
| Reduced-motion and touch behavior are first-class | Reduced motion; Touch pointer | 1.3, 2.4, 2.5, 2.6, 3.2, 3.3, 4.1, 4.2, 4.3, 5.4, 5.5, 5.6, 6.2, 6.3, 7.2, 7.3, 8.2, 8.3, 9.2, 9.3, 10.2, 11.2 | A–G | Manual/automated browser media checks, content-visible proof, coarse-pointer operation, and reduced-motion PASS/FAIL |
| Accessibility semantics are preserved or improved | Keyboard-only navigation; Validation and loading feedback | 1.4, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 4.3, 4.4, 5.1, 5.3, 5.4, 5.5, 6.2, 6.3, 7.2, 7.3, 8.2, 8.3, 9.2, 9.3, 10.2, 11.2 | A–G | Keyboard/focus and semantic inspection, screen-reader-relevant labels/live states, image alternatives, and browser acceptance |
| Reference content cannot become business authority | Reference price is displayed; Reference shipping promise is displayed; Reference interaction has no real authority; Unsupported reference content | 1.1, 1.2, 1.4, 2.4, 3.1, 3.4, 3.5, 5.1, 5.6, 6.1, 7.1, 8.1, 9.1, 10.1, 11.3, 12.2 | A–H | Content/authority audit, real catalog assertions, no-fake-success test, and final provider/business-boundary audit |
| The integration remains compatible with the current runtime | Existing route verification; Offline verification; No client configuration leak | 1.1, 1.4, 2.1, 2.3, 2.4, 2.5, 3.1, 4.4, 5.1, 5.2, 5.6, 6.3, 7.3, 8.3, 9.3, 10.2, 11.3, 12.1, 12.2 | A–H | Typecheck/build/offline/rendered gates, client-bundle inspection, and existing runtime route verification |
| Visual acceptance covers the complete real journey | Batch A visual comparison; Batch A interaction and motion acceptance; Customer business regression; Customer visual regression; Operational visual regression | 5.2, 5.3, 5.4, 5.5, 5.6, 6.3, 7.3, 8.3, 9.3, 10.2, 11.1, 11.2, 11.3, 12.1, 12.2 | A–H | Independent visual, interaction, motion, responsive, accessibility, business-regression, and Pages evidence gates |

## Coverage audit

- Requirements mapped: 12/12.
- Every mapped requirement has at least one exact scenario name from the
  delta spec.
- Tasks mapped: 45/45. The matrix covers `1.1–1.5`, `2.1–2.6`, `3.1–3.5`,
  `4.1–4.4`, `5.1–5.6`, `6.1–6.3`, `7.1–7.3`, `8.1–8.3`, `9.1–9.3`,
  `10.1–10.2`, `11.1–11.3`, and `12.1–12.2`.
- Orphan requirements: none.
- Orphan scenarios: none for the modified requirements; each scenario is
  included in the requirement row or its acceptance task.
- Orphan tasks: none.

## Gate rule

Batch A may be marked PASS only when visual parity, interaction parity, motion
parity, responsive behavior, accessibility, and business regression all pass.
The matrix does not authorize starting Batch B or any later batch early.
