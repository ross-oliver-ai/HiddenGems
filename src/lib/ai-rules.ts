import { DEFAULT_AI_MODEL, microUsdToPounds, type AiModelId } from "@/lib/ai-pricing";

/** The admin's global switches for "Suggest details from photo". Off by default. */
export type AiSettings = {
  enabled: boolean;
  model: AiModelId;
  /** How many photo suggestions one account may use in a calendar month. */
  monthlyLimitPerUser: number;
  /** Stop for everyone once the estimated spend this month reaches this many pounds. */
  monthlyBudgetPounds: number;
};

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false,
  model: DEFAULT_AI_MODEL,
  monthlyLimitPerUser: 200,
  monthlyBudgetPounds: 10,
};

export type AiDecision =
  | { ok: true }
  | { ok: false; reason: "off" | "no_key" | "user_limit" | "budget"; message: string };

const UNAVAILABLE = "Photo suggestions aren't available right now. You can still fill the details in yourself.";

/** Should this request be allowed to go to the AI? Pure, so every rule can be tested without a database or the AI. */
export function decideAi(input: {
  settings: AiSettings;
  keyPresent: boolean;
  userUsesThisMonth: number;
  spentMicroUsdThisMonth: number;
}): AiDecision {
  const { settings, keyPresent, userUsesThisMonth, spentMicroUsdThisMonth } = input;
  if (!settings.enabled) return { ok: false, reason: "off", message: UNAVAILABLE };
  if (!keyPresent) return { ok: false, reason: "no_key", message: UNAVAILABLE };
  if (microUsdToPounds(spentMicroUsdThisMonth) >= settings.monthlyBudgetPounds) return { ok: false, reason: "budget", message: UNAVAILABLE };
  if (userUsesThisMonth >= settings.monthlyLimitPerUser) {
    return { ok: false, reason: "user_limit", message: "You've used all of this month's photo suggestions. They come back on the 1st. You can still fill the details in yourself." };
  }
  return { ok: true };
}

/** The first moment of this calendar month, by the UK date (within an hour of UK midnight, which is plenty for a monthly limit). */
export function monthStart(todayLondon: string): Date {
  return new Date(`${todayLondon.slice(0, 7)}-01T00:00:00Z`);
}

export type Suggestion = {
  name: string | null;
  brand: string | null;
  size: string | null;
  categoryId: number | null;
  condition: string | null;
};

export class SuggestionParseError extends Error {}

function clean(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  if (!s || /^(null|none|unknown|n\/a)$/i.test(s)) return null;
  return s.slice(0, max);
}

/** Turns the AI's reply into safe form values. Anything it can't back up becomes null; a category or condition must match the lists we gave it. */
export function parseSuggestion(
  text: string,
  lists: { categories: { id: number; name: string }[]; conditions: string[] },
): Suggestion {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new SuggestionParseError("No details in the reply.");
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new SuggestionParseError("The reply wasn't valid JSON.");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new SuggestionParseError("The reply wasn't an object.");
  const o = raw as Record<string, unknown>;
  const category = clean(o.category, 60)?.toLowerCase();
  const condition = clean(o.condition, 30)?.toLowerCase();
  return {
    name: clean(o.name, 120),
    brand: clean(o.brand, 60),
    size: clean(o.size, 30),
    categoryId: category ? (lists.categories.find((c) => c.name.toLowerCase() === category)?.id ?? null) : null,
    condition: condition ? (lists.conditions.find((c) => c.toLowerCase() === condition) ?? null) : null,
  };
}

export function buildPrompt(lists: { categories: string[]; conditions: string[]; hasTag: boolean }): string {
  const cats = lists.categories.length ? lists.categories.map((c) => `"${c}"`).join(", ") : "(none)";
  const conds = lists.conditions.map((c) => `"${c}"`).join(", ");
  return [
    "You help a UK charity-shop and car-boot reseller log an item they have just bought.",
    lists.hasTag ? "The first image is the item. The second image is its tag or label." : "The image is the item.",
    "Reply with ONLY a JSON object and no other text, with exactly these keys: name, brand, size, category, condition.",
    '- name: a short plain title of 2 to 6 words, colour first, then the brand only if you can read it, then what it is. Example: "Navy Barbour wax jacket".',
    "- brand: only if you can read it on a label, tag or logo. Never guess a brand from the style. Otherwise null.",
    "- size: only if it is printed on a tag you can read, exactly as printed. Otherwise null.",
    `- category: exactly one of ${cats}, or null if none fits.`,
    `- condition: exactly one of ${conds}, judged only from what you can see (use "New with tags" only if tags are attached), or null if you can't tell.`,
    "Use null for anything you are not sure about. Do not add commentary.",
  ].join("\n");
}
