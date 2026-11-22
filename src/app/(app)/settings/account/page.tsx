import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { ChangeEmailForm } from "@/components/ChangeEmailForm";

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="space-y-4">
      <div>
        <Link href="/settings" className="text-sm font-bold text-primary">← Settings</Link>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Account</h1>
      </div>

      <section className="card space-y-3">
        <h2 className="font-extrabold">Change email</h2>
        <ChangeEmailForm currentEmail={user.email} />
      </section>

      <section className="card space-y-3">
        <h2 className="font-extrabold">Change password</h2>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
