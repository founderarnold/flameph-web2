// Business vetting documents: the types members can send, limits and plain words. Shared by the vetting page, the
// upload and review routes, the admin directory and the tests. Rules are enforced on the server and in 0022.

export const DOC_TYPES = {
  dti_sec: { label: "DTI or SEC registration", help: "DTI Certificate of Business Name Registration, or SEC Certificate of Incorporation/Registration. Cooperatives: CDA Certificate of Registration." },
  mayors_permit: { label: "Mayor's permit", help: "Your current Mayor's or Business Permit from your city or municipality." },
  bir: { label: "BIR registration", help: "BIR Certificate of Registration (Form 2303)." },
} as const;
export type DocType = keyof typeof DOC_TYPES;
export const DOC_KEYS = Object.keys(DOC_TYPES) as DocType[];
export const isDocType = (v: unknown): v is DocType => typeof v === "string" && v in DOC_TYPES;

export const MAX_DOC_BYTES = 4 * 1024 * 1024;   // under the hosting limit for one upload (4.5 MB)
export const DOC_MIMES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const MAX_DOCS_PER_TYPE = 3;
/** Kept until vetting is decided plus 1 year, or deleted right away when the member withdraws consent 4. */
export const RETENTION_TEXT = "Kept until your vetting is decided plus 1 year, then deleted. Turning off switch 4 deletes them right away.";

export const safeFileName = (n: string) => (n.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim().slice(-100) || "document");

export const VET_ERRORS: Record<string, string> = {
  consent: "Turn on switch 4, \"Business vetting\", first. It lets FLAME PH reviewers see the documents you upload.",
  type: "Choose which document this is.",
  size: "The file is too big. The limit is 4 MB. Try a smaller photo or a PDF.",
  empty: "Please choose a file.",
  format: "Please upload a PDF, JPG, PNG or WEBP file.",
  too_many: "You already sent 3 files for this document. Delete one first.",
  no_business: "Create your business page first, then send documents to vet it.",
  unavailable: "Business vetting opens after FLAME PH finishes a database update. Please try again later.",
  failed: "The upload didn't go through. Please try again.",
};
export const VET_DONE: Record<string, string> = {
  uploaded: "Document received. It is encrypted and only FLAME PH reviewers can open it.",
  consent: "Thank you. You can now upload your documents.",
  withdrawn: "Switch 4 is off and your vetting documents were deleted.",
  deleted: "Document deleted.",
};
