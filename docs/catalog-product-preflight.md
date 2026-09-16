# PhotoGift Catalog Product Preflight

**STATUS: AWAITING HUMAN APPROVAL**
**BACKFILL AUTHORIZED: NO**

**LATEST EVIDENCE MODE: PROVISIONAL_SIMULATION ONLY**
**PRODUCTION APPROVED: NO**
**PROVISIONAL REVIEWED BY: mike**
**PROVISIONAL REVIEW DATE: 2026-09-01**

Reconciliation date: 2026-08-07 (Asia/Shanghai)

This Task 3.5 mapping remains incomplete because physical packaged weights and structured production lead-time ranges are unresolved. The human decisions recorded below are approved mapping inputs, but they do not authorize backfill creation or execution.

Remote Product rows remain authoritative for fields actually present in the connected database. Repository fixtures and `supabase/seed.sql` are not production truth. This reconciliation used only the previously captured read-only evidence; it did not access remote Supabase.

## Human decision summary

| Measure | Result |
|---|---:|
| TOTAL PRODUCTS | 22 |
| READY | 0 |
| BLOCKED | 22 |
| Physical `weight_grams` decisions required | 19 |
| Minimum lead-time decisions required | 22 |
| Maximum lead-time decisions required | 22 |
| Previously recorded unresolved business values | 63 |
| Unresolved explicit default Variant identities | 0 |
| TOTAL UNRESOLVED DECISION CELLS | 63 |
| BACKFILL AUTHORIZED | **NO** |

The approved identity policy generated exactly one UUID v4 locally for each legacy Product and records it below as a fixed literal. These identities must never be generated dynamically in a migration or regenerated during a retry. This approval resolves only Variant identity; it does not authorize backfill or resolve any weight or lead-time value.

## Latest supplier evidence — provisional simulation only

The following evidence update records the 2026-09-01 provisional simulation review. It does not replace the production approval state above, does not convert supplier estimates into production-approved values, and does not authorize Task 3.5 completion or guarded backfill. `PROVISIONAL_READY` means that the supplied spreadsheet and the explicitly reviewed supplier/spec selection provide a candidate without guessing; `PRODUCTION_READY` remains **NO** until formal production approval is recorded.

Approval mode: `PROVISIONAL_SIMULATION`
Reviewed by: `mike`
Reviewed date: `2026-09-01`
Production approved: **NO**
Backfill authorized: **NO**

Supplier source keys refer to the exact `供应商对接` sheet URL cells in the supplied workbook `8-29FigMemento_供应商对接(1).xlsx`.

| Source | Supplier | URL / source reference |
|---|---|---|
| S1 | 金华市新烨供应链管理有限公司 | `https://shop87q3374707383.1688.com/` |
| S2 | 泉州市品冠艺术文化有限公司 | `https://www.1688.com/factory/b2b-340975760257685.html` |
| S3 | 福州祝安鼠电子商务有限公司 | `https://zhuanshupod.1688.com/` |
| S4 | 福建盈浩文化创意股份有限公司 | `https://www.1688.com/factory/b2b-22131803052548f338.html` |
| S5 | 淘宝店菠萝荔枝 | Exact Taobao item URL in the workbook row |
| S6 | 百纹美旗舰店 | Exact Tmall category URL in the workbook row |
| S7 | 玩布客旗舰店 | Exact Tmall category URL in the workbook row |
| S8 | 麦子创意礼品玩具店 | Exact Taobao category URL in the workbook row |

### Provisional supplier mapping matrix

All rows below refer to the existing fixed legacy default SKU code and retain `selectedOptions=[]`. Raw approximate supplier wording is preserved; normalized values are candidates only.

| Product / SKU | Supplier / supplier product | Default spec or process | Raw supplier evidence | Candidate weight | Candidate min/max | Precision / status |
|---|---|---|---|---:|---|---|
| `brick-person` / `LEGACY-ED04D884C89945BBBACF11E57DF88ECC` | S1 / `积木人` | 6cm source row | `约50g`; 3–4 working days | 50g | 3 / 4 | approximate; PROVISIONAL_READY |
| `phone-case` / `LEGACY-14AAFB75F94543A9A5BAEA29E19C9B54` | S5 / `定制手机壳` | selected supplier; type variants share evidence | `约50g（含包装）`; 1–3 working days | 50g | 1 / 3 | approximate; PROVISIONAL_READY |
| `pet-portrait` / `LEGACY-D4F9D4A9EBAB409096229DD1821E6053` | S4 / `宠物肖像定制画` | 喷绘 | `约500g`; 喷绘 2–3 working days | 500g | 2 / 3 | approximate; PROVISIONAL_READY |
| `custom-puzzle` / `LEGACY-B8E365B65E56484C9346FC91FD1D9751` | S7 / `定制拼图` | 500片 | `500片约550g（含盒）`; 1–2 working days | 550g | 1 / 2 | exact size row; PROVISIONAL_READY |
| `wood-engraving` / `LEGACY-664D690CCBAE42D4ADC5BC32523587A4` | S8 / `定制木刻画/雕刻画` | 8寸 | `8寸约500g`; 1–2 working days | 500g | 1 / 2 | exact size row; PROVISIONAL_READY |
| `bobblehead` / `LEGACY-26314DEF31C244ED97B1780BE86F32D4` | S2 / `摇头娃娃` | 6cm | `6cm约70g`; 3–4 working days | 70g | 3 / 4 | exact size row; PROVISIONAL_READY |
| `pet-figure` / `LEGACY-CA94E564311249DC98FD728586E93AE3` | S1 / `3D宠物` | reviewed 6cm mapping; source is not size-specific | `约40g`; 5–10 working days | 40g | 5 / 10 | approximate; no size-specific evidence; PROVISIONAL_READY |
| `couple-figure` / `LEGACY-300F5D88909B411D841C733692206BC0` | S1 / `3D人偶/手办` | product identity confirmed for simulation | `约50g`; 5–10 working days | 50g | 5 / 10 | approximate; generic product granularity; PROVISIONAL_READY |
| `solo-figure` / `LEGACY-B7232065C31746EBB5A2BE651F5FDEF4` | S1 / `3D人偶/手办` | product identity confirmed for simulation | `约50g`; 5–10 working days | 50g | 5 / 10 | approximate; generic product granularity; PROVISIONAL_READY |
| `crystal-frame` / `LEGACY-634288FAE76A4FEC96E628FAF27692D9` | S3 / `宠物纪念3d水晶` | product identity confirmed for simulation | `约500g`; 1–3 working days | 500g | 1 / 3 | approximate; PROVISIONAL_READY |
| `pet-memorial` / `LEGACY-C6A179A9AB1843D5A300F747B987314E` | S3 / `宠物纪念3d水晶` | product identity confirmed for simulation | `约500g`; 1–3 working days | 500g | 1 / 3 | approximate; PROVISIONAL_READY |
| `temporary-tattoo` / `LEGACY-183F9E20A6324A1AAF39405AFDB38CB9` | S6 / `定制纹身贴` | product identity confirmed for simulation | `约5g`; 1–3 working days; size/spec text incomplete | 5g | 1 / 3 | approximate; spec detail unresolved; PROVISIONAL_READY |

The following ten Products still have no sufficient supplier evidence in this workbook: `custom-pillow`, `figurine-keychain`, `fridge-magnet`, `glass-light-picture`, `herbal-tattoo`, `leaf-engraving`, `pixel-cube`, `ai-oil-portrait`, `digital-portrait`, and `digital-wallpaper`. For digital Products, `weight_grams=0` remains previously approved, but no production lead-time evidence is inferred from development fixtures.

### Provisional coverage, distinct from production approval

| Field | Provisional-ready | Ambiguous | Missing | Production-approved |
|---|---:|---:|---:|---:|
| Physical `weight_grams` | 12/19 | 0 | 7 | 0/19 |
| `min_lead_time_business_days` | 12/22 | 0 | 10 | 0/22 |
| `max_lead_time_business_days` | 12/22 | 0 | 10 | 0/22 |

The reviewed selections close the prior supplier/product identity ambiguities for simulation only. They do not resolve evidence granularity: `pet-figure` has no size-specific weight, `couple-figure` and `solo-figure` share generic S1 evidence, and `temporary-tattoo` retains incomplete size/spec detail. These limitations must remain visible in any later approval.

## Task 3.5 coverage audit

| Required mapping area | Confirmed | Unconfirmed | Assessment |
|---|---:|---:|---|
| Products requiring migration | 22 | 0 | Complete population coverage |
| Product identity | 22 | 0 | Source-derived UUIDs |
| Product slug | 22 | 0 | Source-derived slugs |
| Authoritative legacy price | 22 | 0 | Source-derived integer cents |
| Currency | 22 | 0 | Source-derived USD |
| Fulfillment type | 22 | 0 | Human approved |
| `requires_shipping` | 22 | 0 | Human approved |
| `production_mode` | 22 | 0 | Human approved |
| Default SKU code and behavior | 22 | 0 | Human approved SKU code, empty options, supply method, active/available/default flags |
| Explicit default Variant UUID identity | 22 | 0 | Human-approved fixed UUID v4 literals |
| Complete default Variant/SKU mapping | 0 | 22 | Variant identity and SKU behavior are fixed; Product-specific weight/lead-time fields still block completion |
| `weight_grams` | 3 | 19 | Digital zero weights approved; physical packaged weights unresolved |
| Minimum lead time | 0 | 22 | NEEDS HUMAN DECISION |
| Maximum lead time | 0 | 22 | NEEDS HUMAN DECISION |

