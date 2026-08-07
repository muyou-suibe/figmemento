## Purpose

Defines the public PhotoGift catalog experience so shoppers can browse published products, open data-driven category and product pages, select valid SKU combinations, and understand variant-derived pricing and fulfillment information without exposing draft or private data.

## ADDED Requirements

### Requirement: Public catalog routes are data-driven

The storefront SHALL provide `/shop`, `/category/[slug]`, and `/product/[slug]` using the authoritative catalog source. These routes MUST NOT depend on a hardcoded production category list, SKU list, product record, base price, or fixture fallback.

#### Scenario: Shopper opens the shop
- **WHEN** a shopper visits `/shop` and the catalog is available
- **THEN** the page lists eligible published Products and their single-level Categories from authoritative catalog data

#### Scenario: Shopper opens a category
- **WHEN** a shopper visits a valid active category slug
- **THEN** the page identifies the Category and lists only its eligible published Products

#### Scenario: Production source fails
- **WHEN** an authoritative product or category query fails or production catalog configuration is unavailable
- **THEN** the route presents a controlled unavailable state and never substitutes the 22 development fixtures

### Requirement: Shop supports basic discovery

The shop experience SHALL support basic category filtering and text search or equivalent basic filtering over published catalog data, and it SHALL provide understandable empty results without exposing unpublished records.

#### Scenario: Shopper filters by category
- **WHEN** a shopper selects an active Category
- **THEN** only eligible Products assigned to that Category are shown

#### Scenario: Search has no matches
- **WHEN** a shopper's basic search or filter finds no eligible published Product
- **THEN** the storefront shows an empty-result state and offers a path back to the full shop

### Requirement: Product detail exposes catalog information without customization behavior

The product detail page SHALL show the published Product's customer-facing content, media, eligible Variant Options and SKUs, selected-SKU base price and currency, basic FulfillmentConfig, and relevant policy information. C1 SHALL NOT render or validate complete CustomizationFields, private uploads, customization surcharges, shipping quotes, or production-preview actions.

#### Scenario: Shopper opens a published product
- **WHEN** a shopper opens a published Product with at least one eligible SKU
- **THEN** the page shows its catalog content, marketing assets, selectable SKU dimensions, variant-derived base price, fulfillment type, and basic production lead time

#### Scenario: Shopper selects a SKU combination
- **WHEN** the shopper selects a complete valid set of Variant Option Values
- **THEN** the page resolves one eligible SKU and updates SKU-specific price, availability, and media where configured

#### Scenario: Shopper selects an incomplete or unavailable combination
- **WHEN** selected Option Values do not resolve one active and available SKU
- **THEN** the page prevents purchase of that selection and explains that the combination is incomplete or unavailable

### Requirement: Listing prices are derived from eligible SKUs

Product cards and category results SHALL derive their displayed base price from active and available Variants/SKUs. When multiple eligible prices exist, the storefront SHALL communicate a starting-price presentation rather than implying every SKU has the same price.

#### Scenario: Product has one eligible price
- **WHEN** every eligible SKU for a Product has the same base price and currency
- **THEN** the product listing shows that base price without reading a product-level compatibility price

#### Scenario: Product has multiple eligible prices
- **WHEN** eligible SKUs have different base prices
- **THEN** the listing displays the lowest eligible price as a clear starting price and the detail page shows the selected SKU's exact base price

#### Scenario: Product has no eligible SKU
- **WHEN** no active and available SKU remains
- **THEN** the Product is omitted from purchasable public catalog results

### Requirement: Product marketing media follows configured roles and order

Public catalog pages SHALL render safe ProductAssets according to their media type, role, configured order, and optional selected-SKU association. Customer-private photos, order uploads, production previews, and digital-delivery files MUST NOT be queried or rendered as ProductAssets.

#### Scenario: Product has ordered gallery media
- **WHEN** a published Product includes thumbnail, gallery, detail, example, or video assets
- **THEN** the page presents supported media in configured order with accessible descriptive text where applicable

#### Scenario: Selected SKU has specific media
- **WHEN** the selected SKU has associated ProductAssets
- **THEN** the storefront can prefer or add those assets without displaying assets attached to another Product

#### Scenario: Asset is missing or invalid
- **WHEN** one optional ProductAsset cannot be loaded or is malformed
- **THEN** the page remains usable, avoids exposing internal provider details, and presents a safe fallback for that asset without substituting a fixture Product

### Requirement: Draft and unknown catalog routes do not leak data

Unknown, inactive, and unpublished Category, Product, and Variant/SKU identifiers SHALL not disclose draft catalog data through public pages or public API responses.

#### Scenario: Shopper opens an unknown product slug
- **WHEN** no eligible published Product matches `/product/[slug]`
- **THEN** the storefront returns a not-found result without revealing whether an unpublished record exists

#### Scenario: Shopper requests an unpublished category
- **WHEN** a Category is inactive or unavailable to the public
- **THEN** its route returns a not-found result and does not list its draft Products

### Requirement: Catalog routes provide product-specific metadata

Public shop, Category, and Product routes SHALL provide appropriate page titles, descriptions, canonical route information, and shareable Product media where configured, using catalog SEO data rather than hardcoded per-product metadata.

#### Scenario: Published product has SEO metadata
- **WHEN** a crawler or shopper opens a published Product detail route
- **THEN** the response contains the Product's configured title, description, canonical route, and eligible SEO image metadata

#### Scenario: Optional SEO fields are missing
- **WHEN** a published Product lacks an optional SEO override
- **THEN** the page derives a safe fallback from public Product content without exposing internal or draft fields

