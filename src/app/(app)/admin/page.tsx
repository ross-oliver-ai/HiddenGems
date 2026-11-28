import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { percent } from "@/lib/format";
import { PLAN_GROUP_LABEL, agoLabel, computeUsage, type PlanGroup, type UsageSeller } from "@/lib/usage";
import { loadActivity, loadUsers, waitingCount } from "@/lib/usage-data";
import { alertRecipient, recentAlerts } from "@/lib/alerts";
import { TestAlertForm } from "@/components/TestAlertForm";
import { RefreshButton } from "@/components/RefreshButton";
import { lastJobRun } from "@/lib/job-runs";
import { DAILY_JOB, jobStatus } from "@/lib/job-status";
import { aiKeyPresent, aiMonthSummary, getAiSettings } from "@/lib/ai-service";
import { microUsdToPounds, poundsLabel } from "@/lib/ai-pricing";

function Stat({ value, label, href }: { value: string | number; label: string; href?: string }) {
  const body = (
    <>
      <p className="text-3xl font-extrabold leading-none">{value}</p>
      <p className="mt-1 text-xs font-bold text-muted">{label}</p>
    </>
  );
  return href ? <Link href={href} className="card block p-3">{body}</Link> : <div className="card p-3">{body}</div>;
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="pt-2 text-sm font-extrabold uppercase tracking-wider text-muted">{children}</h2>;
}

function Person({ s, now, extra }: { s: UsageSeller; now: Date; extra?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate font-bold">{s.name}</p>
        <p className="truncate text-xs text-muted">{s.email}</p>
      </div>
      <div className="shrink-0 text-right text-xs text-muted">
        <p className="font-bold text-foreground">{extra ?? PLAN_GROUP_LABEL[s.group]}</p>
        <p>{s.items === 0 ? "No items yet" : `${s.items} item${s.items === 1 ? "" : "s"} · active ${agoLabel(s.lastActive, now)}`}</p>
      </div>
    </div>
  );
}

