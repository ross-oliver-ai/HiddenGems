import { StatusPill } from "@/components/StatusPill";

// Pictures of the real screens, drawn with the app's own styles so they follow the visitor's theme and dark mode.
// Every figure is an example. Nothing here reads from the database.

const SHADOW = "shadow-[0_20px_50px_-24px_color-mix(in_srgb,var(--primary)_45%,transparent)]";

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-bold text-muted">{children}</span>;
}

/** The hero: one sale, worked through line by line. */
export function ProfitCard() {
  const rows: [string, string][] = [
    ["Sold for", "£28.00"],
    ["Fees", "−£1.40"],
    ["Postage I paid", "−£3.35"],
    ["What I paid", "−£4.50"],
  ];
  return (
    <div className={`card mx-auto w-full max-w-sm space-y-4 ${SHADOW}`} role="img" aria-label="Example: a coat bought for £4.50 and sold for £28.00 leaves £18.75 profit after fees and postage">
      <div className="flex items-start justify-between gap-3" aria-hidden>
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-2xl">🧥</div>
          <div className="min-w-0">
            <p className="truncate font-extrabold">Wool coat</p>
            <p className="truncate text-sm text-muted">Sold on Vinted</p>
          </div>
        </div>
        <StatusPill status="completed" />
      </div>
      <dl className="space-y-2 text-sm" aria-hidden>
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <dt className="text-muted">{k}</dt>
            <dd className="font-bold">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-baseline justify-between border-t border-border pt-3" aria-hidden>
        <p className="font-extrabold">You keep</p>
        <p className="text-3xl font-extrabold tracking-tight text-success">£18.75</p>
      </div>
      <p className="text-right text-xs font-bold text-muted" aria-hidden>Example</p>
    </div>
  );
}

/** Where an item is for sale, with a price for each. */
export function PlatformsMock() {
  const rows = [
    ["Vinted", "£28.00"],
    ["eBay", "£32.00"],
    ["Depop", "£30.00"],
  ];
  return (
    <div className={`card w-full max-w-sm space-y-3 ${SHADOW}`} role="img" aria-label="Example: one item listed on Vinted for £28, eBay for £32 and Depop for £30">
      <div className="flex items-center justify-between gap-3" aria-hidden>
        <p className="truncate font-extrabold">Wool coat</p>
        <StatusPill status="listed" />
      </div>
      <ul className="space-y-2" aria-hidden>
        {rows.map(([p, price]) => (
          <li key={p} className="flex items-center justify-between rounded-2xl bg-surface-2 px-3 py-2.5">
            <span className="font-bold">{p}</span>
            <span className="font-extrabold">{price}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted" aria-hidden>A price for each. When it sells on one, the others end.</p>
    </div>
  );
}

/** Posting day: parcels grouped by how they go. */
export function SendMock() {
  const rows = [
    ["Denim jacket", "Vinted", "sold yesterday", "🧥"],
    ["Hardback cookbook", "eBay", "sold today", "📚"],
  ];
  return (
    <div className="w-full max-w-sm space-y-2" role="img" aria-label="Example: two parcels waiting for Royal Mail, each with a Mark as posted button">
      <div className="flex items-baseline justify-between px-1" aria-hidden>
        <p className="text-lg font-extrabold">Royal Mail</p>
        <p className="text-sm font-bold text-muted">2 parcels</p>
      </div>
      <ul className="space-y-3" aria-hidden>
        {rows.map(([name, on, when, icon]) => (
          <li key={name} className="card space-y-3">
            <div className="flex gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-xl">{icon}</div>
              <div className="min-w-0">
                <p className="truncate font-extrabold">{name}</p>
                <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
                  <Tag>{on}</Tag>
                  <span>{when}</span>
                </p>
              </div>
            </div>
            <div className="btn-soft w-full">Mark as posted</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A slice of Reports: which platforms and which places make the money. */
export function ReportsMock() {
  const platforms = [
    ["Vinted", 212, 100],
    ["eBay", 96, 45],
    ["Depop", 34, 16],
  ] as const;
  return (
    <div className={`card w-full max-w-sm space-y-4 ${SHADOW}`} role="img" aria-label="Example report: profit after fees and postage by platform, for the UK tax year">
      <div className="flex items-baseline justify-between" aria-hidden>
        <p className="font-extrabold">Profit by platform</p>
        <p className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-extrabold text-primary">UK tax year</p>
      </div>
      <ul className="space-y-3" aria-hidden>
        {platforms.map(([p, profit, pct]) => (
          <li key={p} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="font-bold">{p}</span>
              <span className="font-extrabold">£{profit}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-primary-soft">
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-3 gap-2 text-center" aria-hidden>
        {[["68%", "sell-through"], ["9 days", "to sell"], ["24", "sold"]].map(([v, l]) => (
          <div key={l} className="rounded-2xl bg-primary-soft py-2">
            <p className="text-lg font-extrabold">{v}</p>
            <p className="text-[11px] font-bold text-muted">{l}</p>
          </div>
        ))}
      </div>
      <p className="text-right text-xs font-bold text-muted" aria-hidden>Example</p>
    </div>
  );
}
