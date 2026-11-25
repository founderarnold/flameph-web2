export type BusinessCompletionKey = "business_name" | "category" | "description" | "representative" | "city" | "province" | "verified_contact" | "photo";

type Business = Record<string, unknown> & { photos?: string[] | null };
type CompletionCheck = { key: BusinessCompletionKey; step: "basics" | "about" | "contact" | "photos" | "profile"; label: string; help: string; done: boolean };

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export function businessCompletion(business: Business | null, ownerName: string, emailVerified: boolean) {
  const b = business ?? {};
  const hasReplyChannel = [b.contact_email, b.contact_phone, b.contact_messenger, b.contact_viber].some((value) => Boolean(text(value)));
  // Labels use the same words as the form fields, and `step` says where in My business listing to fill each one in.
  const description = text(b.description).length;
  const checks: CompletionCheck[] = [
    { key: "business_name", step: "basics", label: "Business name", help: "Step 1: use the name customers know.", done: text(b.name).length >= 2 },
    { key: "category", step: "basics", label: "Type of business (sector)", help: "Step 1: choose the closest type of business.", done: Boolean(text(b.sector)) },
    { key: "city", step: "basics", label: "City / Municipality", help: "Step 1: the business locality, never a home address.", done: Boolean(text(b.city)) },
    { key: "province", step: "basics", label: "Province", help: "Step 1: the province where the business operates.", done: Boolean(text(b.province)) },
    { key: "description", step: "about", label: "About your business (at least 80 characters)", help: `Step 2: ${description ? `you have ${description} characters, add ${Math.max(80 - description, 0)} more` : "write what you offer and who you serve"}. The Help me write it button can start it for you.`, done: text(b.description).length >= 80 },
    { key: "verified_contact", step: "contact", label: "Contact buttons (and a verified email)", help: emailVerified ? "Step 4: add a Facebook/Messenger, Viber, phone or business email." : "Verify your account email, and add a Facebook/Messenger, Viber, phone or business email in step 4.", done: emailVerified && hasReplyChannel },
    { key: "photo", step: "photos", label: "Logo or photos", help: "Step 5: add your logo or a real product, service or business photo.", done: Boolean(text(b.logo_url)) || (b.photos?.length ?? 0) > 0 },
    { key: "representative", step: "profile", label: "Your full name in your member profile", help: "Shows who owns or represents the business. Add it in My profile.", done: text(ownerName).length >= 2 },
  ];
  return { complete: checks.every((check) => check.done), checks, missing: checks.filter((check) => !check.done) };
}