export default async function AdminOverviewPage() {
  await requireAdmin();
  const now = new Date();
  const [users, activity, waiting, alerts, jobRow, aiSettings, aiMonth] = await Promise.all([loadUsers(), loadActivity(), waitingCount(), recentAlerts(), lastJobRun(DAILY_JOB), getAiSettings(), aiMonthSummary()]);
  const u = computeUsage(users, activity, now);
  const job = jobStatus(jobRow, now);
  const conv = u.trials.ended === 0 ? null : percent((u.trials.subscribed / u.trials.ended) * 100);
  const planOrder: PlanGroup[] = ["trial", "paid", "failed", "readonly", "free"];

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/settings" className="text-sm font-bold text-primary">← Settings</Link>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Overview</h1>
          <p className="text-sm text-muted">Everyone except admins. &ldquo;Active&rdquo; means they added or changed an item.</p>
        </div>
        <RefreshButton label="Refresh the figures" />
      </div>

      <Heading>Sign-ups</Heading>
      <div className="grid grid-cols-2 gap-3">
        <Stat value={u.sellers} label="accounts" href="/admin/users" />
        <Stat value={u.signups.last7} label="joined in the last 7 days" />
        <Stat value={u.signups.last30} label="joined in the last 30 days" />
        <Stat value={u.signups.unconfirmed} label="haven't confirmed their email" href="/admin/users?show=unconfirmed" />
      </div>

      <Heading>Are they using it?</Heading>
      <div className="grid grid-cols-2 gap-3">
        <Stat value={`${u.started.withItems} of ${u.sellers}`} label="have added an item" />
        <Stat value={u.started.never} label="never added one" href="/admin/users?show=noitems" />
        <Stat value={u.active.last7} label="active in the last 7 days" />
        <Stat value={u.active.last30} label="active in the last 30 days" />
      </div>

      <Heading>Plans</Heading>
      <div className="grid grid-cols-2 gap-3">
        {planOrder.map((g) => (
          <Stat key={g} value={u.plans[g]} label={PLAN_GROUP_LABEL[g]} href={`/admin/users?show=${g}`} />
        ))}
      </div>

      <Heading>Trial to paid</Heading>
      <section className="card space-y-1">
        {conv === null ? (
          <p className="text-sm text-muted">No free trial has ended yet, so there is nothing to measure.</p>
        ) : (
          <>
            <p className="text-3xl font-extrabold leading-none">{conv}</p>
            <p className="text-sm font-bold">{u.trials.subscribed} of {u.trials.ended} finished trials chose to subscribe</p>
            <p className="text-xs text-muted">Counts anyone who ever subscribed, even if they have since cancelled. Free-forever accounts are left out. With only a few people, one person moves this a lot.</p>
          </>
        )}
      </section>

      <Heading>Trials ending within 7 days</Heading>
      <section className="card divide-y divide-border py-1">
        {u.endingSoon.length === 0 ? (
          <p className="py-2 text-sm text-muted">None.</p>
        ) : (
          u.endingSoon.map((s) => <Person key={s.id} s={s} now={now} extra={s.daysLeft === 0 ? "Ends today" : `${s.daysLeft} day${s.daysLeft === 1 ? "" : "s"} left`} />)
        )}
      </section>

      <Heading>Newest sign-ups</Heading>
      <section className="card divide-y divide-border py-1">
        {u.recent.length === 0 ? <p className="py-2 text-sm text-muted">No one yet.</p> : u.recent.map((s) => <Person key={s.id} s={s} now={now} />)}
      </section>

      <Heading>Across the whole app</Heading>
      <div className="grid grid-cols-2 gap-3">
        <Stat value={u.totals.items} label="items recorded" />
        <Stat value={u.totals.sales30} label="items sold in the last 30 days" />
        {waiting !== null && <Stat value={waiting} label="on the waitlist, not yet invited" href="/admin/waitlist" />}
      </div>

      <Heading>AI photo fill</Heading>
      <Link href="/admin/ai" className="card block space-y-1" data-ai-overview>
        <p className="text-sm font-bold">{aiSettings.enabled && aiKeyPresent() ? "✅ On" : aiSettings.enabled ? "⚠️ On, but no key on the server" : "Off"}</p>
        <p className="text-sm text-muted">{aiMonth.requests} suggestion{aiMonth.requests === 1 ? "" : "s"} this month, about {poundsLabel(microUsdToPounds(aiMonth.costMicroUsd))} of £{aiSettings.monthlyBudgetPounds}. Tap to change the settings.</p>
      </Link>

      <Heading>Daily job</Heading>
      <section className="card space-y-1" data-daily-job={job.state}>
        <p className={`text-sm font-bold ${job.state === "failed" ? "text-danger" : job.state === "overdue" ? "text-warning" : ""}`}>{job.state === "ok" ? "✅ " : job.state === "never" ? "" : "⚠️ "}{job.headline}</p>
        {job.detail && <p className="text-sm text-muted">{job.detail}</p>}
        <p className="text-xs text-muted">The job that sends trial-reminder emails and tidies old error alerts. It should run every day.</p>
      </section>

      <Heading>Error alerts</Heading>
      <section className="card space-y-3" data-error-alerts>
        <p className="text-sm text-muted">
          When something breaks on the server, an email goes to {alertRecipient()}: one per problem per hour, never more than 20 different problems a day, and nothing about any customer. Problems are forgotten after 30 days without recurring.
        </p>
        {alerts.length === 0 ? (
          <p className="text-sm font-bold">No problems recorded. 🎉</p>
        ) : (
          <div className="divide-y divide-border">
            {alerts.map((a) => (
              <div key={a.signature} className="py-2">
                <p className="text-sm font-bold">
                  {a.isTest ? "Test alert" : a.source}
                  {a.route ? <span className="font-normal text-muted"> · {a.route}</span> : null}
                </p>
                {!a.isTest && <p className="break-words text-xs text-muted">{a.message}</p>}
                <p className="text-xs text-muted">
                  {a.count} time{a.count === 1 ? "" : "s"} · last {agoLabel(a.lastSeenAt, now)}
                </p>
              </div>
            ))}
          </div>
        )}
        <TestAlertForm />
      </section>
    </div>
  );
}