All 22 Products are currently published in the captured baseline, and the baseline has no Product deletion column or soft-delete state. The preflight preserves every Product UUID, slug, `is_published` value, row presence, and historical order reference; it authorizes no publish, unpublish, retire, or delete operation.

## Classification legend

- **SOURCE-DERIVED:** copied from previously inspected remote evidence without changing it.
- **HUMAN APPROVED:** explicitly approved in the 2026-08-07 reconciliation and fixed for later migration drafting.
- **UNRESOLVED — HUMAN DECISION REQUIRED:** no authoritative value or approval exists; no value may be invented.

## Approved decision summary

- Four approved single-level Categories replace the earlier three-Category proposal. Each UUID v4 below was generated locally exactly once and is now a fixed literal input.
- Existing `is_published=true` maps to target `lifecycle=published`; legacy `is_published` remains unchanged.
- Legacy Product `seo` remains NULL.
- SKU code uses `LEGACY-<uppercase hyphen-free Product UUID>`.
- Every compatibility Variant has `is_active=true`, `is_available=false`, `is_default=true`, empty combination signature, and no selected Options.
- Physical and digital fulfillment semantics are approved exactly as recorded below.
- Digital `weight_grams=0` is approved. Physical weights and all structured lead-time ranges remain unresolved.
- All 22 Products remain preset candidates, not launch-approved purchasable Products.

## Section A — Remote source evidence

| Remote Product UUID | Slug | Name | Legacy category | price_cents | Currency | is_digital | is_published | Historical order_item references |
|---|---|---|---|---:|---|---:|---:|---:|
| `6ed25f1d-162f-4bbd-bd68-1e119dd8109f` | `ai-oil-portrait` | AI Oil Painting Portrait | Digital gifts | 1290 | USD | true | true | 1 |
| `26314def-31c2-44ed-97b1-780be86f32d4` | `bobblehead` | Custom Bobblehead | 3D keepsakes | 5990 | USD | false | true | 0 |
| `ed04d884-c899-45bb-bacf-11e57df88ecc` | `brick-person` | Photo Brick Figure | 3D keepsakes | 4990 | USD | false | true | 0 |
| `300f5d88-909b-411d-841c-733692206bc0` | `couple-figure` | Custom Couple Figure | 3D keepsakes | 6990 | USD | false | true | 7 |
| `634288fa-e76a-4fec-96e6-28faf27692d9` | `crystal-frame` | Crystal Photo Frame | 3D keepsakes | 2990 | USD | false | true | 0 |
| `9321d436-e717-44e3-a058-a0f29d3b5a62` | `custom-pillow` | Custom Photo Pillow | 3D keepsakes | 2490 | USD | false | true | 0 |
| `b8e365b6-5e56-484c-9346-fc91fd1d9751` | `custom-puzzle` | Custom Photo Puzzle | 3D keepsakes | 2490 | USD | false | true | 0 |
| `9f96c8a1-c5d5-4c67-bd67-a0cd12dcf720` | `digital-portrait` | AI Illustrated Portrait | Digital gifts | 990 | USD | true | true | 0 |
| `7032424e-6bec-45b9-a0d0-548b909ff573` | `digital-wallpaper` | Digital Wallpaper Illustration | Digital gifts | 790 | USD | true | true | 2 |
| `7f3bf07c-28ac-4cee-8b7f-de0a60aebc4a` | `figurine-keychain` | 3D Printed Figurine Keychain | 3D keepsakes | 3990 | USD | false | true | 0 |
| `e876c4b9-b4ab-4da5-adfc-b0f243a57a52` | `fridge-magnet` | Custom Fridge Magnet | 3D keepsakes | 1290 | USD | false | true | 0 |
| `f9a39759-b57e-41b0-b1fb-08e48ff50824` | `glass-light-picture` | Custom Glass Light Picture | 3D keepsakes | 3990 | USD | false | true | 1 |
| `e6835ba4-6eb0-4105-8012-f8a70e174678` | `herbal-tattoo` | Herbal Temporary Tattoo Set | 3D keepsakes | 1290 | USD | false | true | 0 |
| `61798bbe-9d3c-405c-a948-9a5e350e4f84` | `leaf-engraving` | Leaf Engraved Picture | 3D keepsakes | 2190 | USD | false | true | 0 |
| `ca94e564-3112-49dc-98fd-728586e93ae3` | `pet-figure` | Pet Portrait Figurine | Pet memories | 4590 | USD | false | true | 1 |
| `c6a179a9-ab18-43d5-a300-f747b987314e` | `pet-memorial` | Always With You Portrait | Pet memories | 2990 | USD | false | true | 0 |
| `d4f9d4a9-ebab-4090-9622-9dd1821e6053` | `pet-portrait` | Custom Pet Portrait | Pet memories | 2790 | USD | false | true | 0 |
| `14aafb75-f945-43a9-a5ba-ea29e19c9b54` | `phone-case` | Custom Phone Case | 3D keepsakes | 1490 | USD | false | true | 0 |
| `d933649a-dd1c-4f9d-a498-18bbff48a2a6` | `pixel-cube` | Custom Pixel Photo Cube | 3D keepsakes | 3490 | USD | false | true | 0 |
| `b7232065-c317-46eb-b5a2-be651f5fdef4` | `solo-figure` | Photo to Mini Figure | 3D keepsakes | 3990 | USD | false | true | 1 |
| `183f9e20-a632-4a1a-af39-405afdb38cb9` | `temporary-tattoo` | Custom Temporary Tattoos | 3D keepsakes | 990 | USD | false | true | 0 |
| `664d690c-cbae-42d4-adc5-bc32523587a4` | `wood-engraving` | Custom Wood Engraving | 3D keepsakes | 2290 | USD | false | true | 0 |

Coverage: **22 remote Products**, sorted by slug. No Product was omitted. No customer-level data is present.

## Section B — Approved Category mapping

All Categories are single-level. The fixed UUIDs below must be embedded literally in any later reviewed backfill and must never be regenerated dynamically.

| Fixed approved UUID v4 | Approved Category name | Approved slug | Lifecycle | Products | Product slugs | Decision status |
|---|---|---|---|---:|---|---|
| `5e040e93-7924-479e-87b6-04d6126ff31f` | 3D Figures | `3d-figures` | `published` | 6 | `bobblehead`, `brick-person`, `couple-figure`, `figurine-keychain`, `pixel-cube`, `solo-figure` | HUMAN APPROVED: fixed UUID v4 generated once locally and recorded as a literal migration input |
| `72f2a9c8-bd21-4bbe-814a-b18e727cd012` | Custom Crafts | `custom-crafts` | `published` | 10 | `crystal-frame`, `custom-pillow`, `custom-puzzle`, `fridge-magnet`, `glass-light-picture`, `herbal-tattoo`, `leaf-engraving`, `phone-case`, `temporary-tattoo`, `wood-engraving` | HUMAN APPROVED: fixed UUID v4 generated once locally and recorded as a literal migration input |
| `201e2667-9e03-46ed-bb2f-153f3d6c1e40` | Pet Memories | `pet-memories` | `published` | 3 | `pet-figure`, `pet-memorial`, `pet-portrait` | HUMAN APPROVED: fixed UUID v4 generated once locally and recorded as a literal migration input |
| `45a2ff1d-9429-43f1-8e7b-ddc92d0114c5` | Digital Gifts | `digital-gifts` | `published` | 3 | `ai-oil-portrait`, `digital-portrait`, `digital-wallpaper` | HUMAN APPROVED: fixed UUID v4 generated once locally and recorded as a literal migration input |

Category decision groups remaining: **0**.

## Section C — Product transition mapping

