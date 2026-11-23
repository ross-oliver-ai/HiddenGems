import Link from "next/link";
import { redirect } from "next/navigation";
import { DeleteAccountForm } from "@/components/DeleteAccountForm";
import { requireUser } from "@/lib/auth";

export default async function ConfirmDeleteAccountPage() {
  const user = await requireUser();
  if (user.role === "admin") redirect("/settings/account/delete");
  return (
    <div className="space-y-4">
      <div>
        <Link href="/settings/account/delete" className="text-sm font-bold text-primary">← Back</Link>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Last step</h1>
      </div>

      <section className="card space-y-3">
        <p className="text-sm text-muted">
          To make sure it&apos;s really you, type your email address and password. When you tap the red button, your account and everything in it is deleted immediately.
        </p>
        <DeleteAccountForm email={user.email} />
      </section>
    </div>
  );
}
