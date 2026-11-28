import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { categories, items, platforms, postalServices, priceChanges, shops } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { daysBetween, money, shortDate, todayLondon } from "@/lib/format";
import { isStale, itemProfit, undoOption } from "@/lib/items";
import { HANDOVER_LABEL, activePlatforms, lastUsedPlatformIds, listingsFor } from "@/lib/listings";
import { StatusPill } from "@/components/StatusPill";
import { StepForm } from "@/components/ActionForm";
import { ItemForm } from "@/components/ItemForm";
import { PhotoViewer } from "@/components/PhotoViewer";
import { PlatformPicker } from "@/components/PlatformPicker";
import { SellFields } from "@/components/SellFields";
import { deleteItemAction, markCheckedAction } from "../actions";

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

function PriceField({ label, defaultValue, id = "price", name = "price", optional }: { label: string; defaultValue?: string | null; id?: string; name?: string; optional?: boolean }) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} name={name} inputMode="decimal" defaultValue={defaultValue ?? ""} placeholder="0.00" required={!optional} className="field" />
    </div>
  );
}

function Step({ title, children, open, tour }: { title: string; children: React.ReactNode; open?: boolean; tour?: string }) {
  return (
    <details open={open} className="card" data-tour={tour}>
      <summary className="cursor-pointer list-none font-extrabold">{title}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const soldPlatform = alias(platforms, "sold_platform");
  const [row] = await db
    .select({ item: items, shop: shops.name, category: categories.name, postal: postalServices.name, soldOn: soldPlatform.name })
    .from(items)
    .leftJoin(shops, eq(items.shopId, shops.id))
    .leftJoin(categories, eq(items.categoryId, categories.id))
    .leftJoin(postalServices, eq(items.postalServiceId, postalServices.id))
    .leftJoin(soldPlatform, eq(items.soldPlatformId, soldPlatform.id))
    .where(and(eq(items.id, id), eq(items.userId, user.id)))
    .limit(1);
  if (!row) notFound();
  const { item } = row;

  const [shopRows, catRows, postalRows, platformRows, itemListings, changes, lastUsed] = await Promise.all([
    db.select({ name: shops.name }).from(shops).where(and(eq(shops.userId, user.id), eq(shops.archived, false))).orderBy(asc(shops.name)),
    db.select({ id: categories.id, name: categories.name }).from(categories).where(and(eq(categories.userId, user.id), eq(categories.archived, false))).orderBy(asc(categories.name)),
    db.select({ id: postalServices.id, name: postalServices.name }).from(postalServices).where(and(eq(postalServices.userId, user.id), eq(postalServices.archived, false))).orderBy(asc(postalServices.name)),
    activePlatforms(user.id),
    listingsFor(id),
    db.select().from(priceChanges).where(eq(priceChanges.itemId, id)).orderBy(desc(priceChanges.changedAt), desc(priceChanges.id)),
    lastUsedPlatformIds(user.id),
  ]);

  const platformName = new Map(itemListings.map((l) => [l.listing.id, l.platform]));
  const live = itemListings.filter((l) => l.listing.endedAt === null);
  const liveIds = new Set(live.map((l) => l.listing.platformId));
  const addable = platformRows.filter((p) => !liveIds.has(p.id));
  const startWith = lastUsed.length ? lastUsed : platformRows[0] ? [platformRows[0].id] : [];

  const profit = itemProfit(item);
  const stale = isStale(item, user.staleAfterDays);
  const s = item.status;
  const soldish = s === "sold" || s === "posted" || s === "completed";
  const undo = undoOption(item);
  const daysToSell = item.soldAt ? daysBetween(item.listedAt ?? item.boughtAt, item.soldAt) : null;
  const handedOverKind = item.handover === "collected" || item.handover === "delivered";

  return (
    // Remount when the item changes so form defaults (prices, dates) never go stale after a step
    <div key={`${s}-${item.updatedAt.getTime()}-${changes.length}-${itemListings.length}`} className="space-y-4">
      <Link href="/items" className="text-sm font-bold text-primary">← Items</Link>

      <div className="card space-y-3">
        {item.photoUrl && <PhotoViewer src={item.photoUrl} alt={item.name} />}
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-extrabold leading-tight">{item.name}</h1>
          <StatusPill status={s} />
        </div>
        {item.aiCheck && (
          <form action={markCheckedAction} className="space-y-2 rounded-xl bg-primary-soft px-3 py-2 text-sm font-bold text-primary" data-ai-check>
            <input type="hidden" name="id" value={item.id} />
            <p>✨ The AI filled in some details after you saved. Please check them (use Edit details below to change anything).</p>
            <button type="submit" className="btn-soft">Looks right</button>
          </form>
        )}
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
          {itemListings.map(({ listing, platform }) => (
            <Row
              key={listing.id}
              label={`Listed on ${platform}`}
              value={
                <>
                  {money(listing.price)} · {shortDate(listing.listedAt)}
                  {listing.endedAt && !soldish && s !== "returned" ? ` (ended ${shortDate(listing.endedAt)})` : ""}
                  {listing.url && (
                    <>
                      {" · "}
                      <a href={listing.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">Open</a>
                    </>
                  )}
                </>
              }
            />
          ))}
          {changes.map((c) => (
            <Row
              key={c.id}
              label={`Price drop ${shortDate(c.changedAt)}`}
              value={`${c.listingId && platformName.get(c.listingId) ? `${platformName.get(c.listingId)}: ` : ""}${money(c.oldPrice)} → ${money(c.newPrice)}`}
            />
          ))}
          {item.soldAt && <Row label="Sold" value={`${shortDate(item.soldAt)} · ${money(item.soldPrice)}`} />}
          {item.soldAt && Number(item.fees) > 0 && <Row label="Fees" value={`−${money(item.fees)}`} />}
          {item.soldAt && Number(item.postagePaid) > 0 && <Row label="Postage I paid" value={`−${money(item.postagePaid)}`} />}
          {row.soldOn && <Row label="Sold on" value={row.soldOn} />}
          {daysToSell !== null && <Row label="Days to sell" value={daysToSell} />}
          {item.handover && <Row label="How it got there" value={HANDOVER_LABEL[item.handover]} />}
          {row.postal && item.handover !== "collected" && item.handover !== "delivered" && <Row label="Postage" value={row.postal} />}
          {item.postedAt && <Row label={handedOverKind ? "Handed over" : "Posted"} value={shortDate(item.postedAt)} />}
          {item.returnedAt && <Row label="Returned" value={`${shortDate(item.returnedAt)} · refund ${money(item.refundAmount)}`} />}
          {row.category && <Row label="Category" value={row.category} />}
          {item.brand && <Row label="Brand" value={item.brand} />}
          {item.size && <Row label="Size" value={item.size} />}
          {item.condition && <Row label="Condition" value={item.condition} />}
        </dl>
        {item.notes && <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm">{item.notes}</p>}
      </div>

      {/* What's next */}
      {s === "bought" && (
        <Step title="List it" open tour="list-step">
          <StepForm itemId={id} intent="list" label="Mark as listed">
            <DateField label="Date listed" />
            <PlatformPicker platforms={platformRows} initialSelected={startWith} />
          </StepForm>
        </Step>
      )}

      {s === "listed" && (
        <>
          <Step title="It sold! 🎉" open tour="sell-step">
            <StepForm itemId={id} intent="sell" label="Mark as sold">
              <DateField label="Date sold" />
              <SellFields
                live={live.map((l) => ({ platformId: l.listing.platformId, name: l.platform, price: l.listing.price, feePercent: platformRows.find((p) => p.id === l.listing.platformId)?.feePercent ?? "0" }))}
                others={addable}
                fallbackPrice={item.listPrice ?? ""}
                postalServices={postalRows}
              />
            </StepForm>
          </Step>
          <Step title="Reduce the price">
            <StepForm itemId={id} intent="reduce" label="Save new prices" tone="soft">
              <DateField label="Date changed" />
              {live.map((l) => (
                <PriceField key={l.listing.id} id={`reduce_${l.listing.id}`} name={`price_${l.listing.id}`} label={`${l.platform} price (£)`} defaultValue={l.listing.price} />
              ))}
            </StepForm>
          </Step>
          {addable.length > 0 && (
            <Step title="Also list on…">
              <StepForm itemId={id} intent="listmore" label="Add listing" tone="soft">
                <DateField label="Date listed" />
                <PlatformPicker platforms={addable} initialSelected={[]} defaultPrice={item.listPrice ?? ""} />
              </StepForm>
            </Step>
          )}
        </>
      )}

      {s === "sold" && (handedOverKind ? (
        <Step title="Handed over to the buyer" open>
          <StepForm itemId={id} intent="handover" label="Mark as handed over">
            <DateField label="Date handed over" />
          </StepForm>
        </Step>
      ) : (
        <Step title="Posted it" open>
          <StepForm itemId={id} intent="post" label="Mark as posted">
            <DateField label="Date posted" />
          </StepForm>
        </Step>
      ))}
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
      {undo && <StepForm itemId={id} intent="undo" label={undo.label} tone="soft" confirm={undo.confirm} />}
      {s === "returned" && (
        <Step title="Back in stock: list it again" open>
          <StepForm itemId={id} intent="relist" label="List it again">
            <DateField label="Date relisted" />
            <PlatformPicker platforms={platformRows} initialSelected={startWith} defaultPrice={item.listPrice ?? ""} />
          </StepForm>
        </Step>
      )}

      {(s === "bought" || s === "listed") && (
        <Step title="Give up on it">
          <div className="space-y-3">
            {s === "listed" && live.length > 1 &&
              live.map((l) => (
                <StepForm key={l.listing.id} itemId={id} intent="endlisting" label={`Take off ${l.platform}`} tone="soft">
                  <input type="hidden" name="listingId" value={l.listing.id} />
                </StepForm>
              ))}
            {s === "listed" && (
              <StepForm itemId={id} intent="unlist" label={live.length > 1 ? "Take off everywhere (back to to-list)" : `Take off ${live[0]?.platform ?? "sale"} (back to to-list)`} tone="soft" />
            )}
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
          platforms={platformRows}
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
            listings: itemListings.map(({ listing, platform }) => ({
              id: listing.id,
              platform,
              price: listing.price,
              url: listing.url,
              listedAt: listing.listedAt,
              ended: listing.endedAt !== null,
            })),
            soldAt: item.soldAt,
            soldPrice: item.soldPrice,
            fees: item.fees,
            postagePaid: item.postagePaid,
            soldPlatformId: item.soldPlatformId,
            handover: item.handover,
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
