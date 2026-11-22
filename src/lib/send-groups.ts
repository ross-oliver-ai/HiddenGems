// Grouping for the "To send" view. No database here, so it can be tested directly.
import type { Handover } from "@/db/schema";

export type SendRow = {
  id: number;
  name: string;
  photoUrl: string | null;
  soldAt: string;
  daysAgo: number;
  soldOn: string | null;
  handover: Handover | null;
};

export type SendGroup = {
  key: string;
  title: string;
  /** What the count is of: parcels go in the post, the rest are handed over in person */
  unit: "parcel" | "item";
  rows: SendRow[];
};

export type SendInput = SendRow & { postalId: number | null; postalName: string | null };

/**
 * Groups sold items that are waiting to go: one group per postal service the seller uses, then "No service chosen",
 * Collection, Delivery and "No method set". Empty groups don't exist. Oldest sale first, so what has waited longest is on top.
 * Pure (no database), so it can be tested directly.
 */
export function groupToSend(rows: SendInput[]): SendGroup[] {
  const postal = new Map<number, SendGroup>();
  const fixed: Record<string, SendGroup> = {
    noservice: { key: "noservice", title: "No service chosen", unit: "parcel", rows: [] },
    collect: { key: "collect", title: "Collection", unit: "item", rows: [] },
    deliver: { key: "deliver", title: "Delivery", unit: "item", rows: [] },
    nomethod: { key: "nomethod", title: "No method set", unit: "item", rows: [] },
  };

  for (const { postalId, postalName, ...row } of rows) {
    if (row.handover === "collected") fixed.collect.rows.push(row);
    else if (row.handover === "delivered") fixed.deliver.rows.push(row);
    else if (row.handover === null) fixed.nomethod.rows.push(row);
    else if (postalId === null) fixed.noservice.rows.push(row);
    else {
      const g = postal.get(postalId) ?? { key: `p${postalId}`, title: postalName ?? "Postal service", unit: "parcel" as const, rows: [] };
      g.rows.push(row);
      postal.set(postalId, g);
    }
  }

  const oldestFirst = (a: SendRow, b: SendRow) => (a.soldAt < b.soldAt ? -1 : a.soldAt > b.soldAt ? 1 : a.id - b.id);
  const byName = [...postal.values()].sort((a, b) => a.title.localeCompare(b.title));
  return [...byName, fixed.noservice, fixed.collect, fixed.deliver, fixed.nomethod]
    .filter((g) => g.rows.length > 0)
    .map((g) => ({ ...g, rows: [...g.rows].sort(oldestFirst) }));
}

