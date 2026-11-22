"use client";

import { useState } from "react";

type Platform = { id: number; name: string };

/**
 * "Where is it for sale?" Tap the platforms; each chosen one gets a price box.
 * Prices start at the first platform's price, so you only change the ones that differ.
 * Fields: platformId (repeated), price_<id>, url_<id>.
 */
export function PlatformPicker({
  platforms,
  initialSelected,
  defaultPrice = "",
}: {
  platforms: Platform[];
  initialSelected: number[];
  defaultPrice?: string;
}) {
  const [selected, setSelected] = useState<number[]>(initialSelected.filter((id) => platforms.some((p) => p.id === id)));
  const [typed, setTyped] = useState<Record<number, string>>({});
  const [linkOpen, setLinkOpen] = useState<Record<number, boolean>>({});

  if (platforms.length === 0) {
    return <p className="rounded-xl bg-warning/15 px-3 py-2 text-sm font-bold text-warning">Add a platform in Settings → Platforms & postage first.</p>;
  }

  const firstPrice = selected.length ? (typed[selected[0]] ?? defaultPrice) : defaultPrice;
  const priceOf = (id: number) => typed[id] ?? firstPrice;
  const toggle = (id: number) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <div className="space-y-3">
      <div>
        <span className="label">Where is it for sale?</span>
        <div className="flex flex-wrap gap-2">
          {platforms.map((p) => {
            const on = selected.includes(p.id);
            return (
              <label
                key={p.id}
                className={`cursor-pointer select-none rounded-full border-2 px-3.5 py-2 text-sm font-bold ${on ? "border-primary bg-primary-soft text-primary" : "border-border bg-surface-2 text-muted"}`}
              >
                <input type="checkbox" name="platformId" value={p.id} checked={on} onChange={() => toggle(p.id)} className="sr-only" />
                {on ? "✓ " : ""}{p.name}
              </label>
            );
          })}
        </div>
      </div>

      {selected.map((id) => {
        const p = platforms.find((x) => x.id === id)!;
        return (
          <div key={id} className="space-y-2 rounded-2xl bg-surface-2 p-3">
            <label className="label" htmlFor={`price_${id}`}>{p.name} price (£)</label>
            <input
              id={`price_${id}`}
              name={`price_${id}`}
              inputMode="decimal"
              required
              placeholder="0.00"
              value={priceOf(id)}
              onChange={(e) => setTyped((t) => ({ ...t, [id]: e.target.value }))}
              className="field"
            />
            {linkOpen[id] ? (
              <input name={`url_${id}`} type="url" inputMode="url" placeholder="https://…" aria-label={`${p.name} link`} className="field" />
            ) : (
              <button type="button" onClick={() => setLinkOpen((l) => ({ ...l, [id]: true }))} className="text-sm font-bold text-primary">+ Add a link</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