| Product UUID | Slug | Approved category mapping | Target lifecycle | SEO transition | Preserve UUID | Preserve slug | Preserve is_published | Preserve legacy price/currency |
|---|---|---|---|---|---|---|---|---|
| `6ed25f1d-162f-4bbd-bd68-1e119dd8109f` | `ai-oil-portrait` | Digital Gifts / `digital-gifts` / `45a2ff1d-9429-43f1-8e7b-ddc92d0114c5` (HUMAN APPROVED) | `published` (HUMAN APPROVED: compatibility mapping from `is_published=true`) | `NULL` / no backfill write (HUMAN APPROVED) | YES (SOURCE-DERIVED) | YES (SOURCE-DERIVED) | YES, unchanged (SOURCE-DERIVED) | YES: `1290` / `USD` (SOURCE-DERIVED) |
| `26314def-31c2-44ed-97b1-780be86f32d4` | `bobblehead` | 3D Figures / `3d-figures` / `5e040e93-7924-479e-87b6-04d6126ff31f` (HUMAN APPROVED) | `published` (HUMAN APPROVED: compatibility mapping from `is_published=true`) | `NULL` / no backfill write (HUMAN APPROVED) | YES (SOURCE-DERIVED) | YES (SOURCE-DERIVED) | YES, unchanged (SOURCE-DERIVED) | YES: `5990` / `USD` (SOURCE-DERIVED) |
| `ed04d884-c899-45bb-bacf-11e57df88ecc` | `brick-person` | 3D Figures / `3d-figures` / `5e040e93-7924-479e-87b6-04d6126ff31f` (HUMAN APPROVED) | `published` (HUMAN APPROVED: compatibility mapping from `is_published=true`) | `NULL` / no backfill write (HUMAN APPROVED) | YES (SOURCE-DERIVED) | YES (SOURCE-DERIVED) | YES, unchanged (SOURCE-DERIVED) | YES: `4990` / `USD` (SOURCE-DERIVED) |
| `300f5d88-909b-411d-841c-733692206bc0` | `couple-figure` | 3D Figures / `3d-figures` / `5e040e93-7924-479e-87b6-04d6126ff31f` (HUMAN APPROVED) | `published` (HUMAN APPROVED: compatibility mapping from `is_published=true`) | `NULL` / no backfill write (HUMAN APPROVED) | YES (SOURCE-DERIVED) | YES (SOURCE-DERIVED) | YES, unchanged (SOURCE-DERIVED) | YES: `6990` / `USD` (SOURCE-DERIVED) |
| `634288fa-e76a-4fec-96e6-28faf27692d9` | `crystal-frame` | Custom Crafts / `custom-crafts` / `72f2a9c8-bd21-4bbe-814a-b18e727cd012` (HUMAN APPROVED) | `published` (HUMAN APPROVED: compatibility mapping from `is_published=true`) | `NULL` / no backfill write (HUMAN APPROVED) | YES (SOURCE-DERIVED) | YES (SOURCE-DERIVED) | YES, unchanged (SOURCE-DERIVED) | YES: `2990` / `USD` (SOURCE-DERIVED) |
| `9321d436-e717-44e3-a058-a0f29d3b5a62` | `custom-pillow` | Custom Crafts / `custom-crafts` / `72f2a9c8-bd21-4bbe-814a-b18e727cd012` (HUMAN APPROVED) | `published` (HUMAN APPROVED: compatibility mapping from `is_published=true`) | `NULL` / no backfill write (HUMAN APPROVED) | YES (SOURCE-DERIVED) | YES (SOURCE-DERIVED) | YES, unchanged (SOURCE-DERIVED) | YES: `2490` / `USD` (SOURCE-DERIVED) |
| `b8e365b6-5e56-484c-9346-fc91fd1d9751` | `custom-puzzle` | Custom Crafts / `custom-crafts` / `72f2a9c8-bd21-4bbe-814a-b18e727cd012` (HUMAN APPROVED) | `published` (HUMAN APPROVED: compatibility mapping from `is_published=true`) | `NULL` / no backfill write (HUMAN APPROVED) | YES (SOURCE-DERIVED) | YES (SOURCE-DERIVED) | YES, unchanged (SOURCE-DERIVED) | YES: `2490` / `USD` (SOURCE-DERIVED) |
| `9f96c8a1-c5d5-4c67-bd67-a0cd12dcf720` | `digital-portrait` | Digital Gifts / `digital-gifts` / `45a2ff1d-9429-43f1-8e7b-ddc92d0114c5` (HUMAN APPROVED) | `published` (HUMAN APPROVED: compatibility mapping from `is_published=true`) | `NULL` / no backfill write (HUMAN APPROVED) | YES (SOURCE-DERIVED) | YES (SOURCE-DERIVED) | YES, unchanged (SOURCE-DERIVED) | YES: `990` / `USD` (SOURCE-DERIVED) |
| `7032424e-6bec-45b9-a0d0-548b909ff573` | `digital-wallpaper` | Digital Gifts / `digital-gifts` / `45a2ff1d-9429-43f1-8e7b-ddc92d0114c5` (HUMAN APPROVED) | `published` (HUMAN APPROVED: compatibility mapping from `is_published=true`) | `NULL` / no backfill write (HUMAN APPROVED) | YES (SOURCE-DERIVED) | YES (SOURCE-DERIVED) | YES, unchanged (SOURCE-DERIVED) | YES: `790` / `USD` (SOURCE-DERIVED) |
| `7f3bf07c-28ac-4cee-8b7f-de0a60aebc4a` | `figurine-keychain` | 3D Figures / `3d-figures` / `5e040e93-7924-479e-87b6-04d6126ff31f` (HUMAN APPROVED) | `published` (HUMAN APPROVED: compatibility mapping from `is_published=true`) | `NULL` / no backfill write (HUMAN APPROVED) | YES (SOURCE-DERIVED) | YES (SOURCE-DERIVED) | YES, unchanged (SOURCE-DERIVED) | YES: `3990` / `USD` (SOURCE-DERIVED) |
| `e876c4b9-b4ab-4da5-adfc-b0f243a57a52` | `fridge-magnet` | Custom Crafts / `custom-crafts` / `72f2a9c8-bd21-4bbe-814a-b18e727cd012` (HUMAN APPROVED) | `published` (HUMAN APPROVED: compatibility mapping from `is_published=true`) | `NULL` / no backfill write (HUMAN APPROVED) | YES (SOURCE-DERIVED) | YES (SOURCE-DERIVED) | YES, unchanged (SOURCE-DERIVED) | YES: `1290` / `USD` (SOURCE-DERIVED) |
| `f9a39759-b57e-41b0-b1fb-08e48ff50824` | `glass-light-picture` | Custom Crafts / `custom-crafts` / `72f2a9c8-bd21-4bbe-814a-b18e727cd012` (HUMAN APPROVED) | `published` (HUMAN APPROVED: compatibility mapping from `is_published=true`) | `NULL` / no backfill write (HUMAN APPROVED) | YES (SOURCE-DERIVED) | YES (SOURCE-DERIVED) | YES, unchanged (SOURCE-DERIVED) | YES: `3990` / `USD` (SOURCE-DERIVED) |
| `e6835ba4-6eb0-4105-8012-f8a70e174678` | `herbal-tattoo` | Custom Crafts / `custom-crafts` / `72f2a9c8-bd21-4bbe-814a-b18e727cd012` (HUMAN APPROVED) | `published` (HUMAN APPROVED: compatibility mapping from `is_published=true`) | `NULL` / no backfill write (HUMAN APPROVED) | YES (SOURCE-DERIVED) | YES (SOURCE-DERIVED) | YES, unchanged (SOURCE-DERIVED) | YES: `1290` / `USD` (SOURCE-DERIVED) |
| `61798bbe-9d3c-405c-a948-9a5e350e4f84` | `leaf-engraving` | Custom Crafts / `custom-crafts` / `72f2a9c8-bd21-4bbe-814a-b18e727cd012` (HUMAN APPROVED) | `published` (HUMAN APPROVED: compatibility mapping from `is_published=true`) | `NULL` / no backfill write (HUMAN APPROVED) | YES (SOURCE-DERIVED) | YES (SOURCE-DERIVED) | YES, unchanged (SOURCE-DERIVED) | YES: `2190` / `USD` (SOURCE-DERIVED) |
| `ca94e564-3112-49dc-98fd-728586e93ae3` | `pet-figure` | Pet Memories / `pet-memories` / `201e2667-9e03-46ed-bb2f-153f3d6c1e40` (HUMAN APPROVED) | `published` (HUMAN APPROVED: compatibility mapping from `is_published=true`) | `NULL` / no backfill write (HUMAN APPROVED) | YES (SOURCE-DERIVED) | YES (SOURCE-DERIVED) | YES, unchanged (SOURCE-DERIVED) | YES: `4590` / `USD` (SOURCE-DERIVED) |
| `c6a179a9-ab18-43d5-a300-f747b987314e` | `pet-memorial` | Pet Memories / `pet-memories` / `201e2667-9e03-46ed-bb2f-153f3d6c1e40` (HUMAN APPROVED) | `published` (HUMAN APPROVED: compatibility mapping from `is_published=true`) | `NULL` / no backfill write (HUMAN APPROVED) | YES (SOURCE-DERIVED) | YES (SOURCE-DERIVED) | YES, unchanged (SOURCE-DERIVED) | YES: `2990` / `USD` (SOURCE-DERIVED) |
| `d4f9d4a9-ebab-4090-9622-9dd1821e6053` | `pet-portrait` | Pet Memories / `pet-memories` / `201e2667-9e03-46ed-bb2f-153f3d6c1e40` (HUMAN APPROVED) | `published` (HUMAN APPROVED: compatibility mapping from `is_published=true`) | `NULL` / no backfill write (HUMAN APPROVED) | YES (SOURCE-DERIVED) | YES (SOURCE-DERIVED) | YES, unchanged (SOURCE-DERIVED) | YES: `2790` / `USD` (SOURCE-DERIVED) |
| `14aafb75-f945-43a9-a5ba-ea29e19c9b54` | `phone-case` | Custom Crafts / `custom-crafts` / `72f2a9c8-bd21-4bbe-814a-b18e727cd012` (HUMAN APPROVED) | `published` (HUMAN APPROVED: compatibility mapping from `is_published=true`) | `NULL` / no backfill write (HUMAN APPROVED) | YES (SOURCE-DERIVED) | YES (SOURCE-DERIVED) | YES, unchanged (SOURCE-DERIVED) | YES: `1490` / `USD` (SOURCE-DERIVED) |
| `d933649a-dd1c-4f9d-a498-18bbff48a2a6` | `pixel-cube` | 3D Figures / `3d-figures` / `5e040e93-7924-479e-87b6-04d6126ff31f` (HUMAN APPROVED) | `published` (HUMAN APPROVED: compatibility mapping from `is_published=true`) | `NULL` / no backfill write (HUMAN APPROVED) | YES (SOURCE-DERIVED) | YES (SOURCE-DERIVED) | YES, unchanged (SOURCE-DERIVED) | YES: `3490` / `USD` (SOURCE-DERIVED) |
| `b7232065-c317-46eb-b5a2-be651f5fdef4` | `solo-figure` | 3D Figures / `3d-figures` / `5e040e93-7924-479e-87b6-04d6126ff31f` (HUMAN APPROVED) | `published` (HUMAN APPROVED: compatibility mapping from `is_published=true`) | `NULL` / no backfill write (HUMAN APPROVED) | YES (SOURCE-DERIVED) | YES (SOURCE-DERIVED) | YES, unchanged (SOURCE-DERIVED) | YES: `3990` / `USD` (SOURCE-DERIVED) |
| `183f9e20-a632-4a1a-af39-405afdb38cb9` | `temporary-tattoo` | Custom Crafts / `custom-crafts` / `72f2a9c8-bd21-4bbe-814a-b18e727cd012` (HUMAN APPROVED) | `published` (HUMAN APPROVED: compatibility mapping from `is_published=true`) | `NULL` / no backfill write (HUMAN APPROVED) | YES (SOURCE-DERIVED) | YES (SOURCE-DERIVED) | YES, unchanged (SOURCE-DERIVED) | YES: `990` / `USD` (SOURCE-DERIVED) |
| `664d690c-cbae-42d4-adc5-bc32523587a4` | `wood-engraving` | Custom Crafts / `custom-crafts` / `72f2a9c8-bd21-4bbe-814a-b18e727cd012` (HUMAN APPROVED) | `published` (HUMAN APPROVED: compatibility mapping from `is_published=true`) | `NULL` / no backfill write (HUMAN APPROVED) | YES (SOURCE-DERIVED) | YES (SOURCE-DERIVED) | YES, unchanged (SOURCE-DERIVED) | YES: `2290` / `USD` (SOURCE-DERIVED) |

