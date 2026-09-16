import Link from "next/link";
import { loadPublicShopPage } from "./application/catalog-pages";
import { createServerCatalogRepository } from "./infrastructure/catalog/server-catalog-repository";
import {
  CatalogPolaroid,
  CatalogProductGrid,
  type ReferencePolaroidPresentation,
  type ReferenceProductPresentation,
} from "./storefront/CatalogDiscovery";
import { CatalogShell, FixtureCatalogNotice } from "./storefront/CatalogShell";
import { FusionCountUp, FusionRevealSection } from "./storefront/FusionReveal";
import { ReferenceText } from "./storefront/ReferenceLanguageProvider";
import { NewsletterSignup } from "./storefront/NewsletterSignup";
import styles from "./storefront/catalog-storefront.module.css";

const HOME_HERO_POLAROIDS: readonly ReferencePolaroidPresentation[] = [
  { mediaLabel: "Artisan at work · 4:5", caption: "our workshop, 8:42 am" },
  { mediaLabel: "Couple figurine · 4:5", caption: "Ana & Luis, one year on" },
  { mediaLabel: "Pet memorial · 4:5", caption: "good boy, forever" },
];

const HOME_SELECTED_WORKS: readonly ReferenceProductPresentation[] = [
  {
    category: "3D Figurine",
    mediaLabel: "3D Figurine",
    peek: "pick me",
    name: "Mini-Me Keychain",
    description: "3D printed · hand-painted",
    price: "$39.9",
    rating: "★ 4.9 · 128 reviews",
    badge: "Bestseller",
  },
  {
    category: "Couple Figurine",
    mediaLabel: "Couple Figurine",
    peek: "for two",
    name: "Couple Figurine",
    description: "Dual portrait · wood base",
    price: "$69.9",
    rating: "★ 4.8 · 94 reviews",
    badge: "Anniversary",
  },
  {
    category: "Pet Memorial",
    mediaLabel: "Pet Memorial",
    peek: "good boy",
    name: "Pet Memorial Figurine",
    description: "Full-color · any breed",
    price: "$45.9",
    rating: "★ 4.9 · 203 reviews",
    badge: "Most loved",
  },
  {
    category: "Portrait Painting",
    mediaLabel: "Portrait Painting",
    peek: "on canvas",
    name: "Custom Portrait",
    description: "Hand-painted · museum grade",
    price: "$29.9",
    rating: "★ 4.7 · 67 reviews",
    badge: "New",
  },
];

