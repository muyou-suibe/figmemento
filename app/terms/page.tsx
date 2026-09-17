import { InfoPage, Section } from "../info-page";
import { brandName } from "../config/identity.ts";
import { getSupportContactTextFromAuthority } from "../server/support-contact.server";
import { ReferenceText } from "../storefront/ReferenceLanguageProvider";

export const metadata = { title: `Terms of Service — ${brandName}`, description: `Terms for using ${brandName} and ordering personalized keepsakes.` };

export default async function TermsPage() {
  const supportContactText = await getSupportContactTextFromAuthority();
  return <InfoPage eyebrow={brandName} title="Terms of service" intro="These MVP terms describe the basic conditions for using the store and ordering personalized products."><Section title="Orders and payment"><p><ReferenceText>Orders are accepted subject to product availability and successful payment authorization. Prices, shipping fees, and applicable taxes are shown during checkout. An order is not confirmed until payment is completed.</ReferenceText></p></Section><Section title="Customer content"><p><ReferenceText>You confirm that you have the right to upload the photos and instructions you provide, and that they do not infringe another person’s rights or contain unlawful content. We may reject content that cannot reasonably be fulfilled.</ReferenceText></p></Section><Section title="Personalized products"><p><ReferenceText>Personalized products may contain small variations because they are made from customer-provided photos and production processes. We review the submitted details before production where practical.</ReferenceText></p></Section><Section title="Acceptable use"><p><ReferenceText>Do not misuse the store, attempt unauthorized access, submit malicious files, or use the service to create unlawful or harmful content.</ReferenceText></p></Section><Section title="Contact"><p>{supportContactText}</p></Section></InfoPage>;
}
