export type BusinessCompletionKey = "business_name" | "category" | "description" | "representative" | "city" | "province" | "verified_contact" | "photo";

type Business = Record<string, unknown> & { photos?: string[] | null };
type CompletionCheck = { key: BusinessCompletionKey; label: string; help: string; done: boolean };

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export function businessCompletion(business: Business | null, ownerName: string, emailVerified: boolean) {
  const b = business ?? {};
  const hasReplyChannel = [b.contact_email, b.contact_phone, b.contact_messenger, b.contact_viber].some((value) => Boolean(text(value)));
  const checks: CompletionCheck[] = [
    { key: "business_name", label: "Business name", help: "Use the name customers know.", done: text(b.name).length >= 2 },
    { key: "category", label: "Category", help: "Choose the closest business sector.", done: Boolean(text(b.sector)) },
    { key: "description", label: "Meaningful description", help: "Write at least 80 characters about what you offer and who you serve.", done: text(b.description).length >= 80 },
    { key: "representative", label: "Owner or authorized representative", help: "Complete your member profile with your real name.", done: text(ownerName).length >= 2 },
    { key: "city", label: "City or municipality", help: "Show the business locality, never a home address.", done: Boolean(text(b.city)) },
    { key: "province", label: "Province", help: "Select the province where the business operates.", done: Boolean(text(b.province)) },
    { key: "verified_contact", label: "Verified contact method", help: emailVerified ? "Add an email, phone, Messenger or Viber contact for customer replies." : "Verify your account email and add a customer reply channel.", done: emailVerified && hasReplyChannel },
    { key: "photo", label: "Logo or genuine business photo", help: "Add a logo or a real product, service or business photo.", done: Boolean(text(b.logo_url)) || (b.photos?.length ?? 0) > 0 },
  ];
  return { complete: checks.every((check) => check.done), checks, missing: checks.filter((check) => !check.done) };
}
