// The first-run checklist on Home and the spotlight that points at things. Pure (no database), so it's easy to test.
//
// WHEN YOU CHANGE A SCREEN: see README "Screens that other things describe". Every spotlight target is a `data-tour="..."` attribute in a
// page or component; its name must be in TOURS below, and tests/checklist.test.ts fails if the two lists drift apart.

/** What each spotlight points at, and the one line shown beside it. Keep the lines general ("fill in this step"), not tied to exact button wording. */
export const TOURS = {
  fees: "Enter each platform's selling fee as a percentage, then save. Leave it at 0 if a platform doesn't charge you.",
  "add-item": "Type what you bought. A name and a price are enough; everything else can wait.",
  "list-step": "Choose where you're selling it and your asking price to put it on sale.",
  "sell-step": "Fill in this step when it sells, and the profit shows up in Reports.",
} as const;

export type TourName = keyof typeof TOURS;

export function isTourName(v: unknown): v is TourName {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(TOURS, v);
}

/** What the checklist needs to know about an account. All of it is worked out from the person's own data. */
export type ChecklistFacts = {
  feesReviewed: boolean;
  itemCount: number;
  hasListing: boolean;
  hasSale: boolean;
  /** Newest item still waiting to be listed, if any */
  toListItemId: number | null;
  /** Newest item currently on sale, if any */
  listedItemId: number | null;
};

export type ChecklistStep = {
  id: "fees" | "first-item" | "list" | "sale";
  title: string;
  hint: string;
  done: boolean;
  /** Where the step takes you. Null when there's nothing to open yet (blockedHint says why). */
  href: string | null;
  blockedHint?: string;
};

export function checklistSteps(f: ChecklistFacts): ChecklistStep[] {
  return [
    {
      id: "fees",
      title: "Check your selling fees",
      hint: "So profit is worked out after what each platform takes.",
      done: f.feesReviewed,
      href: "/settings/platforms?tour=fees",
    },
    {
      id: "first-item",
      title: "Add your first find",
      hint: "A name and a price are enough.",
      done: f.itemCount > 0,
      href: "/items/new?tour=add-item",
    },
    {
      id: "list",
      title: "List it for sale",
      hint: "Pick where you're selling it and your asking price.",
      done: f.hasListing,
      href: f.toListItemId ? `/items/${f.toListItemId}?tour=list-step` : f.itemCount > 0 ? "/items" : null,
      blockedHint: "Add an item first.",
    },
    {
      id: "sale",
      title: "Record your first sale",
      hint: "Enter what it sold for. Profit then appears in Reports.",
      done: f.hasSale,
      href: f.listedItemId ? `/items/${f.listedItemId}?tour=sell-step` : null,
      blockedHint: "List an item first.",
    },
  ];
}

export const checklistDone = (steps: ChecklistStep[]) => steps.every((s) => s.done);

/** The first step still to do that can be opened, which is the one given the main button */
export const nextStep = (steps: ChecklistStep[]) => steps.find((s) => !s.done && s.href) ?? null;
