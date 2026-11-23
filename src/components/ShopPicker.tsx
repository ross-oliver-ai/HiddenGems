"use client";

import { useState } from "react";

const NEW = "__new__";

/** A plain dropdown of your "where from" places (works the same on every phone) plus an "Add a new place" choice. */
export function ShopPicker({ shops, defaultValue }: { shops: string[]; defaultValue?: string }) {
  const initial = defaultValue ?? "";
  const known = shops.some((s) => s.toLowerCase() === initial.toLowerCase());
  const [choice, setChoice] = useState<string>(initial === "" ? "" : known ? (shops.find((s) => s.toLowerCase() === initial.toLowerCase()) as string) : NEW);
  const [typed, setTyped] = useState<string>(known ? "" : initial);

  const adding = choice === NEW || shops.length === 0;
  const value = adding ? typed : choice;

  return (
    <div className="space-y-2">
      <input type="hidden" name="shop" value={value} />
      {shops.length > 0 && (
        <select id="shop" aria-label="Where from" value={choice} onChange={(e) => setChoice(e.target.value)} className="field">
          <option value="">Choose where from</option>
          {shops.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
          <option value={NEW}>+ Add a new place…</option>
        </select>
      )}
      {adding && (
        <input
          id={shops.length === 0 ? "shop" : "shop-new"}
          aria-label="New place name"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          maxLength={60}
          placeholder="e.g. British Heart Foundation, Sunday car boot"
          className="field"
          autoComplete="off"
          autoFocus={shops.length > 0}
        />
      )}
    </div>
  );
}
