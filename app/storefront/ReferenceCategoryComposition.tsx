"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { PublicCatalogProductSummary } from "../application/catalog-repository";
import type { Category } from "../domain/catalog/index.ts";
import { ReferenceText, useReferenceLanguage } from "./ReferenceLanguageProvider";
import { CatalogProductGrid, type ReferenceShopCardPresentation } from "./CatalogDiscovery";
import styles from "./catalog-storefront.module.css";

type CategorySection = {
  kicker: string;
  title: string;
  intro: string;
  note: string;
};

const categoryCardPresentationBySlug: Record<string, readonly ReferenceShopCardPresentation[]> = {
  "3d-figures": [
    { mediaLabel: "Figurine #1", peek: "pick me", rating: "★ 4.9 · 128", badge: "Bestseller", badgeTone: "hot" },
    { mediaLabel: "Figurine #2", peek: "for two", rating: "★ 4.8 · 94", badge: "Anniversary", badgeTone: "soft" },
    { mediaLabel: "Figurine #3", peek: "good dog", rating: "★ 4.9 · 203", badge: "Pet Memorial →", badgeTone: "soft" },
    { mediaLabel: "Figurine #4", peek: "he nods", rating: "★ 4.7 · 76", badge: "Desks & dashboards", badgeTone: "soft" },
    { mediaLabel: "Figurine #5", peek: "brick by brick", rating: "★ 4.6 · 52", badge: "Playful", badgeTone: "soft" },
    { mediaLabel: "Figurine #2b", peek: "the whole family", rating: "★ 4.8 · 38", badge: "Made to order", badgeTone: "soft" },
  ],
  "custom-crafts": [
    { mediaLabel: "Portrait #8", peek: "on canvas", rating: "★ 4.9 · 141", badge: "Pet Memorial →", badgeTone: "soft" },
    { mediaLabel: "Leaf #10", peek: "one of a kind", rating: "★ 4.8 · 41", badge: "One of a kind", badgeTone: "soft" },
    { mediaLabel: "Wood #14", peek: "for decades", rating: "★ 4.8 · 63", badge: "New homes", badgeTone: "soft" },
    { mediaLabel: "Glass #9", peek: "lights up", rating: "★ 4.7 · 55", badge: "LED base option", badgeTone: "soft" },
    { mediaLabel: "Mosaic #6", peek: "1,024 cubes", rating: "★ 4.6 · 47", badge: "Quietly clever", badgeTone: "soft" },
    { mediaLabel: "Kit #7", peek: "you paint it", rating: "★ 4.7 · 82", badge: "DIY", badgeTone: "soft" },
  ],
  "pet-memories": [
    { mediaLabel: "Pet Figurine #3", peek: "the old spot", rating: "★ 4.9 · 203", badge: "Most loved", badgeTone: "soft" },
    { mediaLabel: "Portrait #8", peek: "at eye level", rating: "★ 4.9 · 141", badge: "For the wall", badgeTone: "soft" },
    { mediaLabel: "Crystal #13", peek: "morning light", rating: "★ 4.7 · 66", badge: "Windowsill", badgeTone: "soft" },
    { mediaLabel: "Puzzle #12", peek: "one evening", rating: "★ 4.8 · 71", badge: "For quiet evenings", badgeTone: "soft" },
    { mediaLabel: "Magnet #11", peek: "daily", rating: "★ 4.8 · 96", badge: "Small, daily", badgeTone: "soft" },
    { mediaLabel: "Digital #20", peek: "by morning", rating: "★ 4.6 · 87", badge: "Within the hour →", badgeTone: "soft" },
  ],
  "digital-gifts": [
    { mediaLabel: "Digital #19", peek: "five minutes", rating: "★ 4.6 · 87", badge: "≤ 5 minutes", badgeTone: "hot" },
    { mediaLabel: "Digital #20", peek: "human-reviewed", rating: "★ 4.7 · 64", badge: "Always human-checked", badgeTone: "soft" },
    { mediaLabel: "Digital #21", peek: "two phones", rating: "★ 4.6 · 49", badge: "Two lock screens", badgeTone: "soft" },
  ],
};

const categorySections: Record<string, CategorySection> = {
  "3d-figures": {
    kicker: "THE 3D FIGURINES",
    title: "A photograph you can",
    intro: "hold.",
    note: "A reference presentation for dimensional keepsakes. Current products, options, prices, and availability remain Catalog-authoritative.",
  },
  "custom-crafts": {
    kicker: "THE CUSTOM ART",
    title: "The pieces we",
    intro: "make.",
    note: "A reference presentation for framed and tactile work. The published catalog remains the only source for current product facts.",
  },
  "pet-memories": {
    kicker: "FOR THE ONES WHO WAITED",
    title: "Some goodbyes deserve",
    intro: "a place.",
    note: "A quiet reference presentation for pet memories. No customer testimonial or delivery claim is made here.",
  },
  "home-living": {
    kicker: "THE HOME & LIVING",
    title: "Made for the",
    intro: "middle of life.",
    note: "This reference composition is available when the authoritative catalog publishes a Home & Living category.",
  },
  "digital-gifts": {
    kicker: "THE DIGITAL STUDIO",
    title: "The",
    intro: "atelier.",
    note: "A reference presentation for digital products. The current catalog determines what is actually available.",
  },
};

