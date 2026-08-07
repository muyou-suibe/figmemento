# Deferred prototype assumptions

This record prevents foundation tests and shared types from turning current prototype gaps into desired PhotoGift behavior. These items are outside `stabilize-photogift-foundation`.

| Current assumption or gap | Why it is not fixed in C0 | Owning later change or decision |
|---|---|---|
| Separately customized copies of the same product can be aggregated. | Correct cart/order line identity belongs to the future cart and order model. No C0 test may assert aggregation as desired behavior. | Future cart/order change. |
| The prototype does not persist a complete true multi-image customization flow. | Multi-image behavior and image relationships are explicitly out of scope. | Future customization/private-upload change. |
| Customization option surcharges and shipping rules are not fully data-driven or server-calculated. | C0 only preserves and characterizes existing server-authoritative base-price/coupon behavior. | Future configurable catalog, pricing, and shipping changes. |
| A client-visible success state can imply payment success. | Browser state is not authoritative payment evidence, but redesigning payment completion is outside C0. | `integrate-stripe-and-paypal-payments`. |
| The existing Stripe webhook does not verify the expected order amount and currency. | Adding that verification is new payment-validation behavior and is expressly excluded from C0. | `integrate-stripe-and-paypal-payments`. |
| Production preview copy/state exists without the confirmed production-preview workflow. | Production preview is an independent MVP capability. | Future production-preview change. |
| Supabase Storage is used by the prototype, but Supabase Storage versus Cloudflare R2 is not the final approved architecture. | C0 must not select the final provider. | Future private-upload/storage decision. |

Characterization tests may assert existing security rejection and deterministic behavior where required by the foundation spec, but must not encode any gap above as the desired future contract.
