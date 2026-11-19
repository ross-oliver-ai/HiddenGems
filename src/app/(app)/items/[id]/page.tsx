import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, items, postalServices, priceChanges, shops } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { daysBetween, money, shortDate, todayLondon } from "@/lib/format";
import { isStale, itemProfit } from "@/lib/items";
import { StatusPill } from "@/components/StatusPill";
import { StepForm } from "@/components/ActionForm";
import { ItemForm } from "@/components/ItemForm";
import { PhotoViewer } from "@/components/PhotoViewer";
import { deleteItemAction } from "../actions";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-bold">{value}</dd>
    </div>
  );
}

function DateField({ id = "date", label = "Date" }: { id?: string; label?: string }) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} name="date" type="date" defaultValue={todayLondon()} required className="field" />
    </div>
  );
}

function PriceField({ label, defaultValue, id = "price", optional }: { label: string; defaultValue?: string | null; id?: string; optional?: boolean }) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} name="price" inputMode="decimal" defaultValue={defaultValue ?? ""} placeholder="0.00" required={!optional} className="field" />
    </div>
  );
}

function Step({ title, children, open }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="card">
      <summary className="cursor-pointer list-none font-extrabold">{title}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const [row] = await db
    .select({ item: items, shop: shops.name, category: categories.name, postal: postalServices.name })
    .from(items)
    .leftJoin(shops, eq(items.shopId, shops.id))
    .leftJoin(categories, eq(items.categoryId, categories.id))
    .leftJoin(postalServices, eq(items.postalServiceId, postalServices.id))
    .where(and(eq(items.id, id), eq(items.userId, user.id)))
    .limit(1);
  if (!row) notFound();
  const { item } = row;

  const [shopRows, catRows, postalRows, changes] = await Promise.all([
    db.select({ name: shops.name }).from(shops).where(and(eq(shops.userId, user.id), eq(shops.archived, false))).orderBy(asc(shops.name)),
    db.select({ id: categories.id, name: categories.name }).from(categories).where(and(eq(categories.userId, user.id), eq(categories.archived, false))).orderBy(asc(categories.name)),
    db.select({ id: postalServices.id, name: postalServices.name }).from(postalServices).where(and(eq(postalServices.userId, user.id), eq(postalServices.archived, false))).orderBy(asc(postalServices.name)),
    db.select().from(priceChanges).where(eq(priceChanges.itemId, id)).orderBy(desc(priceChanges.changedAt), desc(priceChanges.id)),
  ]);

  const profit = itemProfit(item);
  const stale = isStale(item, user.staleAfterDays);
  const s = item.status;
  const soldish = s === "sold" || s === "posted" || s === "completed";
  const daysToSell = item.soldAt ? daysBetween(item.listedAt ?? item.boughtAt, item.soldAt) : null;

  return (
    // Remount when the item changes so form defaults (prices, dates) never go stale after a step
    <div key={`${s}-${item.updatedAt.getTime()}-${changes.length}`} className="space-y-4">
      <Link href="/items" className="text-sm font-bold text-primary">← Items</Link>

      <div className="card space-y-3">
        {item.photoUrl && <PhotoViewer src={item.photoUrl} alt={item.name} />}
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-extrabold leading-tight">{item.name}</h1>
          <StatusPill status={s} />
        </div>
        {stale && item.listedAt && (
          <p className="rounded-xl bg-warning/15 px-3 py-2 text-sm font-bold text-warning">
            Listed for {daysBetween(item.listedAt)} days. Time for a price drop?
          </p>
        )}
        {profit !== null && (
          <p className={`text-3xl font-extrabold ${profit >= 0 ? "text-success" : "text-danger"}`}>
            {profit >= 0 ? "+" : "−"}{money(Math.abs(profit))}
            <span className="ml-2 text-sm font-bold text-muted">{profit >= 0 ? "profit" : "loss"}</span>
          </p>
        )}
        <dl className="divide-y divide-border">
          <Row label="Bought" value={`${shortDate(item.boughtAt)}${row.shop ? ` · ${row.shop}` : ""}`} />
          <Row label="Paid" value={money(item.buyPrice)} />
          {item.listedAt && <Row label="Listed" value={`${shortDate(item.listedAt)} · ${money(item.listPrice)}`} />}
          {changes.map((c) => (
            <Row key={c.id} label={`Price drop ${shortDate(c.changedAt)}`} value={`${money(c.oldPrice)} → ${money(c.newPrice)}`} />
          ))}
          {item.soldAt && <Row label="Sold" value={`${shortDate(item.soldAt)} · ${money(item.soldPrice)}`} />}
          {daysToSell !== null && <Row label="Days to sell" value={daysToSell} />}
          {row.postal && <Row label="Postage" value={row.postal} />}
          {item.postedAt && <Row label="Posted" value={shortDate(item.postedAt)} />}
          {item.returnedAt && <Row label="Returned" value={`${shortDate(item.returnedAt)} · refund ${money(item.refundAmount)}`} />}
          {row.category && <Row label="Category" value={row.category} />}
          {item.brand && <Row label="Brand" value={item.brand} />}
          {item.size && <Row label="Size" value={item.size} />}
          {item.condition && <Row label="Condition" value={item.condition} />}
          {item.vintedUrl && (
            <Row label="Vinted" value={<a href={item.vintedUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">Open listing</a>} />
          )}
        </dl>
        {item.notes && <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm">{item.notes}</p>}
      </div>

      {/* What's next */}
      {s === "bought" && (
        <Step title="List on Vinted" open>
          <StepForm itemId={id} intent="list" label="Mark as listed">
            <DateField label="Date listed" />
            <PriceField label="Asking price (£)" />
            <div>
              <label className="label" htmlFor="url">Vinted link (optional)</label>
              <input id="url" name="url" type="url" inputMode="url" placeholder="https://www.vinted.co.uk/items/…" className="field" />
            </div>
          </StepForm>
        </Step>
      )}

      {s === "listed" && (
        <>
          <Step title="It sold! 🎉" open>
            <StepForm itemId={id} intent="sell" label="Mark as sold">
              <DateField label="Date sold" />
              <PriceField label="Sold for (£)" defaultValue={item.listPrice} />
              <div>
                <label className="label" htmlFor="postalServiceId">Postage service</label>
                <select id="postalServiceId" name="postalServiceId" className="field" defaultValue="">
                  <option value="">Choose later</option>
                  {postalRows.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </StepForm>
          </Step>
          <Step title="Reduce the price">
            <StepForm itemId={id} intent="reduce" label="Save new price" tone="soft">
              <DateField label="Date changed" />
              <PriceField label="New asking price (£)" defaultValue={item.listPrice} />
            </StepForm>
          </Step>
        </>
      )}

      {s === "sold" && (
        <Step title="Posted it" open>
          <StepForm itemId={id} intent="post" label="Mark as posted">
            <DateField label="Date posted" />
          </StepForm>
        </Step>
      )}
      {s === "posted" && (
        <Step title="Buyer received it, money in" open>
          <StepForm itemId={id} intent="complete" label="Mark as completed" />
        </Step>
      )}
      {soldish && (
        <Step title="Returned / refunded">
          <StepForm itemId={id} intent="return" label="Record return" tone="danger">
            <DateField label="Date returned" />
            <PriceField label="Amount refunded (£)" defaultValue={item.soldPrice} />
          </StepForm>
        </Step>
      )}
      {s === "returned" && (
        <Step title="Back in stock: relist it" open>
          <StepForm itemId={id} intent="relist" label="Relist on Vinted">
            <DateField label="Date relisted" />
            <PriceField label="Asking price (£)" defaultValue={item.listPrice} />
          </StepForm>
        </Step>
      )}

      {(s === "bought" || s === "listed") && (
        <Step title="Give up on it">
          <div className="space-y-3">
            {s === "listed" && <StepForm itemId={id} intent="unlist" label="Take off Vinted (back to to-list)" tone="soft" />}
            <StepForm itemId={id} intent="unsold" label="Mark as unsold (write off)" tone="soft" />
            <StepForm itemId={id} intent="donate" label="Donated back to charity" tone="soft" />
          </div>
        </Step>
      )}
      {(s === "unsold" || s === "donated") && (
        <StepForm itemId={id} intent="reopen" label="Put back in stock" tone="soft" />
      )}

      <Step title="Edit details">
        <ItemForm
          mode="edit"
          shops={shopRows.map((x) => x.name)}
          categories={catRows}
          postalServices={postalRows}
          values={{
            id,
            name: item.name,
            buyPrice: item.buyPrice,
            boughtAt: item.boughtAt,
            shop: row.shop ?? "",
            categoryId: item.categoryId,
            brand: item.brand,
            size: item.size,
            condition: item.condition,
            notes: item.notes,
            photoUrl: item.photoUrl,
            listedAt: item.listedAt,
            listPrice: item.listPrice,
            vintedUrl: item.vintedUrl,
            soldAt: item.soldAt,
            soldPrice: item.soldPrice,
            postalServiceId: item.postalServiceId,
            postedAt: item.soldAt ? item.postedAt : undefined,
          }}
        />
      </Step>

      <form action={deleteItemAction}>
        <input type="hidden" name="id" value={id} />
        <details className="card">
          <summary className="cursor-pointer list-none font-extrabold text-danger">Delete item</summary>
          <p className="mt-2 text-sm text-muted">This permanently removes the item and its history.</p>
          <button type="submit" className="btn-danger mt-3 w-full">Yes, delete it</button>
        </details>
      </form>
    </div>
  );
}
