import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { waitlist, type WaitlistEntry } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { CopyEmails } from "@/components/CopyEmails";
import { shortDate } from "@/lib/format";
import { toggleInvitedAction, removeWaitlistAction } from "./actions";

export default async function WaitlistPage() {
  await requireAdmin();
  let rows: WaitlistEntry[] = [];
  let missing = false;
  try {
    rows = await db.select().from(waitlist).orderBy(desc(waitlist.createdAt));
  } catch {
    missing = true;
  }
  const waiting = rows.filter((r) => !r.invitedAt);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/settings" className="text-sm font-bold text-primary">← Settings</Link>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Waitlist</h1>
      </div>

      {missing ? (
        <section className="card space-y-1">
          <p className="font-extrabold">The waitlist isn&apos;t set up yet</p>
          <p className="text-sm text-muted">Go to Settings and tap “Update database”, then come back here.</p>
        </section>
      ) : (
        <>
          <section className="card flex items-center justify-between gap-3">
            <div>
              <p className="text-3xl font-extrabold">{waiting.length}</p>
              <p className="text-sm font-bold text-muted">waiting for an invite ({rows.length} in total)</p>
            </div>
            {waiting.length > 0 && <CopyEmails emails={waiting.map((r) => r.email)} />}
          </section>

          {rows.length === 0 && <p className="card text-center text-muted">No sign-ups yet.</p>}

          <section className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="card space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{r.email}</p>
                    <p className="text-xs text-muted">Joined {shortDate(r.createdAt.toISOString().slice(0, 10))}</p>
                  </div>
                  {r.invitedAt && <span className="shrink-0 rounded-full bg-success/10 px-2.5 py-1 text-xs font-bold text-success">Invited</span>}
                </div>
                <div className="flex gap-2">
                  <form action={toggleInvitedAction} className="flex-1">
                    <input type="hidden" name="id" value={r.id} />
                    <button className="btn-soft w-full">{r.invitedAt ? "Mark as not invited" : "Mark as invited"}</button>
                  </form>
                  <form action={removeWaitlistAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="btn-danger" aria-label={`Remove ${r.email}`}>Remove</button>
                  </form>
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
