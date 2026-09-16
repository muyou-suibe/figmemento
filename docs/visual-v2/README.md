# FigMemento Visual V2 experiment

Visual V2 is an optional, isolated presentation experiment based on accepted commit `7f20f31d0a2eb1917540bbc9acbdfde023f75e11`.

The reviewed V2 implementation commit is `888b8f6` on local branch `experiment/visual-polish-v2`. The evidence documents are committed separately so the implementation identity remains stable and directly comparable with the accepted baseline.

It keeps the accepted warm-paper, scrapbook and handmade identity while making meaningful customer states feel more responsive. It does not change Catalog, Cart, Checkout, Order, Payment, ownership, Fulfillment, Tracking, Digital Delivery, Supplier, RLS/RPC or Storage authority.

Comparison targets:

- accepted baseline: `http://localhost:3000`;
- Visual V2: `http://localhost:3001`;
- routes: Home, Shop, representative physical/digital PDPs, Cart, Checkout and safely reachable preview/success states;
- widths: 1280, 1024, 960 and 375;
- languages: EN and ZH throughout, with a separate ES shell check.

Real interactive 3D model viewer deferred until model assets exist.

See [implementation-notes.md](implementation-notes.md), [browser-evidence.md](browser-evidence.md) and [adoption-review.md](adoption-review.md).