No Product is retired, deleted, unpublished, or replaced. Existing UUID, slug, `is_published`, `price_cents`, and `currency` remain unchanged.

## Section D — Approved default Variant mapping and remaining weight exceptions

The approved deterministic SKU convention is `LEGACY-` plus the uppercase, hyphen-free immutable Product UUID. It is globally unique across all 22 Products, contract-valid, independent of mutable names, and carries no supplier/factory/warehouse meaning.

### Fixed default Variant identity review

The UUID v4 literals below were generated locally exactly once under the approved identity policy. They are stable migration inputs: no migration may generate, replace, or regenerate them.

| Product UUID | Slug | Default Variant UUID | Approved SKU Code |
|---|---|---|---|
| `6ed25f1d-162f-4bbd-bd68-1e119dd8109f` | `ai-oil-portrait` | `1ab2a85a-b778-40ae-8aa1-031726632a6b` | `LEGACY-6ED25F1D162F4BBDBD681E119DD8109F` |
| `26314def-31c2-44ed-97b1-780be86f32d4` | `bobblehead` | `462a598a-feb1-4927-93ae-cdec77b9b1c9` | `LEGACY-26314DEF31C244ED97B1780BE86F32D4` |
| `ed04d884-c899-45bb-bacf-11e57df88ecc` | `brick-person` | `8697fb46-0216-44ba-b478-b3970caf1c6b` | `LEGACY-ED04D884C89945BBBACF11E57DF88ECC` |
| `300f5d88-909b-411d-841c-733692206bc0` | `couple-figure` | `807ac29c-6cf2-4402-aa9d-be3bf8fd45c6` | `LEGACY-300F5D88909B411D841C733692206BC0` |
| `634288fa-e76a-4fec-96e6-28faf27692d9` | `crystal-frame` | `183b7e47-77dd-4e6a-ab6c-78ea3aeb0d1a` | `LEGACY-634288FAE76A4FEC96E628FAF27692D9` |
| `9321d436-e717-44e3-a058-a0f29d3b5a62` | `custom-pillow` | `33faf8a5-bca0-425a-ae37-07a27bafd231` | `LEGACY-9321D436E71744E3A058A0F29D3B5A62` |
| `b8e365b6-5e56-484c-9346-fc91fd1d9751` | `custom-puzzle` | `c86c7aae-921f-454e-a18e-a08f7acc91fd` | `LEGACY-B8E365B65E56484C9346FC91FD1D9751` |
| `9f96c8a1-c5d5-4c67-bd67-a0cd12dcf720` | `digital-portrait` | `df280487-bbee-4df6-b341-5c3359a0c2c5` | `LEGACY-9F96C8A1C5D54C67BD67A0CD12DCF720` |
| `7032424e-6bec-45b9-a0d0-548b909ff573` | `digital-wallpaper` | `bec2c013-beee-45ce-8bfc-47f004de9f39` | `LEGACY-7032424E6BEC45B9A0D0548B909FF573` |
| `7f3bf07c-28ac-4cee-8b7f-de0a60aebc4a` | `figurine-keychain` | `64b87bbd-ae19-4531-9f0b-a09d03bbde9f` | `LEGACY-7F3BF07C28AC4CEE8B7FDE0A60AEBC4A` |
| `e876c4b9-b4ab-4da5-adfc-b0f243a57a52` | `fridge-magnet` | `f4935ef6-ca6b-4de2-aa5e-ca3645b9b4e3` | `LEGACY-E876C4B9B4AB4DA5ADFCB0F243A57A52` |
| `f9a39759-b57e-41b0-b1fb-08e48ff50824` | `glass-light-picture` | `e2cf4733-4adc-4451-aa51-621bba9843df` | `LEGACY-F9A39759B57E41B0B1FB08E48FF50824` |
| `e6835ba4-6eb0-4105-8012-f8a70e174678` | `herbal-tattoo` | `1c32b3f5-78d2-4943-a843-12eef60462db` | `LEGACY-E6835BA46EB041058012F8A70E174678` |
| `61798bbe-9d3c-405c-a948-9a5e350e4f84` | `leaf-engraving` | `8cb461cc-1873-44ae-b044-13a364474ed2` | `LEGACY-61798BBE9D3C405CA9489A5E350E4F84` |
| `ca94e564-3112-49dc-98fd-728586e93ae3` | `pet-figure` | `bce2668a-f83e-465c-a207-f470e568aee4` | `LEGACY-CA94E564311249DC98FD728586E93AE3` |
| `c6a179a9-ab18-43d5-a300-f747b987314e` | `pet-memorial` | `f89dffe9-69bd-49b5-9962-69d8cf239a32` | `LEGACY-C6A179A9AB1843D5A300F747B987314E` |
| `d4f9d4a9-ebab-4090-9622-9dd1821e6053` | `pet-portrait` | `93af15f0-a2e7-4be0-a0ff-c1d48cf48ea7` | `LEGACY-D4F9D4A9EBAB409096229DD1821E6053` |
| `14aafb75-f945-43a9-a5ba-ea29e19c9b54` | `phone-case` | `10a72f8a-b5bd-4167-b017-dbb81f2965c8` | `LEGACY-14AAFB75F94543A9A5BAEA29E19C9B54` |
| `d933649a-dd1c-4f9d-a498-18bbff48a2a6` | `pixel-cube` | `faae9ed6-34bf-4838-a6c2-7e14e36fd685` | `LEGACY-D933649ADD1C4F9DA49818BBFF48A2A6` |
| `b7232065-c317-46eb-b5a2-be651f5fdef4` | `solo-figure` | `afd2cb05-8f94-461f-a506-7a2885982a7d` | `LEGACY-B7232065C31746EBB5A2BE651F5FDEF4` |
| `183f9e20-a632-4a1a-af39-405afdb38cb9` | `temporary-tattoo` | `0a59ac35-a5fb-4168-9507-53c4beaaedac` | `LEGACY-183F9E20A6324A1AAF39405AFDB38CB9` |
| `664d690c-cbae-42d4-adc5-bc32523587a4` | `wood-engraving` | `35ecf2b9-46b3-42a6-8730-f421572b44e5` | `LEGACY-664D690CCBAE42D4ADC5BC32523587A4` |

No Product Options are created. Every compatibility Variant uses the empty combination signature and `[]` selected options. Availability is explicitly false and is not inferred from publication.

