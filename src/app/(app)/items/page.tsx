import Link from "next/link";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { listings, platforms } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { daysBetween, money, todayLondon } from "@/lib/format";
import { FILTERS, PAGE_SIZE, isStale, itemProfit, parseShowCount, waitingLabel } from "@/lib/items";
import { StatusPill } from "@/components/StatusPill";
import { SearchBox } from "@/components/SearchBox";
import { SendList } from "@/components/SendList";
import { toSendGroups } from "@/lib/to-send";
import { checkCount, itemList } from "@/lib/item-list";
import { timed } from "@/lib/timing";
import { TimingReadout } from "@/components/TimingReadout";

type Params = { f?: string; q?: string; n?: string; timing?: string };

/** The filter chips wrap onto a second row so none are hidden off-screen */
function FilterChips({ active, term, checks }: { active: string; term: string; checks: number }) {
  const href = (id: string) => `/items?f=${id}${term ? `&q=${encodeURIComponent(term)}` : ""}`;
  return (
    <div className="flex flex-wrap gap-2">
      {FILTERS.filter((x) => !x.check || checks > 0 || x.id === active).map((x) => (
        <Link
          key={x.id}
          href={href(x.id)}
          className={`rounded-full px-4 py-2 text-sm font-bold ${x.id === active ? "bg-primary text-primary-contrast" : "bg-surface-2 text-muted"}`}
        >
          {x.label}{x.check && checks > 0 ? ` (${checks})` : ""}
        </Link>
      ))}
    </div>
  );
}

export default async function ItemsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  const { f = "all", q = "", n, timing } = await searchParams;
  const filter = FILTERS.find((x) => x.id === f) ?? FILTERS[0];
  const term = q.trim().slice(0, 60);
  const show = parseShowCount(n);
  // Admins can add ?timing=1 to see how long each step took (used to track down slow pages)
  const showTiming = timing === "1" && user.role === "admin";
  if (showTiming) {
    await timed("Database round trip 1 (may include connecting)", () => db.execute(sql`select 1`));
    await timed("Database round trip 2", () => db.execute(sql`select 1`));
  }

  const checks = await checkCount(user.id);

  // "To send" is a grouped worklist rather than the usual list of cards
  if (filter.id === "send") {
    const groups = await toSendGroups(user.id, todayLondon(), term);
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-extrabold tracking-tight">Items</h1>
        <SearchBox initial={term} filter={filter.id} />
        <FilterChips active={filter.id} term={term} checks={checks} />
        <SendList groups={groups} />
      </div>
    );
  }

  const { rows, total } = await timed("Items and count", () => itemList({ userId: user.id, statuses: filter.statuses, term, show, order: filter.order, check: filter.check }));

  // Live platforms for the listed items on this page
  const listedIds = rows.filter((r) => r.item.status === "listed").map((r) => r.item.id);
  const liveOn = new Map<number, string[]>();
  if (listedIds.length) {
    const live = await timed("Live platforms", () => db
      .select({ itemId: listings.itemId, name: platforms.name })
      .from(listings)
      .innerJoin(platforms, eq(listings.platformId, platforms.id))
      .where(and(inArray(listings.itemId, listedIds), isNull(listings.endedAt)))
      .orderBy(asc(platforms.id)));
    for (const l of live) liveOn.set(l.itemId, [...(liveOn.get(l.itemId) ?? []), l.name]);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight">Items</h1>

      <SearchBox initial={term} filter={filter.id} />

      <FilterChips active={filter.id} term={term} checks={checks} />

      {rows.length === 0 ? (
        <div className="card space-y-3 text-center">
          <p className="font-bold">{term || filter.id !== "all" ? "Nothing matches that." : "No items yet."}</p>
          <Link href="/items/new" className="btn">Add your first find</Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ item, shop, category, soldOn }) => {
            const tags = item.status === "listed" ? (liveOn.get(item.id) ?? []) : soldOn ? [soldOn] : [];
            const profit = itemProfit(item);
            const stale = isStale(item, user.staleAfterDays);
            return (
              <li key={item.id}>
                <Link href={`/items/${item.id}`} className="card flex gap-3 active:scale-[0.99]">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-surface-2">
                    {item.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.photoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-2xl text-muted" aria-hidden>🛍️</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-extrabold">{item.name}</p>
                      <StatusPill status={item.status} />
                    </div>
                    <p className="truncate text-sm text-muted">{[shop, category].filter(Boolean).join(" · ") || "No place set"}</p>
                    {tags.length > 0 && (
                      <p className="mt-0.5 flex flex-wrap gap-1">
                        {tags.map((t) => <span key={t} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-bold text-muted">{t}</span>)}
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
                      <span className="text-muted">Paid {money(item.buyPrice)}</span>
                      {item.status === "listed" && <span className="font-bold">Asking {money(item.listPrice)}</span>}
                      {profit !== null && (
                        <span className={`font-extrabold ${profit >= 0 ? "text-success" : "text-danger"}`}>
                          {profit >= 0 ? "+" : "−"}{money(Math.abs(profit))}
                        </span>
                      )}
                      {item.aiCheck && (
                        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-extrabold text-primary">✨ Check details</span>
                      )}
                      {item.status === "posted" && item.postedAt && (
                        <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-extrabold text-warning">
                          {waitingLabel(daysBetween(item.postedAt))}
                        </span>
                      )}
                      {stale && item.listedAt && (
                        <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-extrabold text-warning">
                          {daysBetween(item.listedAt)} days listed
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {total > rows.length && (
        <div className="space-y-2 text-center">
          <p className="text-sm text-muted">Showing {rows.length} of {total}</p>
          <Link
            href={`/items?f=${filter.id}${term ? `&q=${encodeURIComponent(term)}` : ""}&n=${rows.length + PAGE_SIZE}`}
            scroll={false}
            className="btn-soft inline-flex"
          >
            Show more
          </Link>
        </div>
      )}
      {showTiming && <TimingReadout />}
    </div>
  );
}
