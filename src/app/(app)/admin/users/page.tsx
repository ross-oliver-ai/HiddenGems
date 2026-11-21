import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { CreateUserForm, ResetPasswordForm } from "@/components/AdminForms";
import { entitlement, fmtDate } from "@/lib/billing";
import { extendTrialAction, toggleDisabledAction, toggleExemptAction } from "./actions";

export default async function AdminUsersPage() {
  const admin = await requireAdmin();
  const all = await db.select().from(users).orderBy(asc(users.createdAt));
  return (
    <div className="space-y-4">
      <div>
        <Link href="/settings" className="text-sm font-bold text-primary">← Settings</Link>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Users</h1>
      </div>

      <section className="card space-y-3">
        <h2 className="font-extrabold">Add a user</h2>
        <CreateUserForm />
      </section>

      <section className="space-y-3">
        {all.map((u) => (
          <div key={u.id} className="card space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-extrabold">{u.name}</p>
                <p className="truncate text-sm text-muted">{u.email}</p>
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
                  <ResetPasswordForm userId={u.id} />
                  <form action={toggleExemptAction}>
                    <input type="hidden" name="userId" value={u.id} />
                    <button type="submit" className="btn-soft w-full">{u.billingExempt ? "Remove free-forever" : "Make free forever"}</button>
                  </form>
                  {!u.billingExempt && (
                    <form action={extendTrialAction}>
                      <input type="hidden" name="userId" value={u.id} />
                      <button type="submit" className="btn-soft w-full">Extend trial by 14 days</button>
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
        ))}
      </section>
    </div>
  );
}

function PlanBadge({ user }: { user: User }) {
  const ent = entitlement(user, new Date(), true); // always show what the plan would be, even before billing is switched on
  let label: string;
  let tone = "bg-primary-soft text-primary";
  if (ent.state === "exempt") label = user.role === "admin" ? "No billing" : "Free forever";
  else if (ent.state === "subscribed") label = ent.endsOn ? `Paid to ${fmtDate(ent.endsOn)}` : "Subscribed";
  else if (ent.state === "past_due") {
    label = "Payment failed";
    tone = "bg-warning/15 text-warning";
  } else if (ent.state === "trial") label = `Trial: ${ent.daysLeft}d left`;
  else {
    label = "Read-only";
    tone = "bg-danger/10 text-danger";
  }
  return <span className={`rounded-full px-2.5 py-1 ${tone}`}>{label}</span>;
}