| Product UUID | Slug | Approved SKU code | price_cents | Currency | weight_grams | is_active | is_available | is_default | supply_method | combination_signature | Selected options | Remaining exception |
|---|---|---|---:|---|---|---|---|---|---|---|---|---|
| `6ed25f1d-162f-4bbd-bd68-1e119dd8109f` | `ai-oil-portrait` | `LEGACY-6ED25F1D162F4BBDBD681E119DD8109F` (HUMAN APPROVED) | 1290 (SOURCE-DERIVED) | USD (SOURCE-DERIVED) | `0` (HUMAN APPROVED: digital delivery has no physical shipment) | `true` (HUMAN APPROVED) | `false` (HUMAN APPROVED: preset candidate is not purchasable) | `true` (HUMAN APPROVED) | `digital_delivery` (HUMAN APPROVED) | empty string `''` (HUMAN APPROVED) | `[]` (HUMAN APPROVED) | Lead time remains unresolved |
| `26314def-31c2-44ed-97b1-780be86f32d4` | `bobblehead` | `LEGACY-26314DEF31C244ED97B1780BE86F32D4` (HUMAN APPROVED) | 5990 (SOURCE-DERIVED) | USD (SOURCE-DERIVED) | UNRESOLVED — HUMAN DECISION REQUIRED | `true` (HUMAN APPROVED) | `false` (HUMAN APPROVED: preset candidate is not purchasable) | `true` (HUMAN APPROVED) | `made_to_order` (HUMAN APPROVED) | empty string `''` (HUMAN APPROVED) | `[]` (HUMAN APPROVED) | Physical weight and lead time remain unresolved |
| `ed04d884-c899-45bb-bacf-11e57df88ecc` | `brick-person` | `LEGACY-ED04D884C89945BBBACF11E57DF88ECC` (HUMAN APPROVED) | 4990 (SOURCE-DERIVED) | USD (SOURCE-DERIVED) | UNRESOLVED — HUMAN DECISION REQUIRED | `true` (HUMAN APPROVED) | `false` (HUMAN APPROVED: preset candidate is not purchasable) | `true` (HUMAN APPROVED) | `made_to_order` (HUMAN APPROVED) | empty string `''` (HUMAN APPROVED) | `[]` (HUMAN APPROVED) | Physical weight and lead time remain unresolved |
| `300f5d88-909b-411d-841c-733692206bc0` | `couple-figure` | `LEGACY-300F5D88909B411D841C733692206BC0` (HUMAN APPROVED) | 6990 (SOURCE-DERIVED) | USD (SOURCE-DERIVED) | UNRESOLVED — HUMAN DECISION REQUIRED | `true` (HUMAN APPROVED) | `false` (HUMAN APPROVED: preset candidate is not purchasable) | `true` (HUMAN APPROVED) | `made_to_order` (HUMAN APPROVED) | empty string `''` (HUMAN APPROVED) | `[]` (HUMAN APPROVED) | Physical weight and lead time remain unresolved |
| `634288fa-e76a-4fec-96e6-28faf27692d9` | `crystal-frame` | `LEGACY-634288FAE76A4FEC96E628FAF27692D9` (HUMAN APPROVED) | 2990 (SOURCE-DERIVED) | USD (SOURCE-DERIVED) | UNRESOLVED — HUMAN DECISION REQUIRED | `true` (HUMAN APPROVED) | `false` (HUMAN APPROVED: preset candidate is not purchasable) | `true` (HUMAN APPROVED) | `made_to_order` (HUMAN APPROVED) | empty string `''` (HUMAN APPROVED) | `[]` (HUMAN APPROVED) | Physical weight and lead time remain unresolved |
| `9321d436-e717-44e3-a058-a0f29d3b5a62` | `custom-pillow` | `LEGACY-9321D436E71744E3A058A0F29D3B5A62` (HUMAN APPROVED) | 2490 (SOURCE-DERIVED) | USD (SOURCE-DERIVED) | UNRESOLVED — HUMAN DECISION REQUIRED | `true` (HUMAN APPROVED) | `false` (HUMAN APPROVED: preset candidate is not purchasable) | `true` (HUMAN APPROVED) | `made_to_order` (HUMAN APPROVED) | empty string `''` (HUMAN APPROVED) | `[]` (HUMAN APPROVED) | Physical weight and lead time remain unresolved |
| `b8e365b6-5e56-484c-9346-fc91fd1d9751` | `custom-puzzle` | `LEGACY-B8E365B65E56484C9346FC91FD1D9751` (HUMAN APPROVED) | 2490 (SOURCE-DERIVED) | USD (SOURCE-DERIVED) | UNRESOLVED — HUMAN DECISION REQUIRED | `true` (HUMAN APPROVED) | `false` (HUMAN APPROVED: preset candidate is not purchasable) | `true` (HUMAN APPROVED) | `made_to_order` (HUMAN APPROVED) | empty string `''` (HUMAN APPROVED) | `[]` (HUMAN APPROVED) | Physical weight and lead time remain unresolved |
| `9f96c8a1-c5d5-4c67-bd67-a0cd12dcf720` | `digital-portrait` | `LEGACY-9F96C8A1C5D54C67BD67A0CD12DCF720` (HUMAN APPROVED) | 990 (SOURCE-DERIVED) | USD (SOURCE-DERIVED) | `0` (HUMAN APPROVED: digital delivery has no physical shipment) | `true` (HUMAN APPROVED) | `false` (HUMAN APPROVED: preset candidate is not purchasable) | `true` (HUMAN APPROVED) | `digital_delivery` (HUMAN APPROVED) | empty string `''` (HUMAN APPROVED) | `[]` (HUMAN APPROVED) | Lead time remains unresolved |
| `7032424e-6bec-45b9-a0d0-548b909ff573` | `digital-wallpaper` | `LEGACY-7032424E6BEC45B9A0D0548B909FF573` (HUMAN APPROVED) | 790 (SOURCE-DERIVED) | USD (SOURCE-DERIVED) | `0` (HUMAN APPROVED: digital delivery has no physical shipment) | `true` (HUMAN APPROVED) | `false` (HUMAN APPROVED: preset candidate is not purchasable) | `true` (HUMAN APPROVED) | `digital_delivery` (HUMAN APPROVED) | empty string `''` (HUMAN APPROVED) | `[]` (HUMAN APPROVED) | Lead time remains unresolved |
| `7f3bf07c-28ac-4cee-8b7f-de0a60aebc4a` | `figurine-keychain` | `LEGACY-7F3BF07C28AC4CEE8B7FDE0A60AEBC4A` (HUMAN APPROVED) | 3990 (SOURCE-DERIVED) | USD (SOURCE-DERIVED) | UNRESOLVED — HUMAN DECISION REQUIRED | `true` (HUMAN APPROVED) | `false` (HUMAN APPROVED: preset candidate is not purchasable) | `true` (HUMAN APPROVED) | `made_to_order` (HUMAN APPROVED) | empty string `''` (HUMAN APPROVED) | `[]` (HUMAN APPROVED) | Physical weight and lead time remain unresolved |
| `e876c4b9-b4ab-4da5-adfc-b0f243a57a52` | `fridge-magnet` | `LEGACY-E876C4B9B4AB4DA5ADFCB0F243A57A52` (HUMAN APPROVED) | 1290 (SOURCE-DERIVED) | USD (SOURCE-DERIVED) | UNRESOLVED — HUMAN DECISION REQUIRED | `true` (HUMAN APPROVED) | `false` (HUMAN APPROVED: preset candidate is not purchasable) | `true` (HUMAN APPROVED) | `made_to_order` (HUMAN APPROVED) | empty string `''` (HUMAN APPROVED) | `[]` (HUMAN APPROVED) | Physical weight and lead time remain unresolved |
| `f9a39759-b57e-41b0-b1fb-08e48ff50824` | `glass-light-picture` | `LEGACY-F9A39759B57E41B0B1FB08E48FF50824` (HUMAN APPROVED) | 3990 (SOURCE-DERIVED) | USD (SOURCE-DERIVED) | UNRESOLVED — HUMAN DECISION REQUIRED | `true` (HUMAN APPROVED) | `false` (HUMAN APPROVED: preset candidate is not purchasable) | `true` (HUMAN APPROVED) | `made_to_order` (HUMAN APPROVED) | empty string `''` (HUMAN APPROVED) | `[]` (HUMAN APPROVED) | Physical weight and lead time remain unresolved |
| `e6835ba4-6eb0-4105-8012-f8a70e174678` | `herbal-tattoo` | `LEGACY-E6835BA46EB041058012F8A70E174678` (HUMAN APPROVED) | 1290 (SOURCE-DERIVED) | USD (SOURCE-DERIVED) | UNRESOLVED — HUMAN DECISION REQUIRED | `true` (HUMAN APPROVED) | `false` (HUMAN APPROVED: preset candidate is not purchasable) | `true` (HUMAN APPROVED) | `made_to_order` (HUMAN APPROVED) | empty string `''` (HUMAN APPROVED) | `[]` (HUMAN APPROVED) | Physical weight and lead time remain unresolved |
| `61798bbe-9d3c-405c-a948-9a5e350e4f84` | `leaf-engraving` | `LEGACY-61798BBE9D3C405CA9489A5E350E4F84` (HUMAN APPROVED) | 2190 (SOURCE-DERIVED) | USD (SOURCE-DERIVED) | UNRESOLVED — HUMAN DECISION REQUIRED | `true` (HUMAN APPROVED) | `false` (HUMAN APPROVED: preset candidate is not purchasable) | `true` (HUMAN APPROVED) | `made_to_order` (HUMAN APPROVED) | empty string `''` (HUMAN APPROVED) | `[]` (HUMAN APPROVED) | Physical weight and lead time remain unresolved |
| `ca94e564-3112-49dc-98fd-728586e93ae3` | `pet-figure` | `LEGACY-CA94E564311249DC98FD728586E93AE3` (HUMAN APPROVED) | 4590 (SOURCE-DERIVED) | USD (SOURCE-DERIVED) | UNRESOLVED — HUMAN DECISION REQUIRED | `true` (HUMAN APPROVED) | `false` (HUMAN APPROVED: preset candidate is not purchasable) | `true` (HUMAN APPROVED) | `made_to_order` (HUMAN APPROVED) | empty string `''` (HUMAN APPROVED) | `[]` (HUMAN APPROVED) | Physical weight and lead time remain unresolved |
| `c6a179a9-ab18-43d5-a300-f747b987314e` | `pet-memorial` | `LEGACY-C6A179A9AB1843D5A300F747B987314E` (HUMAN APPROVED) | 2990 (SOURCE-DERIVED) | USD (SOURCE-DERIVED) | UNRESOLVED — HUMAN DECISION REQUIRED | `true` (HUMAN APPROVED) | `false` (HUMAN APPROVED: preset candidate is not purchasable) | `true` (HUMAN APPROVED) | `made_to_order` (HUMAN APPROVED) | empty string `''` (HUMAN APPROVED) | `[]` (HUMAN APPROVED) | Physical weight and lead time remain unresolved |
| `d4f9d4a9-ebab-4090-9622-9dd1821e6053` | `pet-portrait` | `LEGACY-D4F9D4A9EBAB409096229DD1821E6053` (HUMAN APPROVED) | 2790 (SOURCE-DERIVED) | USD (SOURCE-DERIVED) | UNRESOLVED — HUMAN DECISION REQUIRED | `true` (HUMAN APPROVED) | `false` (HUMAN APPROVED: preset candidate is not purchasable) | `true` (HUMAN APPROVED) | `made_to_order` (HUMAN APPROVED) | empty string `''` (HUMAN APPROVED) | `[]` (HUMAN APPROVED) | Physical weight and lead time remain unresolved |
| `14aafb75-f945-43a9-a5ba-ea29e19c9b54` | `phone-case` | `LEGACY-14AAFB75F94543A9A5BAEA29E19C9B54` (HUMAN APPROVED) | 1490 (SOURCE-DERIVED) | USD (SOURCE-DERIVED) | UNRESOLVED — HUMAN DECISION REQUIRED | `true` (HUMAN APPROVED) | `false` (HUMAN APPROVED: preset candidate is not purchasable) | `true` (HUMAN APPROVED) | `made_to_order` (HUMAN APPROVED) | empty string `''` (HUMAN APPROVED) | `[]` (HUMAN APPROVED) | Physical weight and lead time remain unresolved |
| `d933649a-dd1c-4f9d-a498-18bbff48a2a6` | `pixel-cube` | `LEGACY-D933649ADD1C4F9DA49818BBFF48A2A6` (HUMAN APPROVED) | 3490 (SOURCE-DERIVED) | USD (SOURCE-DERIVED) | UNRESOLVED — HUMAN DECISION REQUIRED | `true` (HUMAN APPROVED) | `false` (HUMAN APPROVED: preset candidate is not purchasable) | `true` (HUMAN APPROVED) | `made_to_order` (HUMAN APPROVED) | empty string `''` (HUMAN APPROVED) | `[]` (HUMAN APPROVED) | Physical weight and lead time remain unresolved |
| `b7232065-c317-46eb-b5a2-be651f5fdef4` | `solo-figure` | `LEGACY-B7232065C31746EBB5A2BE651F5FDEF4` (HUMAN APPROVED) | 3990 (SOURCE-DERIVED) | USD (SOURCE-DERIVED) | UNRESOLVED — HUMAN DECISION REQUIRED | `true` (HUMAN APPROVED) | `false` (HUMAN APPROVED: preset candidate is not purchasable) | `true` (HUMAN APPROVED) | `made_to_order` (HUMAN APPROVED) | empty string `''` (HUMAN APPROVED) | `[]` (HUMAN APPROVED) | Physical weight and lead time remain unresolved |
| `183f9e20-a632-4a1a-af39-405afdb38cb9` | `temporary-tattoo` | `LEGACY-183F9E20A6324A1AAF39405AFDB38CB9` (HUMAN APPROVED) | 990 (SOURCE-DERIVED) | USD (SOURCE-DERIVED) | UNRESOLVED — HUMAN DECISION REQUIRED | `true` (HUMAN APPROVED) | `false` (HUMAN APPROVED: preset candidate is not purchasable) | `true` (HUMAN APPROVED) | `made_to_order` (HUMAN APPROVED) | empty string `''` (HUMAN APPROVED) | `[]` (HUMAN APPROVED) | Physical weight and lead time remain unresolved |
| `664d690c-cbae-42d4-adc5-bc32523587a4` | `wood-engraving` | `LEGACY-664D690CCBAE42D4ADC5BC32523587A4` (HUMAN APPROVED) | 2290 (SOURCE-DERIVED) | USD (SOURCE-DERIVED) | UNRESOLVED — HUMAN DECISION REQUIRED | `true` (HUMAN APPROVED) | `false` (HUMAN APPROVED: preset candidate is not purchasable) | `true` (HUMAN APPROVED) | `made_to_order` (HUMAN APPROVED) | empty string `''` (HUMAN APPROVED) | `[]` (HUMAN APPROVED) | Physical weight and lead time remain unresolved |

