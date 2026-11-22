"use client";

import { useState } from "react";
import { HANDOVER_LABEL, HANDOVERS } from "@/lib/listing-labels";

type Option = { id: number; name: string };

/**
 * The sell step: which platform, the price (starts at that platform's asking price) and how it got to the buyer.
 * Fields: platformId, price, handover, postalServiceId (posted only), handedOver (collected / delivered only).
 */
export function SellFields({
  live,
  others,
  fallbackPrice,
  postalServices,
}: {
  live: { platformId: number; name: string; price: string }[];
  others: Option[];
  fallbackPrice: string;
  postalServices: Option[];
}) {
  const [platformId, setPlatformId] = useState<string>(live.length === 1 ? String(live[0].platformId) : "");
  const [typedPrice, setTypedPrice] = useState<string | null>(null);
  const [handover, setHandover] = useState<string>("posted");

  const listed = live.find((l) => String(l.platformId) === platformId);
  const price = typedPrice ?? listed?.price ?? fallbackPrice;

  return (
    <div className="space-y-3">
      <div>
        <label className="label" htmlFor="sold-platform">Sold on</label>
        <select id="sold-platform" name="platformId" required value={platformId} onChange={(e) => setPlatformId(e.target.value)} className="field">
          <option value="" disabled>Choose where it sold…</option>
          {live.length > 0 && (
            <optgroup label="Listed on">
              {live.map((l) => <option key={l.platformId} value={l.platformId}>{l.name}</option>)}
            </optgroup>
          )}
          {others.length > 0 && (
            <optgroup label={live.length > 0 ? "Other" : "Platforms"}>
              {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </optgroup>
          )}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="price">Sold for (£)</label>
        <input id="price" name="price" inputMode="decimal" required placeholder="0.00" value={price} onChange={(e) => setTypedPrice(e.target.value)} className="field" />
      </div>

      <div>
        <span className="label">How did it get to the buyer?</span>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="How did it get to the buyer?">
          {HANDOVERS.map((h) => (
            <label
              key={h}
              className={`cursor-pointer select-none rounded-2xl border-2 px-2 py-2.5 text-center text-sm font-bold ${handover === h ? "border-primary bg-primary-soft text-primary" : "border-border bg-surface-2 text-muted"}`}
            >
              <input type="radio" name="handover" value={h} checked={handover === h} onChange={() => setHandover(h)} className="sr-only" />
              {HANDOVER_LABEL[h]}
            </label>
          ))}
        </div>
      </div>

      {handover === "posted" ? (
        <div>
          <label className="label" htmlFor="postalServiceId">Postage service</label>
          <select id="postalServiceId" name="postalServiceId" className="field" defaultValue="">
            <option value="">Choose later</option>
            {postalServices.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      ) : (
        <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-surface-2 px-3 py-3 text-sm font-bold">
          <input type="checkbox" name="handedOver" value="1" defaultChecked className="h-5 w-5 accent-[var(--p)]" />
          Already handed over (untick if the buyer hasn&apos;t collected it yet)
        </label>
      )}
    </div>
  );
}
