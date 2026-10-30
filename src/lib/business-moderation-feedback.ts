export type ModerationField = "business_name" | "contact" | "description" | "location" | "photo" | "profile";

export const MODERATION_FIELD_MESSAGES: Record<ModerationField, string> = {
  business_name: "Please enter the actual name of your business or brand.",
  description: "Please clearly tell customers what your business offers and who it serves.",
  contact: "Please add valid contact information that customers can use.",
  location: "Please select the actual city or municipality and province where you operate.",
  photo: "Please upload your logo or an actual product, service or business photo.",
  profile: "Please use complete, genuine business information throughout the form.",
};

export function safeModerationFields(value: unknown): ModerationField[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is ModerationField => typeof item === "string" && item in MODERATION_FIELD_MESSAGES))];
}
