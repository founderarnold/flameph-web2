export type BusinessLifecycleStatus = "draft" | "submitted" | "pending_review" | "needs_correction" | "approved" | "rejected" | "suspended";
export type BusinessPublicationStatus = "unpublished" | "published";

type BusinessState = {
  lifecycle_status?: BusinessLifecycleStatus | null;
  publication_status?: BusinessPublicationStatus | null;
  published?: boolean | null;
};

export function publicationStatusOf(business: BusinessState): BusinessPublicationStatus {
  return business.publication_status ?? (business.published ? "published" : "unpublished");
}

export function lifecycleStatusOf(business: BusinessState): BusinessLifecycleStatus {
  return business.lifecycle_status ?? (business.published ? "approved" : "draft");
}

export function businessStatusCopy(business: BusinessState): { label: string; detail: string; tone: "ok" | "warn" | "muted" } {
  if (publicationStatusOf(business) === "published") {
    return { label: "Your business is live", detail: "Shown in the FLAME PH Business Directory.", tone: "ok" };
  }

  switch (lifecycleStatusOf(business)) {
    case "submitted":
    case "pending_review":
      return { label: "Under Review", detail: "Not publicly listed while FLAME PH reviews your business.", tone: "warn" };
    case "needs_correction":
      return { label: "Action Required", detail: "Update your business information before it can be reviewed again.", tone: "warn" };
    case "approved":
      return { label: "Approved", detail: "Approved by FLAME PH but not currently published.", tone: "ok" };
    case "rejected":
      return { label: "Not Approved", detail: "Not publicly listed. Review the requested corrections before resubmitting.", tone: "warn" };
    case "suspended":
      return { label: "Suspended", detail: "This business is not publicly listed.", tone: "warn" };
    default:
      return { label: "Draft", detail: "Only you and authorized FLAME PH reviewers can see this draft.", tone: "muted" };
  }
}

