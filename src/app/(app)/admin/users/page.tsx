import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { CreateUserForm, ResetPasswordForm } from "@/components/AdminForms";
import { toggleDisabledAction } from "./actions";

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
                {u.mustChangePassword && !u.disabled && <span className="rounded-full bg-warning/15 px-2.5 py-1 text-warning">Temp password</span>}
              </div>
            </div>
            {u.id !== admin.id && (
              <details className="group">
                <summary className="btn-soft cursor-pointer list-none">Manage</summary>
                <div className="mt-3 space-y-3">
                  <ResetPasswordForm userId={u.id} />
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
