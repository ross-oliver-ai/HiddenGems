import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, shops } from "@/db/schema";
import { requireWritableUser } from "@/lib/auth";
import { todayLondon } from "@/lib/format";
import { lastShopName } from "@/lib/queries";
import { ItemForm } from "@/components/ItemForm";

export default async function NewItemPage({ searchParams }: { searchParams: Promise<{ added?: string }> }) {
  const user = await requireWritableUser();
  const { added } = await searchParams;
  const [shopRows, catRows, last] = await Promise.all([
    db.select({ name: shops.name }).from(shops).where(and(eq(shops.userId, user.id), eq(shops.archived, false))).orderBy(asc(shops.name)),
    db.select({ id: categories.id, name: categories.name }).from(categories).where(and(eq(categories.userId, user.id), eq(categories.archived, false))).orderBy(asc(categories.name)),
    lastShopName(user.id),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight">Add item</h1>
      {added && <p role="status" className="rounded-xl bg-success/10 px-3 py-2 text-sm font-semibold text-success">Saved! Add the next one.</p>}
      <div className="card">
        <ItemForm
          key={added ? "again" : "new"}
          mode="create"
          values={{ boughtAt: todayLondon(), shop: last }}
          shops={shopRows.map((s) => s.name)}
          categories={catRows}
        />
      </div>
    </div>
  );
}
