import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { platforms, postalServices } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ListManager } from "@/components/ListManager";

export default async function PlatformsPage() {
  const user = await requireUser();
  const [pl, po] = await Promise.all([
    db.select().from(platforms).where(eq(platforms.userId, user.id)).orderBy(asc(platforms.id)),
    db.select().from(postalServices).where(eq(postalServices.userId, user.id)).orderBy(asc(postalServices.name)),
  ]);
  return (
    <div className="space-y-4">
      <div>
        <Link href="/settings" className="text-sm font-bold text-primary">← Settings</Link>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Platforms & postage</h1>
      </div>
      <ListManager kind="platforms" title="Selling platforms" hint="Where you list and sell. Choose them when you list an item or mark it sold. Hide ones you no longer use; past sales keep their history." entries={pl} />
      <ListManager kind="postal" title="Postal services" hint="Choose one when you mark a posted item as sold. Hide ones you no longer use; past sales keep their history." entries={po} />
    </div>
  );
}
