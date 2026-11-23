import Link from "next/link";
import { requireUser } from "@/lib/auth";

export default async function DeleteAccountPage() {
  const user = await requireUser();
  return (
    <div className="space-y-4">
      <div>
        <Link href="/settings/account" className="text-sm font-bold text-primary">← Account</Link>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Delete my account</h1>
      </div>

      {user.role === "admin" ? (
        <section className="card space-y-2">
          <p className="font-bold">Admin accounts can&apos;t be deleted here.</p>
          <p className="text-sm text-muted">This protects the app from being left without an admin.</p>
        </section>
      ) : (
        <>
          <section className="card space-y-3">
            <h2 className="font-extrabold">This can&apos;t be undone</h2>
            <p className="text-sm text-muted">If you go ahead, we permanently delete:</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              <li>every item, with its sales, fees, postage and history</li>
              <li>all your photos</li>
              <li>your platforms, places, categories and goals</li>
              <li>your sign-in and account details</li>
            </ul>
            <p className="text-sm text-muted">
              Any subscription is cancelled straight away, so nothing more is charged. Stripe keeps its own payment records, as it is required to.
            </p>
          </section>

          <section className="card space-y-3">
            <h2 className="font-extrabold">Want a copy first?</h2>
            <p className="text-sm text-muted">Download everything as spreadsheets. It&apos;s the only chance: once the account is deleted, we can&apos;t get anything back.</p>
            <a href="/settings/account/download" download className="btn-soft w-full text-center">Download all my data</a>
          </section>

          <Link href="/settings/account/delete/confirm" className="btn-danger block w-full text-center" data-delete-continue>
            Continue to delete
          </Link>
        </>
      )}
    </div>
  );
}
