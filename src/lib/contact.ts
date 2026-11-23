/** Where customers write to. Shown on the Help page, the terms and the privacy notice. */
export const SUPPORT_EMAIL = "hello@hiddengemsapp.co.uk";

/** A "mailto:" link that opens the person's email app with the subject already filled in. */
export function feedbackHref(subject = "Hidden Gems feedback"): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
