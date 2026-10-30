export type AccountVerificationStatus = {
  email_verified: boolean;
  email_verified_at: string | null;
  mobile_present: boolean;
  mobile_verified: boolean;
  mobile_verified_at: string | null;
  mobile_required: boolean;
  sms_provider_configured: boolean;
};

type AuthUser = {
  email_confirmed_at?: string | null;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

export function accountVerificationStatus(data: unknown, user: AuthUser): AccountVerificationStatus {
  if (data && typeof data === "object" && "email_verified" in data) return data as AccountVerificationStatus;
  const legacyPending = user.app_metadata?.email_unverified === true || user.user_metadata?.email_verification_required === true;
  return {
    email_verified: Boolean(user.email_confirmed_at) && !legacyPending,
    email_verified_at: null,
    mobile_present: false,
    mobile_verified: false,
    mobile_verified_at: null,
    mobile_required: false,
    sms_provider_configured: false,
  };
}
