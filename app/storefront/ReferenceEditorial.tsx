"use client";

import Link from "next/link";
import { useState } from "react";
import { ReferenceText, useReferenceLanguage } from "./ReferenceLanguageProvider";
import { ContactMessageForm } from "./ContactMessageForm";
import { NewsletterSignup } from "./NewsletterSignup";
import styles from "./reference-editorial.module.css";

const journalCards = [
  ["GUIDES", "How to Choose the Right Photo for Your Keepsake", "Lighting, angles, and why the slightly blurry photo of your dad laughing beats the perfect posed one.", "GUIDE · 5 MIN"],
  ["CRAFT", "A Day at the Bench: 6 AM to Last Brushstroke", "Studio hours documented in notes, coffee stains and one very patient calico cat.", "CRAFT · 7 MIN"],
  ["STORY", "The Leaf That Traveled 8,000 Kilometers", "How one engraved leaf crossed an ocean to reach a grandmother who recognized the handwriting.", "STORY · 6 MIN"],
  ["NOTES", "What We Learned Shipping to 50 Countries", "Customs forms, monsoon season, and the address that simply said \"the blue door, ask for Poonam.\"", "NOTES · 8 MIN"],
  ["PEOPLE", "The Man Who Collects Rejection Letters", "He asked us to frame them. We asked why. The answer became our favorite commission of the year.", "STORY · 9 MIN"],
  ["CRAFT", "Why Our Clay Rests for Two Weeks Before We Touch It", "A short defense of slow materials, told by someone who has broken the rule and regretted it.", "CRAFT · 4 MIN"],
] as const;

const journalSidebar = [
  ["craft", "Why Pet Memorials Are Our Fastest-Growing Category", "A quiet story about grief, craft, and the shelf by the window."],
  ["craft", "Leaf Carving: The Ancient Art Making a Comeback", "From a Chinese tradition to a global keepsake, one vein at a time."],
  ["stories", "The Couple Who Ordered Nine Figurines", "What happens when a love story meets a workshop that keeps count."],
  ["people", "Behind the Brush: Meet María, Portrait Artist", "Five years of painting other people's memories, and her own rule: never rush a face."],
] as const;

export function EditorialEyebrow({ children }: { children: React.ReactNode }) {
  return <p className={styles.eyebrow}>{typeof children === "string" ? <ReferenceText>{children}</ReferenceText> : children}</p>;
}

type EditorialFaqProps = {
  items?: readonly (readonly [string, string])[];
  heading?: string;
  eyebrow?: string;
  subtitle?: string;
};

function EditorialFaq({ items = [
  ["Can I ask about a published product?", "Yes. Start from the current catalog or order route; this editorial page does not submit a message."],
  ["Does this preview send email?", "No. The form is intentionally disabled and does not create a contact record."],
] as const, heading = "Questions kept close.", eyebrow = "BEFORE YOU ASK", subtitle }: EditorialFaqProps) {
  const [open, setOpen] = useState(0);
  return <section className={styles.editorialFaq} aria-labelledby="editorial-faq-title">{eyebrow && <EditorialEyebrow>{eyebrow}</EditorialEyebrow>}<h2 id="editorial-faq-title"><ReferenceText>{heading}</ReferenceText></h2>{subtitle && <p className={styles.editorialFaqSubtitle}><ReferenceText>{subtitle}</ReferenceText></p>}{items.map(([question, answer], index) => <div className={styles.editorialFaqItem} key={question}><button type="button" aria-expanded={open === index} aria-controls={`editorial-faq-${index}`} onClick={() => setOpen(open === index ? -1 : index)}><span><ReferenceText>{question}</ReferenceText></span><span aria-hidden="true">+</span></button><div id={`editorial-faq-${index}`} hidden={open !== index}><ReferenceText>{answer}</ReferenceText></div></div>)}</section>;
}

const contactFaq = [
  ["How long does each piece take?", "About 72 hours of workshop time, and 15–25 days door to door with worldwide shipping. Digital portraits arrive within the hour. We would rather be slow and right than fast and sorry."],
  ["Can I see my piece before it ships?", "Always. Every physical order includes a preview — photographs of the finished piece from three angles. Nothing leaves the workshop until you say yes."],
  ["What if I don't love it?", "One free revision on every order — two on portraits — and a 30-day return window if it still isn't right. Around 2% of orders are redone; we keep that number on the wall to stay honest."],
  ["Do you ship to my country?", "We have shipped to more than 50 countries and counting. If your post office exists, we will find you — there is a story about a blue door somewhere in the Journal that proves it."],
  ["Can I order in Spanish?", "Sí. The whole shop, previews and support are available in Spanish — escríbenos y te atendemos como en casa. The workshop cat is bilingual by necessity."],
] as const;

