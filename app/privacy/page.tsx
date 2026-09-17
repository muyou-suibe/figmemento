import { InfoPage, Section } from "../info-page";
import { brandName } from "../config/identity.ts";
import { getSupportContactTextFromAuthority } from "../server/support-contact.server";
import { ReferenceText } from "../storefront/ReferenceLanguageProvider";

export const metadata = { title: `Privacy Policy — ${brandName}`, description: `How ${brandName} handles order information, uploaded photos, and customer privacy.` };

export default async function PrivacyPage() {
  const supportContactText = await getSupportContactTextFromAuthority();
  return <InfoPage eyebrow={brandName} title="Privacy policy" intro="This MVP draft explains the information we use to provide the store and fulfill personalized orders."><Section title="Information we collect"><p><ReferenceText>We collect the email address used for order updates, order and payment references, customization notes, and photos uploaded for personalization. Payment card details are handled by our payment provider and are not stored by FigMemento.</ReferenceText></p></Section><Section title="How we use information"><p><ReferenceText>We use this information to create orders, process payments, review personalization details, communicate about delivery, prevent abuse, and improve the service.</ReferenceText></p></Section><Section title="Photo storage"><p><ReferenceText>Uploaded photos are kept in private storage and are accessible only to authorized operations workflows through time-limited links. We do not sell customer photos or use them for unrelated advertising.</ReferenceText></p></Section><Section title="Service providers"><p><ReferenceText>We may use infrastructure, storage, payment, email, and fulfillment providers to operate the service. Each provider receives only the information needed for its function.</ReferenceText></p></Section><Section title="Your choices"><p>{supportContactText} <ReferenceText>Some records may need to be retained for legal, accounting, or fraud-prevention purposes.</ReferenceText></p></Section></InfoPage>;
}
