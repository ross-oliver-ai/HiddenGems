import type { Item, ItemStatus } from "@/db/schema";
import { daysBetween } from "./format";

export const STATUS_LABEL: Record<ItemStatus, string> = {
  bought: "To list",
  listed: "Listed",
  sold: "Sold, to send",
  posted: "Posted",
  completed: "Completed",
  returned: "Returned",
  unsold: "Unsold",
  donated: "Donated",
};

export const STATUS_STYLE: Record<ItemStatus, string> = {
  bought: "bg-warning/15 text-warning",
  listed: "bg-primary-soft text-primary",
  sold: "bg-success/15 text-success",
  posted: "bg-success/15 text-success",
  completed: "bg-success/15 text-success",
  returned: "bg-danger/10 text-danger",
  unsold: "bg-surface-2 text-muted",
  donated: "bg-surface-2 text-muted",
};

export const CONDITIONS = ["New with tags", "New without tags", "Very good", "Good", "Satisfactory"];

/** Filter chips on the items page */
export const FILTERS: { id: string; label: string; statuses: ItemStatus[] | null }[] = [
  { id: "all", label: "All", statuses: null },
  { id: "stock", label: "In stock", statuses: ["bought", "listed"] },
  { id: "bought", label: "To list", statuses: ["bought"] },
  { id: "listed", label: "Listed", statuses: ["listed"] },
  { id: "send", label: "To send", statuses: ["sold"] },
  { id: "sold", label: "Sold", statuses: ["sold", "posted", "completed"] },
  { id: "other", label: "Returned / unsold", statuses: ["returned", "unsold", "donated"] },
];

const SOLD_STATUSES: ItemStatus[] = ["sold", "posted", "completed"];

/**
 * Profit/loss for an item once its outcome is known, else null.
 * Sold: sold price - fees - postage paid - cost. Returned: sold price - refund - fees - postage paid - cost
 * (fees and postage already paid still count unless the seller edits them). Unsold/donated: -cost.
 * Old sales have fees and postage of 0, so their profit is unchanged.
 */
export function itemProfit(i: Pick<Item, "status" | "soldPrice" | "buyPrice" | "refundAmount" | "fees" | "postagePaid">): number | null {
  const buy = Number(i.buyPrice);
  const costs = Number(i.fees ?? 0) + Number(i.postagePaid ?? 0);
  const pennies = (n: number) => Math.round(n * 100) / 100; // avoid 0.1 + 0.2 style noise
  if (SOLD_STATUSES.includes(i.status)) return pennies(Number(i.soldPrice ?? 0) - costs - buy);
  if (i.status === "returned") return pennies(Number(i.soldPrice ?? 0) - Number(i.refundAmount ?? 0) - costs - buy);
  if (i.status === "unsold" || i.status === "donated") return -buy;
  return null;
}

export function isStale(i: Pick<Item, "status" | "listedAt">, staleAfterDays: number): boolean {
  return i.status === "listed" && !!i.listedAt && daysBetween(i.listedAt) >= staleAfterDays;
}