const journalLeadCopy = "In an age of mass production, a small workshop is proving the human hand still matters. We followed one keychain through all 72 hours of its making — the scanning, the printing, the two rounds of paint, and the moment its owner's face appeared.";
const aboutMakerNote = "…and six more makers who prefer to stay behind the camera — you'll meet them in the Journal.";

export function JournalEditorial() {
  const { t } = useReferenceLanguage();
  return (
    <main className={styles.page} id="main-content">
      <header className={styles.journalMasthead}><EditorialEyebrow>VOL. I · NO. 34 · AUGUST 2026 · WEEKLY</EditorialEyebrow><h1><ReferenceText>THE WORKSHOP JOURNAL</ReferenceText></h1><p><ReferenceText>craft · commerce · story — notes pinned to the studio wall</ReferenceText></p></header>
      <section className={styles.journalLead} aria-labelledby="journal-lead-title"><div className={styles.journalLeadMain}><div className={`${styles.referenceImage} ${styles.workshopImage}`} role="img" aria-label={t("Workshop bench · shallow DOF")}><span><ReferenceText>Workshop bench · shallow DOF</ReferenceText></span></div><h2 id="journal-lead-title"><ReferenceText>How We Turn a Photograph Into a 3D Sculpture</ReferenceText></h2><p className={styles.byline}><ReferenceText>BY THE EDITORIAL DESK · AUGUST 26, 2026 · 8 MIN READ</ReferenceText></p><p className={styles.lede}><ReferenceText>{journalLeadCopy}</ReferenceText></p><Link className={styles.textLink} href="/shop"><ReferenceText>Continue reading →</ReferenceText></Link></div><aside className={styles.journalSidebar} aria-label={t("From the workshop")}><EditorialEyebrow>⚙ FROM THE WORKSHOP</EditorialEyebrow>{journalSidebar.map(([kind, title, copy]) => <article key={title}><span><ReferenceText>{kind}</ReferenceText></span><h3><ReferenceText>{title}</ReferenceText></h3><p><ReferenceText>{copy}</ReferenceText></p></article>)}</aside></section>
      <section className={styles.editorialSection} aria-labelledby="journal-more-title"><div className={styles.sectionRule}><EditorialEyebrow>PINNED THIS WEEK</EditorialEyebrow><h2 id="journal-more-title"><ReferenceText>More From the Journal</ReferenceText></h2></div><div className={styles.journalGrid}>{journalCards.map(([kind, title, copy, readTime]) => <article className={styles.journalCard} key={title}><div className={styles.referenceImage} role="img" aria-label={`${t(title)} ${t("editorial placeholder")}`}><span><ReferenceText>{kind}</ReferenceText> · 16:11</span></div><EditorialEyebrow>{kind}</EditorialEyebrow><h3><ReferenceText>{title}</ReferenceText></h3><p><ReferenceText>{copy}</ReferenceText></p><span className={styles.readTime}><ReferenceText>{readTime}</ReferenceText></span></article>)}</div></section>
      <EditorialDispatch mode="journal" />
    </main>
  );
}

export function AboutEditorial() {
  const { t } = useReferenceLanguage();
  return (
    <main className={styles.page} id="main-content">
      <section className={styles.aboutHero}><div className={`${styles.referenceImage} ${styles.aboutImage}`} role="img" aria-label={t("The workshop · golden hour")}><span><ReferenceText>The workshop · golden hour</ReferenceText></span></div><div><EditorialEyebrow>◆ SINCE 2025</EditorialEyebrow><h1><ReferenceText>A workshop that grew out of</ReferenceText> <em><ReferenceText>one keychain</ReferenceText></em></h1><p className={styles.lede}><ReferenceText>FigMemento began as a dorm-room experiment — one 3D printer, one photograph, and a keychain meant as a birthday gift. The recipient cried. Word traveled. Nine makers later, we still work the same way: one photograph, one artisan, no assembly line.</ReferenceText></p><p className={styles.lede}><ReferenceText>We believe a keepsake should feel like it was made by someone who knows your story — because it was. Every order is read, sculpted, painted and packed by a person who signs their work.</ReferenceText></p><Link className={styles.textLink} href="/contact"><ReferenceText>Come say hello →</ReferenceText></Link></div></section>
      <section className={styles.editorialSection} aria-labelledby="timeline-title"><div className={styles.sectionRule}><EditorialEyebrow>A SHORT HISTORY</EditorialEyebrow><h2 id="timeline-title"><ReferenceText>The Scrapbook Timeline</ReferenceText></h2></div><div className={styles.timeline}>{[["autumn '25", "The first keychain", "One printer, one gift, one happy cry at a birthday table."], ["winter '25", "The workshop grows", "Three friends join. We buy a second printer and a kettle."], ["spring '26", "Pet memorials", "Our most tender category begins with a dog named Biscuit."], ["summer '26", "50+ countries", "A leaf reaches a grandmother in Lima. She writes back."], ["next page…", "Your story", "The best pages are the ones we haven't made yet."]].map(([date, title, copy]) => <article key={date}><span><ReferenceText>{date}</ReferenceText></span><h3><ReferenceText>{title}</ReferenceText></h3><p><ReferenceText>{copy}</ReferenceText></p></article>)}</div></section>
      <section className={styles.aboutSteps} aria-labelledby="made-title"><EditorialEyebrow>THE METHOD</EditorialEyebrow><h2 id="made-title"><ReferenceText>How a Memory Is Made</ReferenceText></h2><div className={styles.stepGrid}>{[["01", "You send a photograph", "Any photo, any quality — our favorite ones are slightly out of focus. Add a note about what it means; we read every word."], ["02", "We sculpt & paint", "One artisan takes your piece from raw material to finished keepsake — 72 hours of honest, unhurried work with your name on the bench."], ["03", "You approve, we ship", "See photographs of the finished piece before it travels. Not happy? One free revision, and then another if we missed something."]].map(([number, title, copy]) => <article key={number}><span>{number}</span><h3><ReferenceText>{title}</ReferenceText></h3><p><ReferenceText>{copy}</ReferenceText></p></article>)}</div></section>
      <section className={styles.makers} aria-labelledby="makers-title"><div className={styles.sectionRule}><EditorialEyebrow>THE MAKERS</EditorialEyebrow><h2 id="makers-title"><ReferenceText>Nine hands, one bench.</ReferenceText></h2></div><div className={styles.makerGrid}>{[["Yu · portrait · 4:4.4", "Yu — keeps the kettle warm"], ["María · portrait · 4:4.4", "María — never rushes a face"], ["Wen · portrait · 4:4.4", "Wen — counts every leaf vein"]].map(([label, caption]) => <div className={styles.makerCard} key={label}><span><ReferenceText>{label}</ReferenceText></span><small><ReferenceText>{caption}</ReferenceText></small></div>)}</div><p className={styles.aboutMakerNote}><ReferenceText>{aboutMakerNote}</ReferenceText></p></section>
      <EditorialDispatch mode="about" />
    </main>
  );
}