## Section E — Approved fulfillment mapping and unresolved lead time

| Product UUID | Slug | Approved Category | fulfillment_type | requires_shipping | production_mode | Min lead days | Max lead days | Variant supply_method | Variant weight_grams |
|---|---|---|---|---|---|---|---|---|---|
| `6ed25f1d-162f-4bbd-bd68-1e119dd8109f` | `ai-oil-portrait` | Digital Gifts (HUMAN APPROVED) | `digital` (HUMAN APPROVED) | `false` (HUMAN APPROVED) | `digital_creation` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED | UNRESOLVED — HUMAN DECISION REQUIRED | `digital_delivery` (HUMAN APPROVED) | `0` (HUMAN APPROVED) |
| `26314def-31c2-44ed-97b1-780be86f32d4` | `bobblehead` | 3D Figures (HUMAN APPROVED) | `physical` (HUMAN APPROVED) | `true` (HUMAN APPROVED) | `custom_manufacturing` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED | UNRESOLVED — HUMAN DECISION REQUIRED | `made_to_order` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED |
| `ed04d884-c899-45bb-bacf-11e57df88ecc` | `brick-person` | 3D Figures (HUMAN APPROVED) | `physical` (HUMAN APPROVED) | `true` (HUMAN APPROVED) | `custom_manufacturing` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED | UNRESOLVED — HUMAN DECISION REQUIRED | `made_to_order` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED |
| `300f5d88-909b-411d-841c-733692206bc0` | `couple-figure` | 3D Figures (HUMAN APPROVED) | `physical` (HUMAN APPROVED) | `true` (HUMAN APPROVED) | `custom_manufacturing` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED | UNRESOLVED — HUMAN DECISION REQUIRED | `made_to_order` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED |
| `634288fa-e76a-4fec-96e6-28faf27692d9` | `crystal-frame` | Custom Crafts (HUMAN APPROVED) | `physical` (HUMAN APPROVED) | `true` (HUMAN APPROVED) | `custom_manufacturing` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED | UNRESOLVED — HUMAN DECISION REQUIRED | `made_to_order` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED |
| `9321d436-e717-44e3-a058-a0f29d3b5a62` | `custom-pillow` | Custom Crafts (HUMAN APPROVED) | `physical` (HUMAN APPROVED) | `true` (HUMAN APPROVED) | `custom_manufacturing` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED | UNRESOLVED — HUMAN DECISION REQUIRED | `made_to_order` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED |
| `b8e365b6-5e56-484c-9346-fc91fd1d9751` | `custom-puzzle` | Custom Crafts (HUMAN APPROVED) | `physical` (HUMAN APPROVED) | `true` (HUMAN APPROVED) | `custom_manufacturing` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED | UNRESOLVED — HUMAN DECISION REQUIRED | `made_to_order` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED |
| `9f96c8a1-c5d5-4c67-bd67-a0cd12dcf720` | `digital-portrait` | Digital Gifts (HUMAN APPROVED) | `digital` (HUMAN APPROVED) | `false` (HUMAN APPROVED) | `digital_creation` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED | UNRESOLVED — HUMAN DECISION REQUIRED | `digital_delivery` (HUMAN APPROVED) | `0` (HUMAN APPROVED) |
| `7032424e-6bec-45b9-a0d0-548b909ff573` | `digital-wallpaper` | Digital Gifts (HUMAN APPROVED) | `digital` (HUMAN APPROVED) | `false` (HUMAN APPROVED) | `digital_creation` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED | UNRESOLVED — HUMAN DECISION REQUIRED | `digital_delivery` (HUMAN APPROVED) | `0` (HUMAN APPROVED) |
| `7f3bf07c-28ac-4cee-8b7f-de0a60aebc4a` | `figurine-keychain` | 3D Figures (HUMAN APPROVED) | `physical` (HUMAN APPROVED) | `true` (HUMAN APPROVED) | `custom_manufacturing` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED | UNRESOLVED — HUMAN DECISION REQUIRED | `made_to_order` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED |
| `e876c4b9-b4ab-4da5-adfc-b0f243a57a52` | `fridge-magnet` | Custom Crafts (HUMAN APPROVED) | `physical` (HUMAN APPROVED) | `true` (HUMAN APPROVED) | `custom_manufacturing` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED | UNRESOLVED — HUMAN DECISION REQUIRED | `made_to_order` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED |
| `f9a39759-b57e-41b0-b1fb-08e48ff50824` | `glass-light-picture` | Custom Crafts (HUMAN APPROVED) | `physical` (HUMAN APPROVED) | `true` (HUMAN APPROVED) | `custom_manufacturing` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED | UNRESOLVED — HUMAN DECISION REQUIRED | `made_to_order` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED |
| `e6835ba4-6eb0-4105-8012-f8a70e174678` | `herbal-tattoo` | Custom Crafts (HUMAN APPROVED) | `physical` (HUMAN APPROVED) | `true` (HUMAN APPROVED) | `custom_manufacturing` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED | UNRESOLVED — HUMAN DECISION REQUIRED | `made_to_order` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED |
| `61798bbe-9d3c-405c-a948-9a5e350e4f84` | `leaf-engraving` | Custom Crafts (HUMAN APPROVED) | `physical` (HUMAN APPROVED) | `true` (HUMAN APPROVED) | `custom_manufacturing` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED | UNRESOLVED — HUMAN DECISION REQUIRED | `made_to_order` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED |
| `ca94e564-3112-49dc-98fd-728586e93ae3` | `pet-figure` | Pet Memories (HUMAN APPROVED) | `physical` (HUMAN APPROVED) | `true` (HUMAN APPROVED) | `custom_manufacturing` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED | UNRESOLVED — HUMAN DECISION REQUIRED | `made_to_order` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED |
| `c6a179a9-ab18-43d5-a300-f747b987314e` | `pet-memorial` | Pet Memories (HUMAN APPROVED) | `physical` (HUMAN APPROVED) | `true` (HUMAN APPROVED) | `custom_manufacturing` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED | UNRESOLVED — HUMAN DECISION REQUIRED | `made_to_order` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED |
| `d4f9d4a9-ebab-4090-9622-9dd1821e6053` | `pet-portrait` | Pet Memories (HUMAN APPROVED) | `physical` (HUMAN APPROVED) | `true` (HUMAN APPROVED) | `custom_manufacturing` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED | UNRESOLVED — HUMAN DECISION REQUIRED | `made_to_order` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED |
| `14aafb75-f945-43a9-a5ba-ea29e19c9b54` | `phone-case` | Custom Crafts (HUMAN APPROVED) | `physical` (HUMAN APPROVED) | `true` (HUMAN APPROVED) | `custom_manufacturing` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED | UNRESOLVED — HUMAN DECISION REQUIRED | `made_to_order` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED |
| `d933649a-dd1c-4f9d-a498-18bbff48a2a6` | `pixel-cube` | 3D Figures (HUMAN APPROVED) | `physical` (HUMAN APPROVED) | `true` (HUMAN APPROVED) | `custom_manufacturing` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED | UNRESOLVED — HUMAN DECISION REQUIRED | `made_to_order` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED |
| `b7232065-c317-46eb-b5a2-be651f5fdef4` | `solo-figure` | 3D Figures (HUMAN APPROVED) | `physical` (HUMAN APPROVED) | `true` (HUMAN APPROVED) | `custom_manufacturing` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED | UNRESOLVED — HUMAN DECISION REQUIRED | `made_to_order` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED |
| `183f9e20-a632-4a1a-af39-405afdb38cb9` | `temporary-tattoo` | Custom Crafts (HUMAN APPROVED) | `physical` (HUMAN APPROVED) | `true` (HUMAN APPROVED) | `custom_manufacturing` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED | UNRESOLVED — HUMAN DECISION REQUIRED | `made_to_order` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED |
| `664d690c-cbae-42d4-adc5-bc32523587a4` | `wood-engraving` | Custom Crafts (HUMAN APPROVED) | `physical` (HUMAN APPROVED) | `true` (HUMAN APPROVED) | `custom_manufacturing` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED | UNRESOLVED — HUMAN DECISION REQUIRED | `made_to_order` (HUMAN APPROVED) | UNRESOLVED — HUMAN DECISION REQUIRED |

