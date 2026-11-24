"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * A small "refresh" icon button. The installed app on an iPhone has no pull-down-to-refresh, so this re-fetches
 * the current page from the server (`router.refresh()`) without a full reload. The icon spins while it loads.
 */
export function RefreshButton({ label = "Refresh" }: { label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => router.refresh())}
      disabled={pending}
      aria-label={label}
      title={label}
      data-refresh
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary transition active:scale-95 disabled:opacity-60"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={pending ? "animate-spin" : ""}
      >
        <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
        <path d="M21 3v5h-5" />
      </svg>
    </button>
  );
}
