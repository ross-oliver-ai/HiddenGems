// The numbers and wording behind sign-in rate limiting. No database in here, so it's easy to test.
/** How many wrong passwords are allowed, and for how long they count. See sign-in-limit.ts for how it's applied. */
export const SIGN_IN_LIMITS = {
  windowMs: 15 * 60 * 1000,
  perEmail: 8, // wrong passwords for one email address
  perIp: 30, // wrong passwords from one network address (loose: households and phone networks share addresses)
} as const;

/** Emergency off switch: set SIGN_IN_LIMIT=off in the environment to turn the limit off without a code change. */
export const signInLimitEnabled = () => process.env.SIGN_IN_LIMIT?.trim().toLowerCase() !== "off";

export const normaliseEmail = (email: string) => email.trim().toLowerCase().slice(0, 254);

/** The visitor's network address, or null if it can't be read (then only the per-email limit applies). On Vercel the platform sets x-forwarded-for itself. */
export function visitorIp(h: { get(name: string): string | null }): string | null {
  const raw = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "";
  return raw ? raw.slice(0, 64) : null;
}

export function blockedMessage(retryAfterMinutes: number): string {
  const n = Math.max(1, Math.ceil(retryAfterMinutes));
  return `Too many sign-in attempts. Please wait ${n} ${n === 1 ? "minute" : "minutes"} and try again, or use "Forgot your password?".`;
}

