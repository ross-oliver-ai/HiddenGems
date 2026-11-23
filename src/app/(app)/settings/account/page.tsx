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

      <section className="card space-y-3" data-your-data>
        <h2 className="font-extrabold">Your data</h2>
        <p className="text-sm text-muted">
          Download everything you&apos;ve entered as spreadsheets (items, sales, fees, listings, settings and links to your photos). It works on every plan, even after your trial ends.
        </p>
        <a href="/settings/account/download" download className="btn-soft w-full text-center">Download all my data</a>
        <div className="border-t border-border pt-3">
          <Link href="/settings/account/delete" className="text-sm font-bold text-danger">Delete my account</Link>
        </div>
      </section>
    </div>
  );
}
