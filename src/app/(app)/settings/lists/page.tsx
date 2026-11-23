import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, shops } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ListManager } from "@/components/ListManager";

export default async function ListsPage() {
  const user = await requireUser();
  const [s, c] = await Promise.all([
    db.select().from(shops).where(eq(shops.userId, user.id)).orderBy(asc(shops.name)),
    db.select().from(categories).where(eq(categories.userId, user.id)).orderBy(asc(categories.name)),
  ]);
  return (
    <div className="space-y-4">
      <div>
        <Link href="/settings" className="text-sm font-bold text-primary">← Settings</Link>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Shops & categories</h1>
      </div>
      <ListManager kind="shops" title="Where from" hint="Where you find things: a charity shop, a car boot, an online auction, your own wardrobe. New places are also added automatically when you type one on an item." entries={s} />
      <ListManager kind="categories" title="Categories" hint="Used to group your reports." entries={c} />
    </div>
  );
}
