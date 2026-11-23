// The pure rules behind error alerts (no database, so they can be tested on their own).
// The point of "scrub" is that an alert email, and the row behind it, must never carry anything about a customer.

export const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // one email per distinct problem per hour
export const DAILY_ALERT_CAP = 20; // at most this many distinct problems emailed in 24 hours; the rest are still counted
export const ALERT_RETENTION_DAYS = 30;
const MESSAGE_MAX = 300;

/** Anything that could identify a person is replaced; the message is shortened to one line. */
export function scrub(text: string): string {
  let t = String(text ?? "");
  // Database errors from the ORM print the whole query and then "params: <the values>": keep only the part before the values.
  t = t.replace(/\bparams:[\s\S]*$/i, "");
  t = t
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/https?:\/\/[^\s)'"]+/gi, (u) => u.split("?")[0].split("#")[0]) // links keep their path, never the query string
    .replace(/\b(?:sk|pk|rk|whsec|cus|sub|pi|cs|evt|price|in|ch|re)_[A-Za-z0-9_]{6,}/g, "[stripe-id]")
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, "[token]")
    .replace(/\d{6,}/g, "[number]")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > MESSAGE_MAX ? `${t.slice(0, MESSAGE_MAX - 1)}…` : t;
}

/** A page or route pattern as a short path: no query string, and ids flattened so /items/12 and /items/57 are one place. */
export function scrubRoute(route: string | undefined | null): string | null {
  if (!route) return null;
  const r = route.split("?")[0].split("#")[0].replace(/\/\d+(?=\/|$)/g, "/#").replace(/[A-Za-z0-9_-]{24,}/g, "[token]");
  return r.slice(0, 120);
}

export function errorName(error: unknown): string {
  return error instanceof Error && error.name ? error.name : typeof error === "object" && error !== null ? "Error" : typeof error;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

/** Same place + same kind of error = same signature, so a flood from one bug is one alert. Numbers are flattened. */
export function signatureFor(source: string, route: string | null, error: unknown): string {
  const msg = scrub(errorMessage(error)).replace(/\d+/g, "#").toLowerCase();
  return [source, scrubRoute(route) ?? "", errorName(error), msg].join("|").slice(0, 300);
}

/** Next.js uses thrown "errors" for redirects and not-found pages; those are normal behaviour, not problems. */
export function isNormalControlFlow(error: unknown): boolean {
  const digest = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest: unknown }).digest) : "";
  return /^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/.test(digest);
}

export function alertsOff(): boolean {
  return process.env.ALERTS === "off";
}