const faqByCategory: Record<string, readonly [string, string][]> = {
  "3d-figures": [
    ["What should I send?", "The published product configuration shows the required inputs. Use the real customization fields and keep this editorial section as a visual guide only."],
    ["Can I choose a different version?", "Yes, when the catalog publishes more than one eligible variant. The Product Detail route owns the exact selection and price."],
  ],
  "custom-crafts": [
    ["How do I choose between the forms?", "Start with the published product details. This reference section does not infer a form from a name, price, or image."],
    ["Can I ask a question before configuring?", "Use the real Contact route for the current local preview boundary; this page does not submit messages."],
  ],
  "pet-memories": [
    ["Can I take my time?", "Yes. The local storefront keeps this presentation informational; it does not create an order or promise a production timeline."],
    ["Do you make memorials for other pets?", "The current catalog decides which published products are available. No product is added by this editorial copy."],
  ],
  "home-living": [
    ["Which photo fits a puzzle best?", "Open a published product to see its actual configuration requirements. The current catalog remains authoritative."],
    ["Where can I see the available products?", "Only products returned by the selected catalog source appear in the product grid."],
  ],
  "digital-gifts": [
    ["How many styles are shown?", "The style gallery is a reference presentation. It does not create or imply a digital product or delivery promise."],
    ["Is Digital Checkout enabled?", "No. The local preview does not implement Digital Checkout or Digital Delivery."],
  ],
};

function ReferenceSectionHeading({ kicker, title, subtitle }: { kicker: string; title: string; subtitle: string }) {
  return (
    <div className={styles.referenceCategoryHeading}>
      <ReferenceText>{kicker}</ReferenceText>
      <h2><ReferenceText>{title}</ReferenceText></h2>
      <p><ReferenceText>{subtitle}</ReferenceText></p>
    </div>
  );
}

