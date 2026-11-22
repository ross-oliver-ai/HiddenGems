import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { TargetsForm } from "@/components/TargetsForm";

export default async function TargetsPage() {
  const user = await requireUser();
  return (
    <div className="space-y-4">
      <div>
        <Link href="/settings" className="text-sm font-bold text-primary">← Settings</Link>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Targets</h1>
      </div>
      <section className="card space-y-3">
        <TargetsForm goal={user.monthlyProfitGoal} stale={user.staleAfterDays} />
      </section>
    </div>
  );
}
