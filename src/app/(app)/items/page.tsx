import Link from "next/link";
import { and, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { categories, items, shops } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { daysBetween, money } from "@/lib/format";
import { FILTERS, isStale, itemProfit } from "@/lib/items";
import { StatusPill } from "@/components/StatusPill";

type Params = { f?: string; q?: string };

export default async function ItemsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  const { f = "all", q = "" } = await searchParams;
  const filter = FILTERS.find((x) => x.id === f) ?? FILTERS[0];

  const conds: SQL[] = [eq(items.userId, user.id)];
  if (filter.statuses) conds.push(inArray(items.status, filter.statuses));
  const term = q.trim().slice(0, 60);
  if (term) {
    const like = `%${term.replace(/[%_\\]/g, "\\$&")}%`;
    conds.push(or(ilike(items.name, like), ilike(items.brand, like), ilike(shops.name, like))!);
  }

  const rows = await db
    .select({ item: items, shop: shops.name, category: categories.name })
    .from(items)
    .leftJoin(shops, eq(items.shopId, shops.id))
    .leftJoin(categories, eq(items.categoryId, categories.id))
    .where(and(...conds))
    .orderBy(desc(items.createdAt))
    .limit(200);

  const chip = (id: string) => `/items?f=${id}${term ? `&q=${encodeURIComponent(term)}` : ""}`;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight">Items</h1>

      <form action="/items" className="flex gap-2">
        <input type="hidden" name="f" value={filter.id} />
        <input name="q" defaultValue={term} type="search" placeholder="Search name, brand or shop" className="field" autoComplete="off" />
      </form>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((x) => (
          <Link
            key={x.id}
            href={chip(x.id)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${x.id === filter.id ? "bg-primary text-primary-contrast" : "bg-surface-2 text-muted"}`}
          >
            {x.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="card space-y-3 text-center">
          <p className="font-bold">{term || filter.id !== "all" ? "Nothing matches that." : "No items yet."}</p>
          <Link href="/items/new" className="btn">Add your first find</Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ item, shop, category }) => {
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
                    <p className="truncate text-sm text-muted">{[shop, category].filter(Boolean).join(" · ") || "No shop"}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
                      <span className="text-muted">Paid {money(item.buyPrice)}</span>
                      {item.status === "listed" && <span className="font-bold">Asking {money(item.listPrice)}</span>}
                      {profit !== null && (
                        <span className={`font-extrabold ${profit >= 0 ? "text-success" : "text-danger"}`}>
                          {profit >= 0 ? "+" : "−"}{money(Math.abs(profit))}
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
    </div>
  );
}
