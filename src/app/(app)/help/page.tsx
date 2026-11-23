import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { StatusPill } from "@/components/StatusPill";
import { SUPPORT_EMAIL, feedbackHref } from "@/lib/contact";
import { STATUS_HELP, STATUS_ORDER } from "@/lib/help";

export const metadata: Metadata = { title: "Help and feedback · Hidden Gems" };

export default async function HelpPage() {
  await requireUser();
  return (
    <div className="space-y-4">
      <div>
        <Link href="/settings" className="text-sm font-bold text-primary">← Settings</Link>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Help and feedback</h1>
      </div>
      <p className="text-muted">Short answers to the things people ask most. If yours isn&apos;t here, email us.</p>

      <section className="card space-y-3">
        <h2 className="font-extrabold">How an item moves</h2>
        <p className="text-sm text-muted">Each item follows these steps. The coloured label on every item shows where it is.</p>
        <ul className="space-y-3">
          {STATUS_ORDER.map((s) => (
            <li key={s} className="flex items-start gap-3">
              <span className="w-28 shrink-0 pt-0.5"><StatusPill status={s} /></span>
              <span className="text-sm">{STATUS_HELP[s]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card space-y-2">
        <h2 className="font-extrabold">How profit is worked out</h2>
        <p className="text-sm">
          Profit is what the buyer paid, minus what you paid for the item, the platform&apos;s fee and any postage you paid.
          Postage a buyer pays is not counted. If an item comes back, the refund comes off too.
        </p>
        <p className="text-sm">
          It doesn&apos;t include packaging, tape, labels, travel to shops or storage. Hidden Gems tracks each item, not your overheads.
        </p>
      </section>

      <section className="card space-y-2">
        <h2 className="font-extrabold">Set your fees first</h2>
        <p className="text-sm">
          Every platform starts at a 0% fee, so profit looks higher than it really is until you set them. Go to Settings, then Platforms &amp; postage,
          and enter each platform&apos;s fee. When you mark an item as sold, the fee is filled in for you, and you can change it on any sale.
        </p>
        <Link href="/settings/platforms" className="btn-soft w-full">Set platform fees</Link>
      </section>

      <section className="card space-y-2">
        <h2 className="font-extrabold">Tapped the wrong button?</h2>
        <p className="text-sm">
          Open the item. Once it&apos;s sold, posted or completed, there&apos;s an Undo button for the last step. Undoing a sale asks first, because it clears
          the price, fees and postage and puts the item back on sale. On the To send list, an Undo bar also appears for a few seconds after you tick something off.
        </p>
      </section>

      <section className="card space-y-2">
        <h2 className="font-extrabold">Keeping your own copy</h2>
        <p className="text-sm">
          Settings → Account has a button to download all your data (items, sales, fees, settings and links to your photos) as spreadsheets. Reports also has a button for just your items. Both work on every plan, even after your free trial ends. You can delete your account from the same place.
        </p>
        <Link href="/settings/account" className="btn-soft w-full">Go to Account</Link>
      </section>

      <section className="card space-y-2">
        <h2 className="font-extrabold">When the free trial ends</h2>
        <p className="text-sm">
          Your account becomes read-only: you can still see and download everything, but you can&apos;t add or edit items until you subscribe.
        </p>
        <Link href="/billing" className="btn-soft w-full">Billing</Link>
      </section>

      <section className="card space-y-2">
        <h2 className="font-extrabold">Get in touch</h2>
        <p className="text-sm">
          Something confusing, broken or missing? Tell us at <a className="font-bold text-primary" href={feedbackHref()}>{SUPPORT_EMAIL}</a>.
        </p>
        <a href={feedbackHref()} className="btn w-full">Send feedback</a>
      </section>
    </div>
  );
}
