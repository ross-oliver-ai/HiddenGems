import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms · Hidden Gems" };

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl space-y-5 px-5 py-8">
      <Link href="/" className="text-sm font-bold text-primary">← Hidden Gems</Link>
      <h1 className="text-3xl font-extrabold tracking-tight">Terms of use</h1>
      <p className="text-muted">A plain-English summary of how Hidden Gems works. Please read it before creating an account.</p>

      <section className="space-y-2">
        <h2 className="text-lg font-extrabold">What Hidden Gems is</h2>
        <p>Hidden Gems is a tool for keeping track of the things you buy and sell, and for seeing your spending, stock and profit. It doesn&apos;t sell anything for you, and it isn&apos;t connected to any marketplace.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-extrabold">Your account</h2>
        <p>Keep your password private, and use an email address you own. You&apos;re responsible for what happens under your account. You can stop using Hidden Gems at any time.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-extrabold">Your data</h2>
        <p>What you enter is yours, and it&apos;s private to you. We don&apos;t sell it or share it. We&apos;ll keep it safe to the best of our ability, but please keep your own copy of anything important: the reports can be downloaded as a spreadsheet.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-extrabold">Free trial and subscription</h2>
        <p>Every new account starts with a free trial. We don&apos;t ask for a card, and we never charge you unless you choose to subscribe.</p>
        <p>
          When the trial ends, your account becomes read-only: you can still see and download everything you&apos;ve entered, but you can&apos;t add or edit items. To carry on, you can subscribe for £3 a month. Your data is kept so you can pick up where you left off.
        </p>
        <p>
          A subscription renews every month until you cancel. You can cancel at any time from the Billing page in the app, and you&apos;ll keep access until the end of the month you&apos;ve paid for. If you change your mind within 14 days of subscribing, tell us and we&apos;ll refund you. Payments are handled by Stripe, so we never see or store your card details.
        </p>
        <p>We&apos;ll tell you well beforehand if the price changes, and a new price only applies if you carry on after being told.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-extrabold">Still being improved</h2>
        <p>Hidden Gems is a new service. Features may change, and it may be unavailable from time to time.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-extrabold">Not financial or tax advice</h2>
        <p>The figures are only as accurate as the information you put in. Hidden Gems is not accounting, financial or tax advice, so please check anything important with a professional or HMRC.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-extrabold">Fair use</h2>
        <p>Please don&apos;t misuse the service, try to break into other people&apos;s accounts, or overload it. We may close accounts that do.</p>
      </section>
    </main>
  );
}
