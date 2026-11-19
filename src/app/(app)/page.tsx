import Link from "next/link";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { items } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { daysBetween, money, todayLondon } from "@/lib/format";

export default async function HomePage() {
  const user = await requireUser();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/London" }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const byStatus = await db
    .select({ status: items.status, n: count(), cost: sql<string>`coalesce(sum(${items.buyPrice}), 0)` })
    .from(items)
    .where(eq(items.userId, user.id))
    .groupBy(items.status);
  const get = (s: string) => byStatus.find((r) => r.status === s);
  const toList = get("bought")?.n ?? 0;
  const listed = get("listed")?.n ?? 0;
  const toPost = get("sold")?.n ?? 0;
  const stockValue = Number(get("bought")?.cost ?? 0) + Number(get("listed")?.cost ?? 0);

  const listedRows = await db
    .select({ listedAt: items.listedAt })
    .from(items)
    .where(and(eq(items.userId, user.id), inArray(items.status, ["listed"])));
  const today = todayLondon();
  const stale = listedRows.filter((r) => r.listedAt && daysBetween(r.listedAt, today) >= user.staleAfterDays).length;

  const tile = (label: string, value: React.ReactNode, href: string, accent = false) => (
    <Link href={href} className={`card active:scale-[0.98] ${accent ? "bg-primary-soft" : ""}`}>
      <p className="text-3xl font-extrabold">{value}</p>
      <p className="text-sm font-bold text-muted">{label}</p>
    </Link>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight">
        {greeting}, {user.name.split(" ")[0]} ✨
      </h1>

      <div className="grid grid-cols-2 gap-3">
        {tile("To list on Vinted", toList, "/items?f=bought", toList > 0)}
        {tile("Listed now", listed, "/items?f=listed")}
        {tile("Sold, to post", toPost, "/items?f=sold", toPost > 0)}
        {tile("Stock value (at cost)", money(stockValue), "/items?f=stock")}
      </div>

      {stale > 0 && (
        <Link href="/items?f=listed" className="card block bg-warning/10 font-bold text-warning">
          {stale} listing{stale === 1 ? "" : "s"} listed for {user.staleAfterDays}+ days: maybe drop the price?
        </Link>
      )}

      {toList + listed + toPost === 0 && (
        <div className="card space-y-3 text-center">
          <p className="font-bold">Nothing in stock yet</p>
          <Link href="/items/new" className="btn">Add your first find</Link>
        </div>
      )}
      <p className="text-center text-sm text-muted">Profit reports and charts are coming next.</p>
    </div>
  );
}
