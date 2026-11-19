import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy notice · Hidden Gems" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl space-y-5 px-5 py-8">
      <Link href="/" className="text-sm font-bold text-primary">← Hidden Gems</Link>
      <h1 className="text-3xl font-extrabold tracking-tight">Privacy notice</h1>

      <section className="space-y-2">
        <h2 className="text-lg font-extrabold">The waitlist</h2>
        <p>
          If you join the waitlist we store your email address and the date you joined. We use it only to email you about getting access to Hidden Gems,
          and we don&apos;t sell it or share it with anyone for their own marketing.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-extrabold">Why we&apos;re allowed to use it</h2>
        <p>You gave us your email to be told when your invite is ready, and that&apos;s what we use it for.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-extrabold">How long we keep it</h2>
        <p>
          Until you&apos;re invited and have joined, or until you ask us to remove it. If the beta doesn&apos;t go ahead, we&apos;ll delete the list.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-extrabold">Your rights</h2>
        <p>
          You can ask to see, correct or delete your email at any time by replying to any email we send you. If you&apos;re unhappy with how we&apos;ve
          handled it, you can complain to the Information Commissioner&apos;s Office (ico.org.uk).
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-extrabold">Where it&apos;s stored</h2>
        <p>On secure cloud services (Vercel and Railway) that we use to run the app.</p>
      </section>
    </main>
  );
}
