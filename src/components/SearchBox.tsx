"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Search box that updates the item list as you type (debounced). */
export function SearchBox({ initial, filter }: { initial: string; filter: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      const q = value.trim();
      const url = `/items?f=${encodeURIComponent(filter)}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
      startTransition(() => router.replace(url, { scroll: false }));
    }, 250);
    return () => clearTimeout(t);
  }, [value, filter, router]);

  return (
    <form action="/items" role="search" className="relative">
      <input type="hidden" name="f" value={filter} />
      <input
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        type="search"
        enterKeyHint="search"
        placeholder="Search name, brand or shop"
        className="field"
        autoComplete="off"
        aria-busy={pending}
      />
    </form>
  );
}
