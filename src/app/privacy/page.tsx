import type { Metadata } from "next";
import Link from "next/link";
import { OPERATOR_ADDRESS, OPERATOR_NAME, SUPPORT_EMAIL } from "@/lib/contact";

export const metadata: Metadata = { title: "Privacy notice · Hidden Gems" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl space-y-5 px-5 py-8">
      <Link href="/" className="text-sm font-bold text-primary">← Hidden Gems</Link>
      <h1 className="text-3xl font-extrabold tracking-tight">Privacy notice</h1>

      <section className="space-y-2" data-who-runs>
        <h2 className="text-lg font-extrabold">Who is responsible for your data</h2>
        <p>
          {OPERATOR_NAME}, a sole trader trading as Hidden Gems, decides how your information is used and looks after it. Address: {OPERATOR_ADDRESS}. Email:{" "}
          <a className="font-bold text-primary" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-extrabold">The waitlist</h2>
        <p>
          If you join the waitlist we store your email address and the date you joined. We use it only to email you about getting access to Hidden Gems,
          and we don&apos;t sell it or share it with anyone for their own marketing.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-extrabold">Your account</h2>
        <p>
          If you create an account we store your name, your email address, a scrambled version of your password (never the password itself), your settings, and what you enter into the app,
          such as items, prices, dates and photos. It&apos;s private to you, with one exception: photos are stored at long, unguessable web addresses, so anyone who has a photo&apos;s exact link can open it, but nobody can browse or search for them. We use it only to run Hidden Gems for you, and we email you only to confirm your address, reset your password when you ask, and let you know when your free trial is about to end.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-extrabold">Payments</h2>
        <p>
          If you subscribe, your payment is handled by Stripe. We never see or store your card details. We keep only your Stripe customer and subscription references, whether your subscription is active, and when it renews or ends, so that we know whether your account is paid up.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-extrabold">Suggesting details from a photo</h2>
        <p>
          When &ldquo;Suggest details from photo&rdquo; is switched on and you tap it, the photo of your item (and a photo of its tag, if you add one) is sent to Anthropic, the company behind the Claude AI, which reads it and suggests a name, brand, size, category and condition. They handle it under their own terms and privacy policy. We don&apos;t keep the tag photo, and we don&apos;t keep the suggestion unless you save it as part of your item. We keep only a count of how many suggestions each account has used and what they cost. Please don&apos;t photograph people or anything private.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-extrabold">Why we&apos;re allowed to use it</h2>
        <p>For the waitlist, you gave us your email to be told when your invite is ready. For an account, we need your details to provide the service you asked for.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-extrabold">How long we keep it</h2>
        <p>
          Waitlist emails are kept until you&apos;re invited and have joined, or until you ask us to remove it. Account data is kept until you delete your account. If the trial doesn&apos;t go ahead, we&apos;ll delete the list.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-extrabold">Your rights</h2>
        <p>
          Once you&apos;re signed in, Settings → Account lets you download everything you&apos;ve entered (spreadsheets plus links to your photos) and delete your account straight away, which permanently removes your data and photos and cancels any subscription. Stripe keeps its own payment records, as it is required to. You can also ask to see, correct or delete your details at any time by emailing {SUPPORT_EMAIL} or replying to any email we send you. If you&apos;re unhappy with how we&apos;ve
          handled it, you can complain to the Information Commissioner&apos;s Office (ico.org.uk).
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-extrabold">Where it&apos;s stored</h2>
        <p>On secure cloud services (Vercel and Railway) that we use to run the app. Payments are processed by Stripe. Photo suggestions are read by Anthropic.</p>
      </section>
    </main>
  );
}