export default async function HomePage() {
  // The shared CatalogBrowser remains the /shop and category interaction surface.
  const source = await createServerCatalogRepository();
  const catalog = source.status === "found"
    ? await loadPublicShopPage(source.value.repository)
    : source;

  return (
    <CatalogShell page="home-reference" categoryLinks={catalog.status === "found" ? catalog.value.categories : []}>
      <main id="main-content">
        <FusionRevealSection className={styles.fusionHomeHero}>
          <span className={`${styles.fusionHeroDecor} ${styles.fusionHeroDecorOne}`} aria-hidden="true">✧</span>
          <span className={`${styles.fusionHeroDecor} ${styles.fusionHeroDecorTwo}`} aria-hidden="true">✎</span>
          <span className={`${styles.fusionHeroDecor} ${styles.fusionHeroDecorThree}`} aria-hidden="true">✍</span>
          <div className={styles.fusionHeroCopy}>
            <span className={styles.fusionHeroReferenceTape}><ReferenceText>Handmade with love</ReferenceText></span>
            <h1 className={styles.fusionHeroTitle}>
              <ReferenceText>Every gift has an</ReferenceText>{" "}
              <em><ReferenceText>unforgettable</ReferenceText></em>{" "}
              <ReferenceText>shape of its own</ReferenceText>
            </h1>
            <p className={styles.fusionHeroIntro}>
              <ReferenceText>We turn your photographs into heirloom keepsakes — patiently, one at a time, by artisans who care about the little details that make a memory yours.</ReferenceText>
            </p>
            <div className={styles.fusionHeroActions}>
              <Link className={styles.fusionHeroPrimary} href="/shop"><ReferenceText>Explore the Collection →</ReferenceText></Link>
              <Link className={styles.fusionHeroSecondary} href="/about"><ReferenceText>How it works</ReferenceText></Link>
            </div>
            <div className={styles.fusionHeroNote}>
              <span>↬ <ReferenceText>start here, we&apos;ll hold your hand</ReferenceText></span>
            </div>
          </div>
            <div className={styles.fusionHeroPolaroids} role="group" aria-labelledby="home-selected-products-label">
              <span id="home-selected-products-label" className={styles.visuallyHidden}><ReferenceText>Selected catalog products</ReferenceText></span>
            <CatalogPolaroid item={catalog.status === "found" ? catalog.value.products[0] : undefined} position={1} presentation={HOME_HERO_POLAROIDS[0]} />
            <CatalogPolaroid item={catalog.status === "found" ? catalog.value.products[1] : undefined} position={2} presentation={HOME_HERO_POLAROIDS[1]} />
            <CatalogPolaroid item={catalog.status === "found" ? catalog.value.products[2] : undefined} position={3} presentation={HOME_HERO_POLAROIDS[2]} />
          </div>
          <span className={`${styles.fusionHeroSticker} ${styles.fusionHeroStickerOne}`} aria-hidden="true">❤</span>
          <span className={`${styles.fusionHeroSticker} ${styles.fusionHeroStickerTwo}`} aria-hidden="true">✨</span>
          <span className={`${styles.fusionHeroSticker} ${styles.fusionHeroStickerThree}`} aria-hidden="true">⚘</span>
        </FusionRevealSection>

        <section className={styles.fusionHomeCollection} id="collection">
          <FusionRevealSection className={styles.discoverySectionHeading}>
            <div>
                  <p className={styles.discoveryEyebrow}>📖 <ReferenceText>CURATED</ReferenceText></p>
              <h2><ReferenceText>Selected Works</ReferenceText></h2>
            </div>
            <p><ReferenceText>four pieces our workshop is quietly proud of</ReferenceText></p>
          </FusionRevealSection>
          {source.status === "found" && source.value.source === "fixture" && <FixtureCatalogNotice />}
          {catalog.status === "found" ? (
            <>
              <section className={styles.discoveryProductSection} aria-labelledby="home-selected-works-label">
                <span id="home-selected-works-label" className={styles.visuallyHidden}><ReferenceText>Selected catalog works</ReferenceText></span>
                <CatalogProductGrid items={catalog.value.products.slice(0, 4)} presentation={HOME_SELECTED_WORKS} />
              </section>
              <FusionRevealSection className={styles.fusionHomeStory} aria-labelledby="home-story-title">
                <div className={styles.fusionStoryVisual} aria-hidden="true">
                  <ReferenceText>Workshop · hands shaping clay</ReferenceText>
                  <div className={styles.fusionStoryTape}><span><ReferenceText>est. 2025</ReferenceText></span></div>
                </div>
                <div className={styles.fusionStoryCopy}>
                  <p className={styles.fusionStoryKicker}>◆ <ReferenceText>Our Philosophy</ReferenceText></p>
                  <h2 id="home-story-title"><ReferenceText>72 hours. One artisan. Your story.</ReferenceText></h2>
                  <p>
                    <ReferenceText>No assembly lines, no templates. Each piece is entrusted to a single maker from the moment your photo arrives until the final brushstroke — like a page torn from someone&apos;s scrapbook, a little imperfect and absolutely irreplaceable.</ReferenceText>
                  </p>
                  <div className={styles.fusionStoryStats} aria-labelledby="home-workshop-facts-label">
                    <span id="home-workshop-facts-label" className={styles.visuallyHidden}><ReferenceText>Workshop facts</ReferenceText></span>
                    <div><FusionCountUp value={72} /><span><ReferenceText>hours of craft</ReferenceText></span></div>
                    <div><FusionCountUp value={1} /><span><ReferenceText>maker per piece</ReferenceText></span></div>
                    <div><FusionCountUp value={50} suffix="+" /><span><ReferenceText>countries</ReferenceText></span></div>
                  </div>
                  <Link className={styles.fusionStoryLink} href="/about"><ReferenceText>Read our story →</ReferenceText></Link>
                </div>
              </FusionRevealSection>
              <FusionRevealSection className={styles.fusionHomeLetters} aria-labelledby="home-letters-title">
                <div className={styles.fusionHomeLettersHeading}>
                  <h2 id="home-letters-title"><ReferenceText>Letters We Kept</ReferenceText></h2>
                  <p><ReferenceText>from customers who became friends</ReferenceText></p>
                </div>
              </FusionRevealSection>
                <FusionRevealSection className={styles.fusionTestimonialGrid} delay="stagger" aria-labelledby="home-customer-letters-label">
                  <span id="home-customer-letters-label" className={styles.visuallyHidden}><ReferenceText>Letters from customers</ReferenceText></span>
                <article className={styles.fusionTestimonialCard} style={{ transform: "rotate(-1.4deg)" }}>
                  <span className={styles.fusionTestimonialPin} aria-hidden="true">📌</span>
                  <p className={styles.fusionTestimonialQuote}><ReferenceText>I cried when I opened the box. My dog passed away last year and now he sits on my desk every single day.</ReferenceText></p>
                  <p className={styles.fusionTestimonialMeta}>— Sarah K. · <strong><ReferenceText>verified buyer</ReferenceText></strong></p>
                </article>
                <article className={styles.fusionTestimonialCard} style={{ transform: "rotate(1.2deg)" }}>
                  <p className={styles.fusionTestimonialQuote}><ReferenceText>It&apos;s like someone took my memory and made it something I can hold in my hands. The little details are everything.</ReferenceText></p>
                  <p className={styles.fusionTestimonialMeta}>— Marta G. · <strong><ReferenceText>Madrid</ReferenceText></strong></p>
                </article>
                <article className={styles.fusionTestimonialCard} style={{ transform: "rotate(-.8deg)" }}>
                  <span className={styles.fusionTestimonialPin} aria-hidden="true">📌</span>
                  <p className={styles.fusionTestimonialQuote}><ReferenceText>Ordered a couple figurine for our anniversary. They even painted the tiny scar on his chin. He didn&apos;t notice it at first — then he did, and went quiet.</ReferenceText></p>
                  <p className={styles.fusionTestimonialMeta}>— Wei &amp; Tom · <strong><ReferenceText>Vancouver</ReferenceText></strong></p>
                </article>
              </FusionRevealSection>
                <FusionRevealSection className={styles.fusionHomeTrust} aria-labelledby="home-customer-assurances-label">
                  <span id="home-customer-assurances-label" className={styles.visuallyHidden}><ReferenceText>Customer assurances</ReferenceText></span>
                <div className={styles.fusionTrustItem}>
                  <span className={styles.fusionTrustIcon} aria-hidden="true">🔒</span>
                  <div className={styles.fusionTrustLabel}><ReferenceText>Secure</ReferenceText></div>
                  <div className={styles.fusionTrustDetail}><ReferenceText>Stripe &amp; PayPal</ReferenceText></div>
                </div>
                <div className={styles.fusionTrustItem}>
                  <span className={styles.fusionTrustIcon} aria-hidden="true">🌐</span>
                  <div className={styles.fusionTrustLabel}><ReferenceText>Worldwide</ReferenceText></div>
                  <div className={styles.fusionTrustDetail}><ReferenceText>15–25 days</ReferenceText></div>
                </div>
                <div className={styles.fusionTrustItem}>
                  <span className={styles.fusionTrustIcon} aria-hidden="true">↩</span>
                  <div className={styles.fusionTrustLabel}><ReferenceText>Returns</ReferenceText></div>
                  <div className={styles.fusionTrustDetail}><ReferenceText>30 days, no fuss</ReferenceText></div>
                </div>
                <div className={styles.fusionTrustItem}>
                  <span className={styles.fusionTrustIcon} aria-hidden="true">✍</span>
                  <div className={styles.fusionTrustLabel}><ReferenceText>Preview first</ReferenceText></div>
                  <div className={styles.fusionTrustDetail}><ReferenceText>you approve</ReferenceText></div>
                </div>
              </FusionRevealSection>
              <FusionRevealSection className={styles.fusionHomeNewsletter} aria-labelledby="home-newsletter-title">
                <h2 id="home-newsletter-title"><ReferenceText>Join the atelier</ReferenceText></h2>
                <p><ReferenceText>handwritten updates from the workshop, once a week — and 10% off your first keepsake</ReferenceText></p>
                <NewsletterSignup />
              </FusionRevealSection>
            </>
          ) : (
            <div className={styles.discoveryEmpty} role="status">
              <p className={styles.discoveryEyebrow}><ReferenceText>A quiet corner</ReferenceText></p>
              <h2><ReferenceText>The collection is temporarily unavailable.</ReferenceText></h2>
              <p><ReferenceText>Please try again shortly. No sample products have been substituted.</ReferenceText></p>
              <Link className={styles.fusionHeroPrimary} href="/shop"><ReferenceText>Try the shop again</ReferenceText></Link>
            </div>
          )}
        </section>
      </main>
    </CatalogShell>
  );
}
