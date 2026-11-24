/** Where customers write to. Shown on the Help page, the terms and the privacy notice. */
export const SUPPORT_EMAIL = "hello@hiddengemsapp.co.uk";

/**
 * Who runs the service, shown on the terms and privacy pages so customers can see who they are dealing with
 * (name, address and email must be easy to find). The owner is a sole trader trading as "Hidden Gems".
 * Check the wording with whoever reviews the terms before changing it.
 */
export const OPERATOR_NAME = "Ross Oliver";
export const OPERATOR_ADDRESS = "6 Cannon Field, Roadhead, CA6 6NB";

/** A "mailto:" link that opens the person's email app with the subject already filled in. */
export function feedbackHref(subject = "Hidden Gems feedback"): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
