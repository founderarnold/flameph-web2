import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export default async function RideSafeProviderApply({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  const providerType = category?.trim().slice(0, 80) || "Roadside assistance";
  const path = `/ridesafe/providers/apply?category=${encodeURIComponent(providerType)}`;
  await requireUser(path);
  redirect(`/account/business?ridesafe=${encodeURIComponent(providerType)}`);
}
