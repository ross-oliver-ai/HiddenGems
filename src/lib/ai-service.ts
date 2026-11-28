import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage, appSettings } from "@/db/schema";
import { CONDITIONS } from "@/lib/items";
import { isAiModel, costMicroUsd } from "@/lib/ai-pricing";
import { DEFAULT_AI_SETTINGS, buildPrompt, decideAi, monthStart, parseSuggestion, SuggestionParseError, type AiSettings, type Suggestion } from "@/lib/ai-rules";
import { askClaude, type AiImage } from "@/lib/ai-claude";

/** The UK calendar date (YYYY-MM-DD) of a moment. */
const londonDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);

export async function getAiSettings(): Promise<AiSettings> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1));
  if (!row) return DEFAULT_AI_SETTINGS;
  return {
    enabled: row.aiEnabled,
    model: isAiModel(row.aiModel) ? row.aiModel : DEFAULT_AI_SETTINGS.model,
    monthlyLimitPerUser: row.aiMonthlyLimitPerUser,
    monthlyBudgetPounds: row.aiMonthlyBudgetPounds,
  };
}

export async function saveAiSettings(s: AiSettings): Promise<void> {
  const v = {
    aiEnabled: s.enabled,
    aiModel: s.model,
    aiMonthlyLimitPerUser: s.monthlyLimitPerUser,
    aiMonthlyBudgetPounds: s.monthlyBudgetPounds,
    updatedAt: new Date(),
  };
  await db.insert(appSettings).values({ id: 1, ...v }).onConflictDoUpdate({ target: appSettings.id, set: v });
}

export const aiKeyPresent = () => Boolean(process.env.ANTHROPIC_API_KEY);

/** Is the button worth showing? (The route still checks every limit.) */
export async function aiOffered(): Promise<boolean> {
  return aiKeyPresent() && (await getAiSettings()).enabled;
}

export type AiMonthSummary = { requests: number; failed: number; inputTokens: number; outputTokens: number; costMicroUsd: number };

export async function aiMonthSummary(now: Date = new Date()): Promise<AiMonthSummary> {
  const since = monthStart(londonDate(now));
  const [r] = await db
    .select({
      requests: sql<number>`count(*)::int`,
      failed: sql<number>`count(*) filter (where not ${aiUsage.ok})::int`,
      inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}),0)::int`,
      outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}),0)::int`,
      costMicroUsd: sql<number>`coalesce(sum(${aiUsage.costMicroUsd}),0)::int`,
    })
    .from(aiUsage)
    .where(gte(aiUsage.createdAt, since));
  return r;
}

async function userUsesThisMonth(userId: number, since: Date): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(aiUsage).where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, since)));
  return r.n;
}

export type SuggestResult =
  | { ok: true; suggestion: Suggestion }
  | { ok: false; status: 429 | 503 | 502; message: string };

/** The whole "Suggest details from photo" request, after the route has checked who is asking and read the photos. */
export async function suggestDetails(
  input: { userId: number; images: AiImage[]; categories: { id: number; name: string }[] },
  deps: { ask?: typeof askClaude; now?: Date; apiKey?: string | undefined } = {},
): Promise<SuggestResult> {
  const now = deps.now ?? new Date();
  const apiKey = "apiKey" in deps ? deps.apiKey : process.env.ANTHROPIC_API_KEY;
  const since = monthStart(londonDate(now));
  const settings = await getAiSettings();
  const [mine, spent] = await Promise.all([userUsesThisMonth(input.userId, since), aiMonthSummary(now)]);

  const decision = decideAi({ settings, keyPresent: Boolean(apiKey), userUsesThisMonth: mine, spentMicroUsdThisMonth: spent.costMicroUsd });
  if (!decision.ok) return { ok: false, status: decision.reason === "user_limit" ? 429 : 503, message: decision.message };

  const lists = { categories: input.categories, conditions: CONDITIONS };
  const prompt = buildPrompt({ categories: input.categories.map((c) => c.name), conditions: CONDITIONS, hasTag: input.images.length > 1 });

  let reply;
  try {
    reply = await (deps.ask ?? askClaude)({ apiKey: apiKey!, model: settings.model, prompt, images: input.images });
  } catch (e) {
    console.error("AI suggestion failed:", e instanceof Error ? e.message : "unknown error");
    return { ok: false, status: 502, message: "Couldn't read that photo just now. You can fill the details in yourself, or try again." };
  }

  let suggestion: Suggestion | null = null;
  try {
    suggestion = parseSuggestion(reply.text, lists);
  } catch (e) {
    if (!(e instanceof SuggestionParseError)) throw e;
  }
  // The AI answered, so it cost something even when the reply was unusable.
  await db.insert(aiUsage).values({
    userId: input.userId,
    model: settings.model,
    inputTokens: reply.inputTokens,
    outputTokens: reply.outputTokens,
    costMicroUsd: costMicroUsd(settings.model, reply.inputTokens, reply.outputTokens),
    ok: suggestion !== null,
  });
  if (!suggestion) return { ok: false, status: 502, message: "Couldn't make sense of that photo. You can fill the details in yourself, or try again." };
  return { ok: true, suggestion };
}
