/** Loading placeholders: greyed-out shapes that look like the real page, plus one small spinning gem. */

export function GemSpinner({ size = 28 }: { size?: number }) {
  return (
    <span role="status" aria-label="Loading" className="inline-flex text-primary">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        className="animate-[spin_1.4s_linear_infinite] motion-reduce:animate-none"
        aria-hidden
      >
        <path d="M6 3h12l4 6-10 12L2 9l4-6Z" />
        <path d="M2 9h20M9 3l3 6 3-6M12 21 9 9m3 12 3-12" />
      </svg>
    </span>
  );
}

/** A grey rounded block that gently pulses */
export function Block({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-surface-2 motion-reduce:animate-none ${className}`} aria-hidden />;
}

/** Same shape as an item card on the Items page */
export function ItemCardSkeleton() {
  return (
    <div className="card flex gap-3" aria-hidden>
      <Block className="h-20 w-20 shrink-0" />
      <div className="flex-1 space-y-2 pt-1">
        <Block className="h-4 w-2/3" />
        <Block className="h-3 w-1/2" />
        <Block className="h-3 w-3/4" />
      </div>
    </div>
  );
}

export function CardBlock({ className = "h-24" }: { className?: string }) {
  return <div className={`card ${className}`} aria-hidden><Block className="h-full w-full" /></div>;
}

export function SpinnerRow() {
  return <div className="flex justify-center py-1"><GemSpinner /></div>;
}