Approved compatibility semantics do not imply supplier confirmation or launch approval. Every Variant remains unavailable.

## Section F — Historical order safety

| Product UUID | Slug | Aggregate order_item references | Preservation requirement |
|---|---|---:|---|
| `6ed25f1d-162f-4bbd-bd68-1e119dd8109f` | `ai-oil-portrait` | 1 | Preserve UUID; keep existing `order_items.product_id`; later Variant/snapshot additions must be additive |
| `300f5d88-909b-411d-841c-733692206bc0` | `couple-figure` | 7 | Preserve UUID; keep existing `order_items.product_id`; later Variant/snapshot additions must be additive |
| `7032424e-6bec-45b9-a0d0-548b909ff573` | `digital-wallpaper` | 2 | Preserve UUID; keep existing `order_items.product_id`; later Variant/snapshot additions must be additive |
| `f9a39759-b57e-41b0-b1fb-08e48ff50824` | `glass-light-picture` | 1 | Preserve UUID; keep existing `order_items.product_id`; later Variant/snapshot additions must be additive |
| `ca94e564-3112-49dc-98fd-728586e93ae3` | `pet-figure` | 1 | Preserve UUID; keep existing `order_items.product_id`; later Variant/snapshot additions must be additive |
| `b7232065-c317-46eb-b5a2-be651f5fdef4` | `solo-figure` | 1 | Preserve UUID; keep existing `order_items.product_id`; later Variant/snapshot additions must be additive |

Historical coverage remains **6 Products** and **13 order-item references**. Product UUIDs and existing `order_items.product_id` relationships must remain valid; later additions must be additive.

## Section G — Remaining exception list

See [catalog-product-preflight-exceptions.md](./catalog-product-preflight-exceptions.md). Only physical `weight_grams` and structured minimum/maximum lead-time fields remain unresolved.

## Preflight coverage check

| Measure | Result |
|---|---:|
| Remote Product count | 22 |
| Mapped Product count | 22 |
| Missing Product count | 0 |
| Duplicate Product count | 0 |
| Historical referenced Product count | 6 |
| Historical order_item references | 13 |
| Previously recorded unresolved business-value count | 63 |
| Unresolved default Variant identity count | 0 |
| Total unresolved decision-cell count | 63 |
| Products with unresolved physical weight | 19 |
| Products with unresolved minimum lead time | 22 |
| Products with unresolved maximum lead time | 22 |
| Products fully resolved | 0 |
| Category decision groups remaining | 0 |
| Products with one or more unresolved fields | 22 |

**Coverage result: 22/22. Task 3.5 remains incomplete. BACKFILL AUTHORIZED: NO.**

## Human decision packet

This is the single per-Product review table for Task 3.5. `NEEDS HUMAN DECISION` means no production evidence or prior approval exists. The source label `Baseline + A/D/E` refers to `docs/catalog-schema-baseline.md` and Sections A, D, and E of this active preflight.

