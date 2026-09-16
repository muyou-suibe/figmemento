# Local customer experience browser evidence

Date: 2026-09-16 (Asia/Shanghai)

Runtime under review: `http://localhost:3000`, development-only `local_persistent`, retained project `figmemento-local-commerce`.

This evidence was gathered through the real browser DOM and accessibility tree. It is separate from historical OpenSpec acceptance evidence and does not overwrite Task 10 artifacts.

## Catalog setup

The guarded setup tool was run twice against the exact retained-development project:

- first run: `CREATED`;
- second run: `REUSED`;
- categories: 4;
- products: 4;
- variants: 8;
- physical products: 3;
- digital products: 1;
- retained acceptance rows deleted: 0;
- schema version: 37;
- migration ledger: 37/37;
- pending migrations: 0;
- migration executed: false.

The customer-facing Shop listed exactly these four canonical Product routes:

- `/product/couple-anniversary-figurine`;
- `/product/pet-memorial-figurine`;
- `/product/custom-portrait-print`;
- `/product/digital-memory-portrait`.

No `Synthetic keepsake` label appeared in the normal Shop or category navigation. The underlying accepted test rows were not deleted.

## Header matrix

The following matrix was measured for EN, ES and ZH at each width. Every row had `documentElement.scrollWidth === documentElement.clientWidth`, no visible header-child overlap, four demo Product routes and no visible synthetic label.

| Width | Languages | Desktop navigation | Compact menu | Result |
| ---: | --- | --- | --- | --- |
| 1440 | EN / ES / ZH | visible; every label one line | hidden | PASS |
| 1280 | EN / ES / ZH | visible; every label one line | hidden | PASS |
| 1180 | EN / ES / ZH | visible; every label one line | hidden | PASS |
| 1100 | EN / ES / ZH | visible; every label one line | hidden | PASS |
| 1024 | EN / ES / ZH | visible; every label one line | hidden | PASS |
| 960 | EN / ES / ZH | hidden | visible | PASS |
| 768 | EN / ES / ZH | hidden | visible | PASS |
| 375 | EN / ES / ZH | hidden | visible | PASS |

At 1440 and 1280, computed navigation styles were `white-space: nowrap` and `word-break: keep-all`. The following labels each occupied one client rectangle:

- EN: Shop, Journal, About, Contact;
- ES: Tienda, Diario, Nosotros, Contacto;
- ZH: 商店, 工坊手记, 关于我们, 联系我们.

At 960 and 375, opening the compact menu produced `aria-expanded="true"`. The menu included one-line Home, Shop, Journal, About, Contact, Cart, Account and Track order links in all three languages. Focus moved to the first menu link on open, and Escape closed the menu. Search remained present with localized accessible names:

- EN: `Search a memory`;
- ES: `Buscar un recuerdo`;
- ZH: `搜索一段记忆`.

## Final shell pass

The final customer-shell pass moved the compact transition to `980px`: full navigation remains visible from `981px` upward, and the compact menu is used at `980px` and below. At 1024, EN, ES and ZH all retained the full navigation with no overlap or horizontal overflow. At 960, all three languages used the complete compact menu. A dedicated 1280 ZH check also retained the full one-line navigation.

The browser matrix additionally verified that normal customer HTML no longer displays the internal Fusion handoff annotation (`Fusion 02+07+08+12`, palette/font notes or motion metadata). Customer footer navigation remained present at every measured width. The design-system metadata remains preserved in `docs/design-reference/figmemento-fusion-design-v2.html`; only its storefront runtime rendering was removed.

## Customer surfaces

| Surface | Browser evidence | Result |
| --- | --- | --- |
| Home | Four demo Product links; no synthetic label; no horizontal overflow | PASS |
| Shop | Four demo Product cards and four customer categories; no synthetic label | PASS |
| 3D Figurines | `THE 3D FIGURINES`; Couple Anniversary Figurine card | PASS |
| Custom Art | Custom Portrait Print card | PASS |
| Pet Memorial | Pet Memorial Figurine card | PASS |
| Digital Art | Digital Memory Portrait card | PASS |
| Physical PDP | Physical delivery, shipping required, 10–18 business-day dev fixture range, two Person count variants, required image, optional base text | PASS |
| Digital PDP | Digital delivery, shipping not required, two Portrait style variants, required image, optional portrait note | PASS |
| Account | Local development sign-in/create-account entry rendered without overflow | PASS |
| Track order | Order number and checkout email form rendered at `/track-order` | PASS |
| Cart | Existing accepted safe unavailable projection rendered without a crash for a browser with no established persistent Cart authority | PASS (safe state) |
| Checkout | Existing accepted safe unavailable projection rendered without a crash when no persistent Cart authority was available | PASS (safe state) |

The Cart and Checkout checks were presentation/regression checks only. No Cart, Checkout, Order, Payment, Fulfillment, Tracking or Digital Delivery contract was changed, and no fake customer state was created to make the empty browser appear purchase-ready.

## Safety

- No remote endpoint was accessed.
- No production provider was called.
- No migration was created or executed.
- No historical fixture was removed or rewritten.
- Product/Variant/SKU/customization/fulfillment/pricing continued to come from the existing Catalog authority.
