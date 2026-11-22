// Wording for how an item reached the buyer. No database imports, so client components can use it.
import type { Handover } from "@/db/schema";

export const HANDOVER_LABEL: Record<Handover, string> = {
  posted: "By post",
  collected: "Collected by buyer",
  delivered: "I delivered it",
};
export const HANDOVERS = Object.keys(HANDOVER_LABEL) as Handover[];
export const isHandover = (v: unknown): v is Handover => typeof v === "string" && (HANDOVERS as string[]).includes(v);