function ReferenceFaq({ slug }: { slug: string }) {
  const [openIndex, setOpenIndex] = useState(0);
  const items = faqByCategory[slug] ?? [];
  return (
    <section className={styles.referenceFaq} aria-labelledby={`${slug}-faq-title`}>
      <ReferenceSectionHeading kicker="Before You Ask" title="Before You Ask" subtitle="questions kept close to the counter" />
      <div className={styles.referenceFaqList}>
        {items.map(([question, answer], index) => {
          const open = index === openIndex;
          return (
            <div className={styles.referenceFaqItem} key={question}>
              <button type="button" aria-expanded={open} aria-controls={`${slug}-faq-${index}`} onClick={() => setOpenIndex(open ? -1 : index)}>
                <span><ReferenceText>{question}</ReferenceText></span><span aria-hidden="true" className={styles.referenceFaqPlus}>+</span>
              </button>
              <div className={styles.referenceFaqAnswer} id={`${slug}-faq-${index}`} hidden={!open}><ReferenceText>{answer}</ReferenceText></div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ReferenceProcess({ slug }: { slug: string }) {
  const steps = slug === "digital-gifts"
    ? [["01", "Choose a style", "Select an eligible published product and its real configuration."], ["02", "Share a reference", "Use only the current product's authoritative input boundary."], ["03", "Review the boundary", "The local preview keeps digital delivery explicitly deferred."]]
    : slug === "pet-memories"
      ? [["01", "Choose a starting point", "Begin from a published product in the current catalog."], ["02", "Make it yours", "Use the real customization flow without adding customer claims here."], ["03", "Keep the story close", "This presentation remains a reference layer, not an order promise."]]
      : [["01", "Send a photograph", "Start from the actual configuration fields exposed by the product."], ["02", "Shape the piece", "The editorial composition keeps the maker's hand visible without inventing operations."], ["03", "Review the result", "Continue through the existing product and checkout boundaries only."]];
  return (
    <section className={styles.referenceSteps} aria-labelledby={`${slug}-steps-title`}>
      <ReferenceSectionHeading kicker="The method" title={slug === "3d-figures" ? "From Photograph to Sculpture" : slug === "digital-gifts" ? "How One Hour Works" : "How a Memory Is Made"} subtitle="a reference sequence, not a production promise" />
      <div className={styles.referenceStepGrid}>
        {steps.map(([number, title, copy]) => <article key={number}><span>{number}</span><h3><ReferenceText>{title}</ReferenceText></h3><p><ReferenceText>{copy}</ReferenceText></p></article>)}
      </div>
    </section>
  );
}

function ReferenceSpecTable({ slug }: { slug: string }) {
  const rows = slug === "3d-figures"
    ? [["Form", "Current published variant"], ["Configuration", "Exact product fields"], ["Availability", "Catalog source"], ["Notes", "Reference presentation only"]]
    : slug === "home-living"
      ? [["Room", "Current published product"], ["Format", "Exact product fields"], ["Options", "Catalog-authoritative"], ["Notes", "Reference presentation only"]]
      : [["Medium", "Current published product"], ["Format", "Exact product fields"], ["Options", "Catalog-authoritative"], ["Notes", "Reference presentation only"]];
  const { t } = useReferenceLanguage();
  return <div className={styles.referenceSpecTable} role="table" aria-label={t("Reference product notes")}>{rows.map(([label, value]) => <div className={styles.referenceSpecRow} role="row" key={label}><strong role="cell"><ReferenceText>{label}</ReferenceText></strong><span role="cell"><ReferenceText>{value}</ReferenceText></span></div>)}</div>;
}

function ReferenceStyleGallery() {
  const stylesList = ["Pixar-style 3D", "Anime", "Chibi", "Line Sketch", "Classic Oil", "Watercolor", "Pencil Portrait", "Pencil Sketch Couple", "Soft Illustration", "Minimal Line Art"];
  return <div className={styles.referenceStyleGrid}>{stylesList.map((style, index) => <article className={styles.referenceStyleCard} key={style}><span>#{19 + Math.floor(index / 4)}</span><div aria-hidden="true" style={{ background: `linear-gradient(135deg, hsl(${24 + index * 13} 48% 78%), hsl(${8 + index * 11} 42% 63%))` }}>{index % 2 === 0 ? "✦" : "⌁"}</div><h3><ReferenceText>{style}</ReferenceText></h3><p><ReferenceText>Reference style card</ReferenceText></p></article>)}</div>;
}

function ReferenceCrossSell({ slug }: { slug: string }) {
  const target = slug === "pet-memories" ? "/journal" : slug === "digital-gifts" ? "/shop" : "/about";
  return <section className={styles.referenceCrossSell}><ReferenceText>Across the collections</ReferenceText><h2><ReferenceText>Keep looking until the shape feels right.</ReferenceText></h2><Link href={target}><ReferenceText>Continue exploring →</ReferenceText></Link></section>;
}

export function ReferenceCategoryComposition({ slug, category, products }: { slug: string; category: Category; products: readonly PublicCatalogProductSummary[] }) {
  const { t } = useReferenceLanguage();
  if (slug === "3d-figures") return <FigurineReferencePage category={category} products={products} />;
  if (slug === "custom-crafts") return <CustomArtReferencePage category={category} products={products} />;
  if (slug === "pet-memories") return <PetMemorialReferencePage category={category} products={products} />;
  if (slug === "digital-gifts") return <DigitalReferencePage category={category} products={products} />;

  const section = categorySections[slug] ?? categorySections["3d-figures"];
  const productLabel = products.length === 1 ? "published keepsake" : "published keepsakes";

  return (
    <div className={styles.referenceCategoryPage}>
      <header className={styles.referenceCategoryMasthead}>
        <p><ReferenceText>VOL. I · AUGUST 2026 · REFERENCE COLLECTION</ReferenceText></p>
        <h1><ReferenceText>{section.kicker}</ReferenceText></h1>
        <p>{category.description}</p>
      </header>
      <section className={styles.referenceCategoryHero} aria-labelledby={`${slug}-hero-title`}>
        <div>
          <p className={styles.referenceCategoryKicker}><ReferenceText>{section.kicker}</ReferenceText></p>
          <h2 id={`${slug}-hero-title`}><ReferenceText>{section.title}</ReferenceText><br /><em><ReferenceText>{section.intro}</ReferenceText></em></h2>
          <p><ReferenceText>{section.note}</ReferenceText></p>
          <div className={styles.referenceCategoryStats}><span>{products.length} <ReferenceText>{productLabel}</ReferenceText></span><span>◆</span><span>{t("Catalog source")}</span></div>
          <a className={styles.referenceButton} href="#reference-products"><ReferenceText>Browse the collection ↓</ReferenceText></a>
        </div>
        <div className={styles.referenceCategoryVisual} role="img" aria-label={`${category.name} ${t("editorial preview")}`}><span>{category.name} · 4:5</span><small><ReferenceText>Reference preview</ReferenceText></small></div>
      </section>
      <section className={`${styles.referenceCategoryProducts} ${slug === "digital-gifts" ? styles.referenceDigitalProducts : ""}`} id="reference-products" aria-labelledby={`${slug}-products-title`}>
        <ReferenceSectionHeading kicker={slug === "pet-memories" ? "The Memorials" : slug === "digital-gifts" ? "The Three Portraits" : slug === "custom-crafts" ? "The Six Forms" : slug === "home-living" ? "The Collection" : "The Five Figurines"} title={slug === "pet-memories" ? "The Memorials" : slug === "digital-gifts" ? "The Three Portraits" : slug === "custom-crafts" ? "The Six Forms" : slug === "home-living" ? "The Collection" : "The Five Figurines"} subtitle={`${products.length} ${t(productLabel)} ${t("from the selected catalog source")}`} />
        <CatalogProductGrid items={products} />
      </section>
      {slug === "digital-gifts" && <section className={styles.referenceStyles} aria-labelledby="digital-styles-title"><ReferenceSectionHeading kicker="Styles" title="Ten Styles" subtitle="pick one, or collect the set" /><ReferenceStyleGallery /></section>}
      <ReferenceProcess slug={slug} />
      <section className={styles.referenceFinePrint} aria-labelledby={`${slug}-fine-print-title`}>
        <ReferenceSectionHeading kicker="The Fine Print" title={slug === "home-living" ? "Choosing a Puzzle" : "The Fine Print"} subtitle="what this local reference can safely say" />
        <ReferenceSpecTable slug={slug} />
      </section>
      {slug === "pet-memories" && <section className={styles.referenceLetters}><ReferenceSectionHeading kicker="Letters We Kept" title="Letters We Kept" subtitle="editorial wall — not customer testimonials" /><div className={styles.referenceLetterGrid}><article><ReferenceText>Reference note · a memory can have a place.</ReferenceText></article><article><ReferenceText>Reference note · details remain Catalog-authoritative.</ReferenceText></article><article><ReferenceText>Reference note · no customer identity is asserted.</ReferenceText></article></div></section>}
      <ReferenceCrossSell slug={slug} />
      <ReferenceFaq slug={slug} />
    </div>
  );
}

type ExactWorkflowStep = readonly [number: string, icon: string, title: string, copy: string, note: string];

function ExactWorkflowSteps({ items }: { items: readonly ExactWorkflowStep[] }) {
  return <div className={styles.referenceExactSteps}>{items.map(([number, icon, title, copy, note]) => <article key={number}><span>{icon}</span><small><ReferenceText>{number}</ReferenceText></small><h3><ReferenceText>{title}</ReferenceText></h3><p><ReferenceText>{copy}</ReferenceText></p><b className={styles.referenceExactStepNote}><ReferenceText>{note}</ReferenceText></b></article>)}</div>;
}

function ExactStyleGallery() {
  const items = [
    ["#19", "✦", "Pixar-style 3D", "rounded, warm, cinematic light"],
    ["#19", "▣", "Anime", "clean lines, expressive eyes"],
    ["#19", "●", "Chibi", "small, round, delighted"],
    ["#19", "✎", "Line Sketch", "one careful line at a time"],
    ["#20", "▧", "Classic Oil", "brushstrokes you can feel"],
    ["#20", "⌁", "Watercolor", "soft edges, gentle bleed"],
    ["#20", "✐", "Pencil Portrait", "graphite, quietly serious"],
    ["#21", "♥", "Pencil Sketch Couple", "two of you, hatched"],
    ["#21", "◆", "Soft Illustration", "pastel, storybook-warm"],
    ["#21", "⌂", "Minimal Line Art", "one line, no apologies"],
  ] as const;
  return <div className={styles.referenceExactStyleGrid}>{items.map(([sku, icon, name, description], index) => <article key={name} style={{ transform: `rotate(${index % 3 === 0 ? -1.2 : index % 3 === 1 ? 1 : -.6}deg)` }}><span>{sku}</span><div aria-hidden="true" style={{ background: `linear-gradient(135deg, hsl(${24 + index * 13} 48% 78%), hsl(${8 + index * 11} 42% 63%))` }}>{icon}</div><h3><ReferenceText>{name}</ReferenceText></h3><p><ReferenceText>{description}</ReferenceText></p></article>)}</div>;
}

function FigurineReferencePage({ category, products }: { category: Category; products: readonly PublicCatalogProductSummary[] }) {
  return (
    <div className={styles.referenceExactPage}>
      <ExactCategoryMasthead collection="Collection No. 01–05" title={<ReferenceText>THE 3D FIGURINES</ReferenceText>} subtitle="photographs, lifted off the page and handed back to you" meta={["five sculptures", "hand-painted", "signed underneath"]} />
      <section className={styles.referenceExactHero}>
        <div>
          <span className={styles.referenceExactTape}><ReferenceText>📚 the collection</ReferenceText></span>
          <h2><ReferenceText>A photograph you can</ReferenceText> <em><ReferenceText>hold</ReferenceText></em></h2>
          <p><ReferenceText>Send three photos. A modeler studies them, a printer builds them layer by layer, a painter gives them their face back — down to the freckles, the scar, the one ear that always flopped. Then it sits on your desk, quietly being them.</ReferenceText></p>
          <ExactCategoryStats values={[["3", "photos to begin"], ["72", "hours of craft"], ["25 days", "door to door"]]} />
          <div className={styles.referenceExactActions}><a className={styles.referenceExactButton} href="#fig-grid"><ReferenceText>Choose your figurine ↓</ReferenceText></a><Link className={`${styles.referenceExactButton} ${styles.referenceExactButtonGhost}`} href="/about"><ReferenceText>How it works</ReferenceText></Link></div>
          <p className={styles.referenceExactNote}><ReferenceText>↬ the hard part is choosing the photo — we can help with that too</ReferenceText></p>
        </div>
        <ExactCategoryVisual variant="figures" labels={[["Figurine close-up · 4:5", "painting the freckles in"], ["Workshop shelf · 4:5", "the morning shelf"]]} />
      </section>
      <ExactCategorySection title="The Five Figurines" subtitle="one for every kind of person you love"><ExactProductSlots slug="3d-figures" products={products} expectedCount={6} id="fig-grid" /></ExactCategorySection>
      <ExactCategorySection title="From Photograph to Sculpture" subtitle="seventy-two honest hours, four steps"><ExactWorkflowSteps items={[
        ["no. 1", "▣", "You send three photos", "Front-facing, 45° side, and the one where they laugh. Blurry is fine; laughing matters more.", "takes about 2 minutes"],
        ["no. 2", "▱", "We sculpt in 3D", "A modeler who has read your note builds the digital sculpture by hand. No template, no face library.", "about a day"],
        ["no. 3", "⚙", "Printed, layer by layer", "Full-color composite, 0.04 mm at a time — the way a snail would build, if a snail were precise.", "about 30 hours"],
        ["no. 4", "✎", "Painted & signed", "The artisan hand-paints the details machines miss, then signs the base. Yours from here on.", "72 hours in all"],
      ]} /><p className={styles.referenceExactInlineNote}><ReferenceText>…then 15–25 days of honest post, with preview photographs before it ships — always.</ReferenceText></p></ExactCategorySection>
      <ExactCategorySection title="The Fine Print" subtitle="everything we tell people at the counter"><div className={styles.referenceExactTableWrap}><table className={styles.referenceExactTable}><thead><tr><th></th><th><ReferenceText>what it means for your order</ReferenceText></th></tr></thead><tbody>{[
        ["photos needed", "three is ideal — one front, one at 45°, one candid where the person isn't posing"],
        ["materials", "full-color composite polymer, hand-finished; walnut or beech base included"],
        ["heights", "keychain 6 cm · figurine 12–18 cm · bobblehead 15 cm · family set up to 22 cm"],
        ["engraving", "name and date on the base, engraved free of charge"],
        ["craft time", "72 hours, one artisan per piece, start to signature"],
        ["door to door", "15–25 days worldwide, preview photographs before anything ships"],
        ["care", "keep off summer dashboards and out of dishwashers; a soft brush rides in every box"],
      ].map(([label, value]) => <tr key={label}><td><ReferenceText>{label}</ReferenceText></td><td><ReferenceText>{value}</ReferenceText></td></tr>)}</tbody></table></div></ExactCategorySection>
      <section className={styles.referenceExactCross}><span aria-hidden="true">◴</span><div><h3><ReferenceText>In a hurry for a birthday?</ReferenceText></h3><p><ReferenceText>The Digital Studio turns the same photo into a cartoon or painted portrait within the hour — a keepsake for tonight, while the figurine follows by post.</ReferenceText></p></div><Link className={styles.referenceExactButton} href="/category/digital-gifts"><ReferenceText>Visit the Digital Studio →</ReferenceText></Link></section>
      <ExactCategoryFaq heading="Before You Ask" subtitle="figurine questions we hear at the counter" items={[
        ["What kind of photos work best?", "Three is ideal: one front-facing, one at 45°, and one candid. The candid one is where the likeness lives — the slightly blurry photo of someone mid-laugh beats the perfect posed one, every single time."],
        ["How close will the resemblance be?", "We chase the feeling of a face, not a police sketch. Freckles, moles, scars, glasses, the hat they always wear — all of it goes in. If your person has a crooked smile, your figurine inherits it."],
        ["Can I put two people — or a person and a pet — together?", "Yes. The Couple Figurine takes two portraits on one base, and pets appear beside, behind, or on the shoulder of their people. Mixed families of every configuration are welcome."],
        ["How do I keep it looking new?", "Keep it off the dashboard in summer and out of the dishwasher, and the colors stay put for decades. Dust it with the soft brush we tuck into every box — it takes ten seconds and feels oddly nice."],
      ]} />
      <span className={styles.referenceCategoryAuthorityNote}><ReferenceText>{category.name}</ReferenceText></span>
    </div>
  );
}

function DigitalReferencePage({ category, products }: { category: Category; products: readonly PublicCatalogProductSummary[] }) {
  return (
    <div className={styles.referenceExactPage}>
      <ExactCategoryMasthead collection="Collection No. 19–21" title={<ReferenceText>THE DIGITAL STUDIO</ReferenceText>} subtitle="gifts that cannot wait until tomorrow" meta={["ten styles", "in your inbox", "usually within the hour"]} />
      <section className={styles.referenceExactHero}>
        <div>
          <span className={`${styles.referenceExactTape} ${styles.referenceExactTapeDigital}`}><ReferenceText>the fast lane</ReferenceText></span>
          <h2><ReferenceText>The</ReferenceText> <em><ReferenceText>one-hour</ReferenceText></em> <ReferenceText>atelier</ReferenceText></h2>
          <p><ReferenceText>Remembered a birthday at midnight? The Digital Studio turns a photograph into a cartoon, an oil portrait or a couple&apos;s illustration, in your inbox within the hour. AI drafts at speed; a human being checks every face before anything is sent. Fast, but never careless.</ReferenceText></p>
          <ExactCategoryStats values={[["10", "styles"], ["60", "minutes or less"], ["$9.9", "from only"]]} />
          <div className={styles.referenceExactActions}><a className={styles.referenceExactButton} href="#digital-grid"><ReferenceText>Pick your portrait ↓</ReferenceText></a><Link className={`${styles.referenceExactButton} ${styles.referenceExactButtonGhost}`} href="/category/custom-crafts"><ReferenceText>Prefer the canvas →</ReferenceText></Link></div>
          <p className={styles.referenceExactNote}><ReferenceText>↬ upload tonight, framed by the weekend</ReferenceText></p>
        </div>
        <ExactCategoryVisual variant="digital" labels={[["Inbox, 11:47 pm · 4:5", "delivered before the cake"], ["4K on matte paper · 4:5", "printed at home, 300 gsm"]]} />
      </section>
      <ExactCategorySection title="The Three Portraits" subtitle="from a photograph, to your inbox"><ExactProductSlots slug="digital-gifts" products={products} expectedCount={3} id="digital-grid" /></ExactCategorySection>
      <ExactCategorySection title="Ten Styles" subtitle="pick one, or collect the set"><ExactStyleGallery /></ExactCategorySection>
      <ExactCategorySection title="How One Hour Works" subtitle="three steps, zero small talk"><ExactWorkflowSteps items={[
        ["no. 1", "▣", "Upload 2–4 photos", "Clear and front-facing, natural light, no sunglasses. Smile or not — the face comes either way.", "takes 2 minutes"],
        ["no. 2", "⚙", "We draft, a human checks", "AI paints fast; a person studies every face for likeness before release. Painted portraits are checked one by one, always.", "minutes, not days"],
        ["no. 3", "✉", "Check your inbox", "A 4K, print-ready JPEG with a download link. Yours to print, frame, gift and keep, forever.", "within the hour"],
      ]} /></ExactCategorySection>
      <section className={styles.referenceExactQuiet}><h2><ReferenceText>Right face, or we redraw it.</ReferenceText></h2><p><ReferenceText>Likeness is the whole product, so it carries the strongest promise we make: cartoon and wallpaper portraits include three free redraws, painted portraits two — and if the face still isn&apos;t the face, the order is refunded without a form letter.</ReferenceText></p><span><ReferenceText>— the studio&apos;s one strict rule</ReferenceText></span></section>
      <section className={styles.referenceExactCross}><span aria-hidden="true">▧</span><div><h3><ReferenceText>Loved the digital study?</ReferenceText></h3><p><ReferenceText>Let the atelier paint it properly — a hand-painted canvas portrait or carved wood art, begun from the exact pose you chose. The slow version of the thing you already like.</ReferenceText></p></div><Link className={styles.referenceExactButton} href="/category/custom-crafts"><ReferenceText>Commission the canvas →</ReferenceText></Link></section>
      <ExactCategoryFaq heading="Before You Ask" subtitle="the fast lane, explained slowly" items={[
        ["What photos work best?", "Two to four clear, front-facing photos in natural light, no sunglasses. You can smile or not — the face comes either way; the smile comes through on its own."],
        ["How close is the likeness?", "The first rule of the studio: the face, the expression and the small crooked details are preserved. Race, age and features are never altered. If the likeness misses, we redraw; if it still misses, we refund."],
        ["Can I print it myself?", "Yes — a 4K JPEG, yours forever, at print-ready resolution. We suggest 300 gsm matte paper and a frame you already own; it photographs better than it has any right to."],
        ["Is it really checked by a person?", "Painted portraits are reviewed one by one before sending — always. Cartoon and wallpaper orders are automated with spot checks, and anything a checker doesn't recognize as the same face is redrawn before you ever see it."],
        ["How fast is ‘within the hour’?", "Cartoon portraits leave within about five minutes, couple illustrations in five to fifteen, painted portraits inside the hour because a person studies each one. Midnight birthdays are our favorite kind of chaos."],
      ]} />
      <span className={styles.referenceCategoryAuthorityNote}><ReferenceText>{category.name}</ReferenceText></span>
    </div>
  );
}

type ExactFaqItem = readonly [question: string, answer: string];

function ExactCategoryMasthead({ collection = "Across the collections", title, subtitle, meta }: { collection?: string; title: ReactNode; subtitle: string; meta: readonly string[] }) {
  return (
    <header className={styles.referenceExactMasthead}>
      <p><ReferenceText>{`Vol. I · August 2026 · ${collection}`}</ReferenceText></p>
      <h1>{title}</h1>
      <div className={styles.referenceExactMastheadSubtitle}><ReferenceText>{subtitle}</ReferenceText></div>
      <div className={styles.referenceExactMastheadMeta}>{meta.map((item) => <span key={item}><ReferenceText>{item}</ReferenceText></span>)}</div>
    </header>
  );
}

function ExactCategoryStats({ values }: { values: readonly [string, string][] }) {
  return <div className={styles.referenceExactStats}>{values.map(([value, label]) => <div key={label}><strong><ReferenceText>{value}</ReferenceText></strong><span><ReferenceText>{label}</ReferenceText></span></div>)}</div>;
}

function ExactCategoryVisual({ labels, single = false, variant = "figures" }: { labels: readonly [string, string][]; single?: boolean; variant?: "figures" | "art" | "pet" | "digital" }) {
  const sticker = variant === "figures" ? "⚙" : variant === "art" ? "✎" : variant === "pet" ? "❤" : "✉";
  return (
    <div className={`${styles.referenceExactHeroVisual} ${styles[`referenceExactHeroVisual${variant[0].toUpperCase()}${variant.slice(1)}`]} ${single ? styles.referenceExactHeroVisualSingle : ""}`}>
      {labels.map(([label, caption], index) => <div className={`${styles.referenceExactPolaroid} ${index === 1 ? styles.referenceExactPolaroidSmall : ""}`} key={label}><span>{label}</span><p><ReferenceText>{caption}</ReferenceText></p>{index === 1 && !single && <span className={styles.referenceExactHeroPin} aria-hidden="true">📌</span>}</div>)}
      <span className={styles.referenceExactHeroSticker} aria-hidden="true">{sticker}</span>
    </div>
  );
}

function ExactProductSlots({ slug, products, expectedCount, id }: { slug: string; products: readonly PublicCatalogProductSummary[]; expectedCount: number; id: string }) {
  const visible = products.slice(0, expectedCount);
  const missing = Math.max(0, expectedCount - visible.length);
  return (
    <div className={styles.referenceExactProductGrid} id={id}>
      <CatalogProductGrid items={visible} shopPresentation={categoryCardPresentationBySlug[slug]?.slice(0, visible.length)} />
      {Array.from({ length: missing }, (_, index) => <div className={styles.referenceUnavailableProduct} key={`unavailable-${index}`} role="status"><span>✦</span><strong><ReferenceText>Reference slot unavailable</ReferenceText></strong><small><ReferenceText>No published product in the current catalog source.</ReferenceText></small></div>)}
    </div>
  );
}

function ExactCategorySection({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <section className={styles.referenceExactSection}><div className={styles.referenceExactRule}><h2><ReferenceText>{title}</ReferenceText></h2><p><ReferenceText>{subtitle}</ReferenceText></p></div>{children}</section>;
}

function ExactCategoryFaq({ heading, subtitle, items }: { heading: string; subtitle: string; items: readonly ExactFaqItem[] }) {
  const [openIndex, setOpenIndex] = useState(0);
  return (
    <section className={styles.referenceExactFaq}>
      <h2><ReferenceText>{heading}</ReferenceText></h2>
      <p><ReferenceText>{subtitle}</ReferenceText></p>
      <div className={styles.referenceExactAccordion}>
        {items.map(([question, answer], index) => <div key={question} className={styles.referenceExactAccordionItem}><button type="button" aria-expanded={openIndex === index} onClick={() => setOpenIndex(openIndex === index ? -1 : index)}><span><ReferenceText>{question}</ReferenceText></span><b aria-hidden="true">+</b></button><div hidden={openIndex !== index}><ReferenceText>{answer}</ReferenceText></div></div>)}
      </div>
    </section>
  );
}

function CustomArtReferencePage({ category, products }: { category: Category; products: readonly PublicCatalogProductSummary[] }) {
  return (
    <div className={styles.referenceExactPage}>
      <ExactCategoryMasthead collection="Collection No. 06–10 & 14" title={<ReferenceText>THE CUSTOM ART</ReferenceText>} subtitle="six ways to turn a photograph into something framed" meta={["six disciplines", "painted · carved · burned", "signed & numbered"]} />
      <section className={styles.referenceExactHero}>
        <div>
          <span className={`${styles.referenceExactTape} ${styles.referenceExactTapeArt}`}><ReferenceText>✎ slow art</ReferenceText></span>
          <h2><ReferenceText>The</ReferenceText> <em><ReferenceText>slowest</ReferenceText></em> <ReferenceText>pieces we make</ReferenceText></h2>
          <p><ReferenceText>Canvas portraits, a photograph carved into a single leaf, wood burned and sealed by hand. Each piece is begun and finished by one artist who signs the corner. The waiting list is the price of never rushing a face — and the signature is our promise it was never rushed.</ReferenceText></p>
          <ExactCategoryStats values={[["6", "disciplines"], ["1", "artist per piece"], ["100%", "signed & numbered"]]} />
          <div className={styles.referenceExactActions}><a className={styles.referenceExactButton} href="#art-grid"><ReferenceText>See the six forms ↓</ReferenceText></a><Link className={`${styles.referenceExactButton} ${styles.referenceExactButtonGhost}`} href="/category/pet-memories"><ReferenceText>Pet portraits live here →</ReferenceText></Link></div>
          <p className={styles.referenceExactNote}><ReferenceText>↬ the corner signature is real ink, we promise</ReferenceText></p>
        </div>
        <ExactCategoryVisual variant="art" labels={[["María at the easel · 4:5", "never rushes a face"], ["Leaf macro · 4:5", "one leaf, one photo"]]} />
      </section>
      <ExactCategorySection title="The Six Forms" subtitle="a different discipline for a different person"><ExactProductSlots slug="custom-crafts" products={products} expectedCount={6} id="art-grid" /></ExactCategorySection>
      <ExactCategorySection title="Which Art, for Whom" subtitle="a quiet guide to the six disciplines">
        <div className={styles.referenceExactTableWrap}><table className={styles.referenceExactTable}><thead><tr>{["form", "the feeling", "made for", "the wait"].map((head) => <th key={head}><ReferenceText>{head}</ReferenceText></th>)}</tr></thead><tbody>{[
          ["Portrait Painting", "museum-quiet, the kind you lower your voice near", "anniversaries, grandparents", "2 weeks"],
          ["Paint-by-Numbers", "you were there too — the last mile is yours", "a parent and a child, one weekend", "1 week"],
          ["Pet Portrait", "the face you know by heart", "a shelf, a wall, the spot by the door", "2 weeks"],
          ["Glass & Light", "glows when the lamp does", "nightstands, windowsills", "2–3 weeks"],
          ["Leaf Engraving", "impossibly delicate — and real", "the person who has everything", "1–2 weeks"],
          ["Wood Art", "warm, and permanent", "new homes, nurseries", "2 weeks"],
        ].map((row) => <tr key={row[0]}>{row.map((cell) => <td key={cell}><ReferenceText>{cell}</ReferenceText></td>)}</tr>)}</tbody></table></div>
      </ExactCategorySection>
      <section className={styles.referenceExactQuiet}><h2><ReferenceText>“A face takes as long as it takes.”</ReferenceText></h2><p><ReferenceText>María paints every portrait herself, from first sketch to corner signature. She will not be hurried, and after five years of painting other people&apos;s memories, her rule has survived every deadline we have ever shown her. The corner signature means she meant it.</ReferenceText></p><span><ReferenceText>— María, portrait artist, atelier no. 2</ReferenceText></span></section>
      <section className={styles.referenceExactCross}><span aria-hidden="true">▧</span><div><h3><ReferenceText>Commissioning a painted portrait?</ReferenceText></h3><p><ReferenceText>See the pose first. A digital oil study costs $9.9 and lands in your inbox within the hour — then show us the one you like, and María starts the canvas.</ReferenceText></p></div><Link className={styles.referenceExactButton} href="/category/digital-gifts"><ReferenceText>Try a digital study →</ReferenceText></Link></section>
      <ExactCategoryFaq heading="Before You Ask" subtitle="answers we give at the easel" items={[
        ["How do I choose between the six forms?", "Start with the person, not the art. For someone who has everything, the leaf — nothing to dust, impossible to duplicate. For a child's room, wood art; for a couple, the canvas. If you tell us the story, we will tell you the form; it costs nothing."],
        ["What photo should I send?", "One clear, well-lit photo is enough for most forms. Leaves and wood prefer simple backgrounds — every detail in the frame is a detail we carve, so a calm photo makes a calmer piece."],
        ["Is the leaf really one single leaf?", "One laurel leaf, carved by hand. The veins decide where the light passes through, which means no two engravings can ever match — rather the point. Framed between two panes of glass, front and back."],
        ["Does it arrive framed?", "Every piece arrives framed and ready to hang; the glass painting includes an LED base option for the shelf it will live on. The paint-by-numbers kit is the exception — you frame it after you have painted it, which is the whole idea."],
      ]} />
      <span className={styles.referenceCategoryAuthorityNote}><ReferenceText>{category.name}</ReferenceText></span>
    </div>
  );
}

function PetMemorialReferencePage({ category, products }: { category: Category; products: readonly PublicCatalogProductSummary[] }) {
  return (
    <div className={styles.referenceExactPage}>
      <ExactCategoryMasthead title={<><ReferenceText>FOR THE ONES WHO WAITED</ReferenceText><br /><ReferenceText>AT THE DOOR</ReferenceText></>} subtitle="pet memorials, made slowly and with great care" meta={["any breed", "any mix", "any number of years"]} />
      <section className={styles.referenceExactHero}>
        <div>
          <span className={`${styles.referenceExactTape} ${styles.referenceExactTapePet}`}><ReferenceText>with sympathy</ReferenceText></span>
          <h2><ReferenceText>Some goodbyes deserve</ReferenceText><br /><ReferenceText>something you can</ReferenceText> <em><ReferenceText>hold onto</ReferenceText></em></h2>
          <p><ReferenceText>Fourteen years, or fourteen days — time never measured how much they mattered. We make memorials you can touch: a figurine for the shelf where they slept, a portrait for the wall you pass, a magnet for the door they waited behind. Take all the time you need; we keep every photo on file, indefinitely.</ReferenceText></p>
          <div className={styles.referenceExactActions}><a className={`${styles.referenceExactButton} ${styles.referenceExactButtonGhost}`} href="#pet-grid"><ReferenceText>See the memorials ↓</ReferenceText></a></div>
          <p className={styles.referenceExactNote}><ReferenceText>↬ no rush — orders can sit with us for weeks while you decide</ReferenceText></p>
        </div>
        <ExactCategoryVisual variant="pet" single labels={[["A very good dog · 4:5", "Biscuit, 2010–2025"]]} />
      </section>
      <ExactCategorySection title="The Memorials" subtitle="gathered from every drawer of the workshop"><ExactProductSlots slug="pet-memories" products={products} expectedCount={6} id="pet-grid" /></ExactCategorySection>
      <ExactCategorySection title="For the Shelf, the Wall, the Hands" subtitle="three ways to keep a memory close"><div className={styles.referenceExactSteps}>{[
        ["for the shelf", "▥", "A figurine where they slept", "The spot by the window, the corner of the desk. Full-color, any breed or mix — the crooked ear goes in."],
        ["for the wall", "▧", "A portrait at eye level", "Painted by hand, signed in the corner. The first thing you see when you come home — and the last, when you leave."],
        ["for the hands", "▦", "A puzzle, for the hard evenings", "Grief needs something for the hands to do. Three hundred pieces, one evening at a time, until the face is whole again."],
      ].map(([label, icon, title, copy]) => <article key={label}><span>{icon}</span><small><ReferenceText>{label}</ReferenceText></small><h3><ReferenceText>{title}</ReferenceText></h3><p><ReferenceText>{copy}</ReferenceText></p></article>)}</div></ExactCategorySection>
      <ExactCategorySection title="Letters We Kept" subtitle="from people who wrote to us after"><div className={styles.referenceExactTestimonials}>{[
        ["He sits where he always sat. Some mornings I still say good morning.", "— Dana R. · three months in"],
        ["The portrait hangs by the door. Now leaving takes a little longer — in a good way.", "— Miguel S. · Madrid"],
        ["I put the magnet at eye level. The coffee tastes the same. That helps more than it should.", "— Ren & Toast · 2010–2025"],
      ].map(([quote, meta]) => <article key={quote}><p><ReferenceText>{quote}</ReferenceText></p><small><ReferenceText>{meta}</ReferenceText></small></article>)}</div></ExactCategorySection>
      <section className={styles.referenceExactQuiet}><h2><ReferenceText>There is no clock on this.</ReferenceText></h2><p><ReferenceText>Some people order a week after; some write to us a year later, apologizing for the delay. There is nothing to apologize for. Your photos stay on file as long as you need them to, and when you are ready — or if you only want to ask what is possible — the kettle is on.</ReferenceText></p><a href="/contact"><ReferenceText>write to us, any time ↬</ReferenceText></a></section>
      <ExactCategoryFaq heading="Gently Asked" subtitle="questions people ask quietly" items={[
        ["I only have one blurry photo. Is that enough?", "Yes — many of our favorite memorials began with one blurry photo taken on a tired evening. Send it before you order; we will tell you honestly what it can become, and it costs nothing to ask."],
        ["Can you match his exact markings?", "Coat patterns, the white sock, the smudge on one side of the nose — painted stroke by stroke from your photos. Mixed breeds, one ear up and one ear down, welcome exactly as they are."],
        ["How long should I wait after a loss?", "There is no right answer, and we have heard them all — the same day, the first month, the third anniversary. Order when it feels possible; we will keep the pace you set, and the photos will wait with us for as long as they need to."],
        ["Can you add a name and dates?", "Engraving on the figurine base is included, and portraits carry a hand-written name in the corner of the canvas. The date is yours to choose — or to leave off entirely; some people prefer just the name, and that is a perfectly good answer."],
        ["Do you make memorials for pets besides cats and dogs?", "Rabbits, horses, parrots, hamsters, one very dignified tortoise. And once, a python — we don't ask."],
      ]} />
      <span className={styles.referenceCategoryAuthorityNote}><ReferenceText>{category.name}</ReferenceText></span>
    </div>
  );
}
