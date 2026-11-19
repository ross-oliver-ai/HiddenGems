import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, postalServices, shops } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ListManager } from "@/components/ListManager";
import { TargetsForm } from "@/components/TargetsForm";

export default async function ListsPage() {
  const user = await requireUser();
  const [s, c, p] = await Promise.all([
    db.select().from(shops).where(eq(shops.userId, user.id)).orderBy(asc(shops.name)),
    db.select().from(categories).where(eq(categories.userId, user.id)).orderBy(asc(categories.name)),
    db.select().from(postalServices).where(eq(postalServices.userId, user.id)).orderBy(asc(postalServices.name)),
  ]);
  return (
    <div className="space-y-4">
      <div>
        <Link href="/settings" className="text-sm font-bold text-primary">← Settings</Link>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Shops, categories & postage</h1>
      </div>
      <ListManager kind="postal" title="Postal services" hint="Choose one when you mark an item as sold. Hide ones you no longer use; past sales keep their history." entries={p} />
      <ListManager kind="shops" title="Charity shops" hint="New shops are also added automatically when you type one on an item." entries={s} />
      <ListManager kind="categories" title="Categories" hint="Used to group your reports." entries={c} />
      <section className="card space-y-3">
        <h2 className="font-extrabold">Targets</h2>
        <TargetsForm goal={user.monthlyProfitGoal} stale={user.staleAfterDays} />
      </section>
    </div>
  );
}