export function ContactEditorial() {
  const { t } = useReferenceLanguage();
  return (
    <main className={`${styles.page} ${styles.contactReferencePage}`} id="main-content">
      <section className={styles.contactReferenceHeading}>
        <div className={styles.contactReferenceRule}>
          <h1><ReferenceText>Say Hello</ReferenceText></h1>
          <p><ReferenceText>a real person reads every message — usually within a day</ReferenceText></p>
        </div>
      </section>
      <section className={styles.contactReferenceGrid} aria-label={t("Contact message")}>
        <ContactMessageForm />
        <aside className={styles.contactReferenceSide}>
          <div className={styles.contactWaysCard}>
            <p className={styles.contactWaysLabel}><ReferenceText>⚙ Other ways in</ReferenceText></p>
            <div className={styles.contactWaysRow}><span aria-hidden="true">✉</span><div><strong>hello@figmemento.com</strong><p><ReferenceText>We reply within 24 hours, Monday to Saturday.</ReferenceText></p></div></div>
            <div className={styles.contactWaysRow}><span aria-hidden="true">☷</span><div><strong><ReferenceText>Instagram &amp; TikTok</ReferenceText></strong><p><ReferenceText>@figmemento — workshop videos and finished pieces daily.</ReferenceText></p></div></div>
            <div className={styles.contactWaysRow}><span aria-hidden="true">🐈</span><div><strong><ReferenceText>Escribimos en español</ReferenceText></strong><p><ReferenceText>Toda nuestra tienda está disponible en español — escríbenos como te sea más cómodo.</ReferenceText></p></div></div>
          </div>
          <div className={styles.contactReferencePolaroid} role="img" aria-label={t("The studio cat · 16:10")}>
            <div><ReferenceText>The studio cat · 16:10</ReferenceText></div>
            <p><ReferenceText>Biscuit II, head of quality control</ReferenceText></p>
          </div>
        </aside>
      </section>
      <EditorialFaq heading="Before You Ask" eyebrow="" subtitle="questions we hear at the counter, answered once and pinned here" items={contactFaq} />
    </main>
  );
}

function EditorialDispatch({ mode }: { mode: "journal" | "about" }) {
  const isAbout = mode === "about";
  const journalCopy = "one letter from the workshop, every Sunday morning — with the week's best customer story";
  return <section className={styles.dispatch} aria-labelledby="dispatch-title"><EditorialEyebrow><ReferenceText>{isAbout ? "Join the atelier" : "The Sunday Dispatch"}</ReferenceText></EditorialEyebrow><h2 id="dispatch-title"><ReferenceText>{isAbout ? "Join the atelier" : journalCopy}</ReferenceText></h2>{isAbout && <p><ReferenceText>handwritten updates from the workshop, once a week — and 10% off your first keepsake</ReferenceText></p>}{!isAbout && <p><ReferenceText>{journalCopy}</ReferenceText></p>}<NewsletterSignup /></section>;
}
