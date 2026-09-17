import { InfoPage, Section } from "../info-page";
import { brandName } from "../config/identity.ts";
import { getSupportContactTextFromAuthority } from "../server/support-contact.server";
import { ReferenceText } from "../storefront/ReferenceLanguageProvider";

export const metadata = { title: `Shipping & Returns — ${brandName}`, description: `${brandName} shipping timelines, delivery details, cancellations, and returns.` };

export default async function ShippingReturnsPage() {
  const supportContactText = await getSupportContactTextFromAuthority();
  return <InfoPage eyebrow="Customer care" title="Shipping & returns" intro="We make each personalized piece to order, with care from photo review through delivery."><Section title="Processing time"><p><ReferenceText>Personalized physical gifts typically require 7–14 business days for production after payment and photo confirmation. Digital gifts are delivered to the email used at checkout when ready.</ReferenceText></p></Section><Section title="Shipping"><p><ReferenceText>Orders over $49 currently qualify for free standard shipping. Orders below $49 are charged a $7.99 standard shipping fee at checkout. Delivery estimates vary by destination and are confirmed before production.</ReferenceText></p></Section><Section title="Changes and cancellations"><p><ReferenceText>Contact us as soon as possible if you need to change an order. Because personalized products enter production quickly, changes or cancellations may not be possible after photo approval.</ReferenceText></p></Section><Section title="Returns and quality issues"><p><ReferenceText>If your order arrives damaged, incorrect, or materially different from the approved details, contact us within 7 days with your order number and photos. We will review the issue and arrange a replacement or another appropriate resolution.</ReferenceText></p></Section><Section title="Contact"><p>{supportContactText}</p></Section></InfoPage>;
}
