/**
 * The AI models the admin can choose between for "Suggest details from photo", and what each costs.
 * Prices are Anthropic's list prices in US dollars per million tokens, checked on 28 Nov 2026.
 * They are only used to ESTIMATE spend for the admin's limits and figures; the real bill is Anthropic's.
 */
export const AI_MODELS = [
  { id: "claude-haiku-5-5", label: "Haiku 5.5 (fastest and cheapest)", inputPerMTok: 0.1, outputPerMTok: 0.5 },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5 (more accurate, dearer)", inputPerMTok: 2, outputPerMTok: 10 },
] as const;

export type AiModelId = (typeof AI_MODELS)[number]["id"];

export const DEFAULT_AI_MODEL: AiModelId = "claude-haiku-5-5";

/** Pounds per US dollar, for display only. Change it here if the exchange rate moves a lot. */
export const USD_TO_GBP = 0.77;

export function isAiModel(id: string): id is AiModelId {
  return AI_MODELS.some((m) => m.id === id);
}

export function aiModelLabel(id: string): string {
  return AI_MODELS.find((m) => m.id === id)?.label ?? id;
}

/** Cost of one request in millionths of a US dollar. (Dollars per million tokens x tokens = millionths of a dollar.) */
export function costMicroUsd(model: string, inputTokens: number, outputTokens: number): number {
  const m = AI_MODELS.find((x) => x.id === model);
  if (!m) return 0;
  return Math.round(inputTokens * m.inputPerMTok + outputTokens * m.outputPerMTok);
}

export function microUsdToPounds(micro: number): number {
  return (micro / 1_000_000) * USD_TO_GBP;
}

/** "under 1p", "3p", "£1.24" */
export function poundsLabel(pounds: number): string {
  if (pounds <= 0) return "£0.00";
  if (pounds < 0.01) return "under 1p";
  if (pounds < 1) return `${Math.round(pounds * 100)}p`;
  return `£${pounds.toFixed(2)}`;
}
