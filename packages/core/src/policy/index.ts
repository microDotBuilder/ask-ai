export interface SensitivePageSignal {
  kind: "password-field" | "payment-field" | "auth-account-indicator" | "blocked-url";
  reason: string;
}

export type PageContextUnavailableReason =
  | "browser-internal"
  | "chrome-web-store"
  | "pdf"
  | "excluded-site"
  | "sensitive-page"
  | "content-script-unavailable"
  | "extraction-failed";

export type PageContextAvailability = "available" | "blocked" | "unsupported" | "failed";

export interface PageContextUnavailable {
  availability: Exclude<PageContextAvailability, "available">;
  reason: PageContextUnavailableReason;
  message: string;
}