| Product ID | Slug / Product name | Current publication/deletion state | Legacy price / currency | Fulfillment type / shipping / production mode | Proposed default SKU code | Proposed default Variant identity | Selected Options | Supply / active / available / default | Weight grams | Min lead days | Max lead days | Evidence/source | Human approval status | Notes / exception |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `6ed25f1d-162f-4bbd-bd68-1e119dd8109f` | `ai-oil-portrait` / AI Oil Painting Portrait | published; no deletion field/state | 1290 / USD | digital / false / digital_creation | `LEGACY-6ED25F1D162F4BBDBD681E119DD8109F` | `1ab2a85a-b778-40ae-8aa1-031726632a6b` | `[]` | digital_delivery / true / false / true | 0 (approved) | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | Baseline + A/D/E | **BLOCKED** | Lead time missing |
| `26314def-31c2-44ed-97b1-780be86f32d4` | `bobblehead` / Custom Bobblehead | published; no deletion field/state | 5990 / USD | physical / true / custom_manufacturing | `LEGACY-26314DEF31C244ED97B1780BE86F32D4` | `462a598a-feb1-4927-93ae-cdec77b9b1c9` | `[]` | made_to_order / true / false / true | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | Baseline + A/D/E | **BLOCKED** | Packaged weight and lead time missing |
| `ed04d884-c899-45bb-bacf-11e57df88ecc` | `brick-person` / Photo Brick Figure | published; no deletion field/state | 4990 / USD | physical / true / custom_manufacturing | `LEGACY-ED04D884C89945BBBACF11E57DF88ECC` | `8697fb46-0216-44ba-b478-b3970caf1c6b` | `[]` | made_to_order / true / false / true | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | Baseline + A/D/E | **BLOCKED** | Packaged weight and lead time missing |
| `300f5d88-909b-411d-841c-733692206bc0` | `couple-figure` / Custom Couple Figure | published; no deletion field/state | 6990 / USD | physical / true / custom_manufacturing | `LEGACY-300F5D88909B411D841C733692206BC0` | `807ac29c-6cf2-4402-aa9d-be3bf8fd45c6` | `[]` | made_to_order / true / false / true | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | Baseline + A/D/E | **BLOCKED** | Packaged weight and lead time missing |
| `634288fa-e76a-4fec-96e6-28faf27692d9` | `crystal-frame` / Crystal Photo Frame | published; no deletion field/state | 2990 / USD | physical / true / custom_manufacturing | `LEGACY-634288FAE76A4FEC96E628FAF27692D9` | `183b7e47-77dd-4e6a-ab6c-78ea3aeb0d1a` | `[]` | made_to_order / true / false / true | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | Baseline + A/D/E | **BLOCKED** | Packaged weight and lead time missing |
| `9321d436-e717-44e3-a058-a0f29d3b5a62` | `custom-pillow` / Custom Photo Pillow | published; no deletion field/state | 2490 / USD | physical / true / custom_manufacturing | `LEGACY-9321D436E71744E3A058A0F29D3B5A62` | `33faf8a5-bca0-425a-ae37-07a27bafd231` | `[]` | made_to_order / true / false / true | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | Baseline + A/D/E | **BLOCKED** | Packaged weight and lead time missing |
| `b8e365b6-5e56-484c-9346-fc91fd1d9751` | `custom-puzzle` / Custom Photo Puzzle | published; no deletion field/state | 2490 / USD | physical / true / custom_manufacturing | `LEGACY-B8E365B65E56484C9346FC91FD1D9751` | `c86c7aae-921f-454e-a18e-a08f7acc91fd` | `[]` | made_to_order / true / false / true | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | Baseline + A/D/E | **BLOCKED** | Packaged weight and lead time missing |
| `9f96c8a1-c5d5-4c67-bd67-a0cd12dcf720` | `digital-portrait` / AI Illustrated Portrait | published; no deletion field/state | 990 / USD | digital / false / digital_creation | `LEGACY-9F96C8A1C5D54C67BD67A0CD12DCF720` | `df280487-bbee-4df6-b341-5c3359a0c2c5` | `[]` | digital_delivery / true / false / true | 0 (approved) | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | Baseline + A/D/E | **BLOCKED** | Lead time missing |
| `7032424e-6bec-45b9-a0d0-548b909ff573` | `digital-wallpaper` / Digital Wallpaper Illustration | published; no deletion field/state | 790 / USD | digital / false / digital_creation | `LEGACY-7032424E6BEC45B9A0D0548B909FF573` | `bec2c013-beee-45ce-8bfc-47f004de9f39` | `[]` | digital_delivery / true / false / true | 0 (approved) | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | Baseline + A/D/E | **BLOCKED** | Lead time missing |
| `7f3bf07c-28ac-4cee-8b7f-de0a60aebc4a` | `figurine-keychain` / 3D Printed Figurine Keychain | published; no deletion field/state | 3990 / USD | physical / true / custom_manufacturing | `LEGACY-7F3BF07C28AC4CEE8B7FDE0A60AEBC4A` | `64b87bbd-ae19-4531-9f0b-a09d03bbde9f` | `[]` | made_to_order / true / false / true | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | Baseline + A/D/E | **BLOCKED** | Packaged weight and lead time missing |
| `e876c4b9-b4ab-4da5-adfc-b0f243a57a52` | `fridge-magnet` / Custom Fridge Magnet | published; no deletion field/state | 1290 / USD | physical / true / custom_manufacturing | `LEGACY-E876C4B9B4AB4DA5ADFCB0F243A57A52` | `f4935ef6-ca6b-4de2-aa5e-ca3645b9b4e3` | `[]` | made_to_order / true / false / true | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | Baseline + A/D/E | **BLOCKED** | Packaged weight and lead time missing |
| `f9a39759-b57e-41b0-b1fb-08e48ff50824` | `glass-light-picture` / Custom Glass Light Picture | published; no deletion field/state | 3990 / USD | physical / true / custom_manufacturing | `LEGACY-F9A39759B57E41B0B1FB08E48FF50824` | `e2cf4733-4adc-4451-aa51-621bba9843df` | `[]` | made_to_order / true / false / true | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | Baseline + A/D/E | **BLOCKED** | Packaged weight and lead time missing |
| `e6835ba4-6eb0-4105-8012-f8a70e174678` | `herbal-tattoo` / Herbal Temporary Tattoo Set | published; no deletion field/state | 1290 / USD | physical / true / custom_manufacturing | `LEGACY-E6835BA46EB041058012F8A70E174678` | `1c32b3f5-78d2-4943-a843-12eef60462db` | `[]` | made_to_order / true / false / true | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | Baseline + A/D/E | **BLOCKED** | Packaged weight and lead time missing |
| `61798bbe-9d3c-405c-a948-9a5e350e4f84` | `leaf-engraving` / Leaf Engraved Picture | published; no deletion field/state | 2190 / USD | physical / true / custom_manufacturing | `LEGACY-61798BBE9D3C405CA9489A5E350E4F84` | `8cb461cc-1873-44ae-b044-13a364474ed2` | `[]` | made_to_order / true / false / true | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | Baseline + A/D/E | **BLOCKED** | Packaged weight and lead time missing |
| `ca94e564-3112-49dc-98fd-728586e93ae3` | `pet-figure` / Pet Portrait Figurine | published; no deletion field/state | 4590 / USD | physical / true / custom_manufacturing | `LEGACY-CA94E564311249DC98FD728586E93AE3` | `bce2668a-f83e-465c-a207-f470e568aee4` | `[]` | made_to_order / true / false / true | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | Baseline + A/D/E | **BLOCKED** | Packaged weight and lead time missing |
| `c6a179a9-ab18-43d5-a300-f747b987314e` | `pet-memorial` / Always With You Portrait | published; no deletion field/state | 2990 / USD | physical / true / custom_manufacturing | `LEGACY-C6A179A9AB1843D5A300F747B987314E` | `f89dffe9-69bd-49b5-9962-69d8cf239a32` | `[]` | made_to_order / true / false / true | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | Baseline + A/D/E | **BLOCKED** | Packaged weight and lead time missing |
| `d4f9d4a9-ebab-4090-9622-9dd1821e6053` | `pet-portrait` / Custom Pet Portrait | published; no deletion field/state | 2790 / USD | physical / true / custom_manufacturing | `LEGACY-D4F9D4A9EBAB409096229DD1821E6053` | `93af15f0-a2e7-4be0-a0ff-c1d48cf48ea7` | `[]` | made_to_order / true / false / true | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | Baseline + A/D/E | **BLOCKED** | Packaged weight and lead time missing |
| `14aafb75-f945-43a9-a5ba-ea29e19c9b54` | `phone-case` / Custom Phone Case | published; no deletion field/state | 1490 / USD | physical / true / custom_manufacturing | `LEGACY-14AAFB75F94543A9A5BAEA29E19C9B54` | `10a72f8a-b5bd-4167-b017-dbb81f2965c8` | `[]` | made_to_order / true / false / true | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | Baseline + A/D/E | **BLOCKED** | Packaged weight and lead time missing |
| `d933649a-dd1c-4f9d-a498-18bbff48a2a6` | `pixel-cube` / Custom Pixel Photo Cube | published; no deletion field/state | 3490 / USD | physical / true / custom_manufacturing | `LEGACY-D933649ADD1C4F9DA49818BBFF48A2A6` | `faae9ed6-34bf-4838-a6c2-7e14e36fd685` | `[]` | made_to_order / true / false / true | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | Baseline + A/D/E | **BLOCKED** | Packaged weight and lead time missing |
| `b7232065-c317-46eb-b5a2-be651f5fdef4` | `solo-figure` / Photo to Mini Figure | published; no deletion field/state | 3990 / USD | physical / true / custom_manufacturing | `LEGACY-B7232065C31746EBB5A2BE651F5FDEF4` | `afd2cb05-8f94-461f-a506-7a2885982a7d` | `[]` | made_to_order / true / false / true | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | Baseline + A/D/E | **BLOCKED** | Packaged weight and lead time missing |
| `183f9e20-a632-4a1a-af39-405afdb38cb9` | `temporary-tattoo` / Custom Temporary Tattoos | published; no deletion field/state | 990 / USD | physical / true / custom_manufacturing | `LEGACY-183F9E20A6324A1AAF39405AFDB38CB9` | `0a59ac35-a5fb-4168-9507-53c4beaaedac` | `[]` | made_to_order / true / false / true | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | Baseline + A/D/E | **BLOCKED** | Packaged weight and lead time missing |
| `664d690c-cbae-42d4-adc5-bc32523587a4` | `wood-engraving` / Custom Wood Engraving | published; no deletion field/state | 2290 / USD | physical / true / custom_manufacturing | `LEGACY-664D690CCBAE42D4ADC5BC32523587A4` | `35ecf2b9-46b3-42a6-8730-f421572b44e5` | `[]` | made_to_order / true / false / true | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | **NEEDS HUMAN DECISION** | Baseline + A/D/E | **BLOCKED** | Packaged weight and lead time missing |

## Human response template

Copy, fill, and return this block. Default Variant UUIDs are now fixed and therefore omitted. Digital Products intentionally omit `weight_grams` because their approved value is already `0`.

```text
Product: ai-oil-portrait
min_lead_time_business_days:
max_lead_time_business_days:

Product: bobblehead
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:

Product: brick-person
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:

Product: couple-figure
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:

Product: crystal-frame
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:

Product: custom-pillow
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:

Product: custom-puzzle
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:

Product: digital-portrait
min_lead_time_business_days:
max_lead_time_business_days:

Product: digital-wallpaper
min_lead_time_business_days:
max_lead_time_business_days:

Product: figurine-keychain
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:

Product: fridge-magnet
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:

Product: glass-light-picture
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:

Product: herbal-tattoo
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:

Product: leaf-engraving
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:

Product: pet-figure
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:

Product: pet-memorial
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:

Product: pet-portrait
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:

Product: phone-case
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:

Product: pixel-cube
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:

Product: solo-figure
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:

Product: temporary-tattoo
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:

Product: wood-engraving
weight_grams:
min_lead_time_business_days:
max_lead_time_business_days:
```
