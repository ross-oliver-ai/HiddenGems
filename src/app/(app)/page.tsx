import Link from "next/link";
import { Confetti } from "@/components/Confetti";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { items } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { daysBetween, money, todayLondon } from "@/lib/format";
import { computeReport } from "@/lib/reports";
import { Checklist } from "@/components/Checklist";
import { checklistAvailable, checklistFacts } from "@/lib/checklist";
import { checklistDone, checklistSteps } from "@/lib/checklist-steps";

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
  const waiting = get("posted")?.n ?? 0;
  const stockValue = Number(get("bought")?.cost ?? 0) + Number(get("listed")?.cost ?? 0);

  const listedRows = await db
    .select({ listedAt: items.listedAt })
    .from(items)
    .where(and(eq(items.userId, user.id), inArray(items.status, ["listed"])));
  const today = todayLondon();
  const stale = listedRows.filter((r) => r.listedAt && daysBetween(r.listedAt, today) >= user.staleAfterDays).length;

  // Monthly goal progress (only when a goal is set)
  const goal = user.monthlyProfitGoal !== null ? (await computeReport(user, { p: "month" })).goal : null;
  const goalPct = goal && goal.target > 0 ? Math.max(0, Math.min(100, Math.round((goal.current / goal.target) * 100))) : 0;
  const goalMet = !!goal && goal.target > 0 && goal.current >= goal.target;

  // The first-run checklist: new accounts only, until they hide it or finish it
  const steps = checklistAvailable(user) ? checklistSteps(await checklistFacts(user)) : null;
  const showChecklist = !!steps && !checklistDone(steps);

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

      {goal && (
        <Link href="/reports" className="card block space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="font-extrabold">This month&apos;s goal</h2>
            <p className="text-sm font-bold">{goal.current < 0 ? "−" : ""}{money(Math.abs(goal.current))} of {money(goal.target)}</p>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-primary-soft" role="progressbar" aria-valuenow={goalPct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-primary" style={{ width: `${goalPct}%` }} />
          </div>
          {goalMet && (
            <>
              <p className="text-sm font-bold text-primary">🎉 Goal smashed!</p>
              <Confetti />
            </>
          )}
        </Link>
      )}

      {showChecklist && <Checklist steps={steps!} />}

      <div className="grid grid-cols-2 gap-3">
        {tile("To list", toList, "/items?f=bought", toList > 0)}
        {tile("Listed now", listed, "/items?f=listed")}
        {tile("To send", toPost, "/items?f=send", toPost > 0)}
        {tile("Waiting for money", waiting, "/items?f=waiting", waiting > 0)}
        {tile("Stock value (at cost)", money(stockValue), "/items?f=stock")}
      </div>

      {stale > 0 && (
        <Link href="/items?f=listed" className="card block bg-warning/10 font-bold text-warning">
          {stale} listing{stale === 1 ? "" : "s"} listed for {user.staleAfterDays}+ days: maybe drop the price?
        </Link>
      )}

      {!showChecklist && toList + listed + toPost + waiting === 0 && (
        <div className="card space-y-3 text-center">
          <p className="font-bold">Nothing in stock yet</p>
          <Link href="/items/new" className="btn">Add your first find</Link>
        </div>
      )}
      <Link href="/reports" className="btn-soft w-full">See your reports</Link>
    </div>
  );
}
