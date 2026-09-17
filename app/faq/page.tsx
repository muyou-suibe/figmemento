import { InfoPage, Section } from "../info-page";
import { brandName } from "../config/identity.ts";
import { getSupportContactTextFromAuthority } from "../server/support-contact.server";
import { ReferenceText } from "../storefront/ReferenceLanguageProvider";

export const metadata = { title: `FAQ — ${brandName}`, description: `Answers about ${brandName} personalized gifts, photos, production, delivery, and support.` };

export default async function FaqPage() {
  const supportContactText = await getSupportContactTextFromAuthority();
  return <InfoPage eyebrow="Need a hand?" title="Frequently asked questions" intro="A few helpful answers before you turn a favorite moment into a keepsake."><Section title="What kind of photo should I upload?"><p><ReferenceText>Use a clear, well-lit JPG, PNG, or WEBP image. We recommend a photo where the subject is visible and not heavily cropped.</ReferenceText></p></Section><Section title="Are my photos private?"><p><ReferenceText>Uploaded photos are stored in a private bucket and are not publicly listed. Production access uses temporary signed links. We only use the photo to review and fulfill the order.</ReferenceText></p></Section><Section title="Can I add special instructions?"><p><ReferenceText>Yes. Add details such as clothing colors, names, or small preferences in the customization note. We review the details before production.</ReferenceText></p></Section><Section title="When will I receive my order?"><p><ReferenceText>Physical products are made to order. Production and delivery timing depends on the product and destination; we will provide updates using your checkout email.</ReferenceText></p></Section><Section title="How do I contact you?"><p>{supportContactText} <ReferenceText>Please do not include payment card details in your message.</ReferenceText></p></Section></InfoPage>;
}
