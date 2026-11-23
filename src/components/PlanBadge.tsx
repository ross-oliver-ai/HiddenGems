import type { User } from "@/db/schema";
import { entitlement, fmtDate } from "@/lib/billing";

type PlanUser = Parameters<typeof entitlement>[0] & Pick<User, "role">;

/** A person's plan as a small pill. Always shows what the plan would be, even before billing is switched on. */
export function PlanBadge({ user }: { user: PlanUser }) {
  const ent = entitlement(user, new Date(), true);
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
