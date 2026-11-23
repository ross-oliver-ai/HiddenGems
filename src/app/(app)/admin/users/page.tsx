import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { ChangeEmailAdminForm, CreateUserForm, ResetPasswordForm } from "@/components/AdminForms";
import { entitlement } from "@/lib/billing";
import { PlanBadge } from "@/components/PlanBadge";
import { NO_ACTIVITY, PLAN_GROUP_LABEL, agoLabel, planGroup, type PlanGroup } from "@/lib/usage";
import { loadActivity, loadUsers } from "@/lib/usage-data";
import { ConfirmButton } from "@/components/ConfirmButton";
import { endTrialNowAction, extendTrialAction, toggleDisabledAction, toggleExemptAction } from "./actions";

const SHOWS = ["all", "trial", "paid", "failed", "readonly", "free", "unconfirmed", "noitems"] as const;
type Show = (typeof SHOWS)[number];
const SHOW_LABEL: Record<Show, string> = { all: "All", ...PLAN_GROUP_LABEL, unconfirmed: "Not confirmed", noitems: "No items yet" };

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const show: Show = (SHOWS as readonly string[]).includes(sp.show ?? "") ? (sp.show as Show) : "all";
  const now = new Date();
  const [everyone, activity] = await Promise.all([loadUsers(), loadActivity()]);
  everyone.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id); // newest first
  const sellers = everyone.filter((u) => u.role !== "admin");
  const matches = (u: (typeof everyone)[number], s: Show) =>
    s === "all" ? true
    : u.role === "admin" ? false
    : s === "unconfirmed" ? !u.emailVerifiedAt
    : s === "noitems" ? (activity.get(u.id) ?? NO_ACTIVITY).items === 0
    : planGroup(u, now) === (s as PlanGroup);
  const all = everyone.filter((u) => matches(u, show));
  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin" className="text-sm font-bold text-primary">← Overview</Link>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Users</h1>
        <p className="text-sm text-muted">Newest first.</p>
      </div>

      <nav aria-label="Show" className="flex flex-wrap gap-2" data-user-filters>
        {SHOWS.map((s) => {
          const n = s === "all" ? everyone.length : sellers.filter((u) => matches(u, s)).length;
          const on = s === show;
          return (
            <Link
              key={s}
              href={s === "all" ? "/admin/users" : `/admin/users?show=${s}`}
              aria-current={on ? "page" : undefined}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold ${on ? "border-primary bg-primary text-primary-contrast" : "border-border bg-surface text-muted"}`}
            >
              {SHOW_LABEL[s]} {n}
            </Link>
          );
        })}
      </nav>

      <details className="card" data-add-user>
        <summary className="cursor-pointer list-none font-extrabold">Add a user <span aria-hidden className="text-primary">+</span></summary>
        <div className="mt-3">
          <CreateUserForm />
        </div>
      </details>

      <section className="space-y-3">
        {all.length === 0 && <p className="card text-center text-muted">No one matches.</p>}
        {all.map((u) => {
          const state = entitlement(u, now, true).state;
          const act = activity.get(u.id) ?? NO_ACTIVITY;
          return (
          <div key={u.id} className="card space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-extrabold">{u.name}</p>
                <p className="truncate text-sm text-muted">{u.email}</p>
                {u.role !== "admin" && (
                  <p className="mt-1 text-xs text-muted">
                    Joined {agoLabel(u.createdAt, now)} · {act.items === 0 ? "no items yet" : `${act.items} item${act.items === 1 ? "" : "s"}, active ${agoLabel(act.lastActive, now)}`}{u.emailVerifiedAt ? "" : " · email not confirmed"}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-xs font-bold">
                <span className="rounded-full bg-primary-soft px-2.5 py-1 text-primary">{u.role === "admin" ? "Admin" : "Seller"}</span>
                {u.disabled && <span className="rounded-full bg-danger/10 px-2.5 py-1 text-danger">Disabled</span>}
                <PlanBadge user={u} />
                {u.mustChangePassword && !u.disabled && <span className="rounded-full bg-warning/15 px-2.5 py-1 text-warning">Temp password</span>}
              </div>
            </div>
            {u.id !== admin.id && (
              <details className="group">
                <summary className="btn-soft cursor-pointer list-none">Manage</summary>
                <div className="mt-3 space-y-3">
                  <ChangeEmailAdminForm userId={u.id} email={u.email} />
                  <ResetPasswordForm userId={u.id} />
                  <form action={toggleExemptAction}>
                    <input type="hidden" name="userId" value={u.id} />
                    <button type="submit" className="btn-soft w-full">{u.billingExempt ? "Remove free-forever" : "Make free forever"}</button>
                  </form>
                  {(state === "trial" || state === "locked") && (
                    <form action={extendTrialAction}>
                      <input type="hidden" name="userId" value={u.id} />
                      <ConfirmButton message={`Give ${u.name} 14 more days of free trial?`}>Extend trial by 14 days</ConfirmButton>
                    </form>
                  )}
                  {state === "trial" && (
                    <form action={endTrialNowAction}>
                      <input type="hidden" name="userId" value={u.id} />
                      <ConfirmButton message={`End ${u.name}'s free trial now? Their account becomes read-only until they subscribe.`}>End trial now</ConfirmButton>
                    </form>
                  )}
                  <form action={toggleDisabledAction}>
                    <input type="hidden" name="userId" value={u.id} />
                    <button type="submit" className="btn-danger w-full">
                      {u.disabled ? "Re-enable account" : "Disable account"}
                    </button>
                  </form>
                </div>
              </details>
            )}
          </div>
          );
        })}
      </section>
    </div>
  );
}
