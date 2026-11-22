import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { StatusPill } from "@/components/StatusPill";
import { WaitlistForm } from "./WaitlistForm";
import { GoalShowcase } from "./GoalShowcase";
import { PlatformsMock, ProfitCard, ReportsMock, SendMock } from "./Mocks";
import { signupsOpen } from "@/lib/email";
import { priceLabel, trialDays } from "@/lib/billing";
import type { ItemStatus } from "@/db/schema";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Hidden Gems: the profit tracker for people who resell",
  description:
    "Follow every find from the charity shop to the payout and see what you actually keep after fees, postage and refunds. Built for UK Vinted, eBay and Depop sellers.",
  openGraph: {
    title: "Hidden Gems: know what you actually keep from every sale",
    description: "Track what you buy and sell, and see your real profit after fees, postage and refunds.",
    type: "website",
  },
};

const STEPS: { status: ItemStatus; title: string; text: string }[] = [
  { status: "bought", title: "Add what you buy", text: "A photo, what you paid and where it came from. Three fields are all it needs." },
  { status: "listed", title: "List it where you sell", text: "Pick the platforms and set a price for each. Drop a price later and the history is kept." },
  { status: "sold", title: "Sell it and post it", text: "Record what it sold for. It lands on your To send list until the parcel is on its way." },
  { status: "completed", title: "See what you kept", text: "Profit on every item, after what you paid, fees, postage and any refund." },
];

const MORE = [
  { title: "Returns that stay honest", text: "Sold, then sent back? Record the refund and your profit and reports follow." },
  { title: "Stock that doesn't go stale", text: "A nudge when something has sat unsold for longer than you'd like. You choose how long." },
  { title: "Your UK tax year", text: "Reports for a week, month, quarter, the UK tax year or any dates you pick." },
  { title: "Where it came from", text: "Charity shop, car boot, online lot. See which places give you the best profit." },
  { title: "Your data stays yours", text: "Download everything as a CSV whenever you like, even if you stop paying." },
  { title: "Made for a phone", text: "Big buttons, quick photos, dark mode and six colours. Add it to your home screen, no app store." },
];

const FAQ: [string, string][] = [
  [
    "Does it connect to Vinted or eBay?",
    "No. You enter your own sales, which takes a few taps, and nothing is ever posted or changed on your marketplace accounts.",
  ],
  [
    "Which platforms can I use?",
    "Any. It starts with Vinted, eBay, Depop, Facebook Marketplace and Gumtree, and you can add your own. Each platform can have its own fee percentage, so profit is worked out after fees.",
  ],
  [
    "Is it tax advice?",
    "No. It keeps a clear record of what you bought and sold, and can report by UK tax year, but what you owe and when is for HMRC or an accountant.",
  ],
  [
    "What happens if I stop paying?",
    "Your account becomes read-only. You can still see everything and download your data, and nothing is deleted.",
  ],
  [
    "Do I need an app?",
    "No. It runs in your phone's browser, and you can add it to your home screen so it opens like an app.",
  ],
];

function JoinBox({ id, open }: { id: string; open: boolean }) {
  if (!open) return <WaitlistForm id={id} />;
  return (
    <div className="space-y-3 text-center">
      <Link href="/signup" className="btn w-full">Start your free trial</Link>
      <p className="text-xs text-muted">No card needed. Already signed up? <Link href="/login" className="font-bold underline">Sign in</Link></p>
    </div>
  );
}

export default function WelcomePage() {
  const open = signupsOpen();
  const price = priceLabel();
  const days = trialDays();
  return (
    <div className="mx-auto w-full max-w-5xl px-5 pb-16">
      <header className="flex items-center justify-between pb-5 pt-[calc(env(safe-area-inset-top)+2rem)]">
        <div className="flex items-center gap-2.5">
          <Logo size={36} />
          <span className="text-lg font-extrabold tracking-tight">Hidden Gems</span>
        </div>
        <Link href="/login" className="btn-soft">Sign in</Link>
      </header>

      <main>
        <section className="grid items-center gap-10 py-8 md:grid-cols-2 md:py-14">
          <div className="space-y-5 text-center md:text-left">
            <p className="inline-block rounded-full bg-primary-soft px-3.5 py-1.5 text-sm font-bold text-primary">
              {open ? `${days}-day free trial · no card needed` : "Free trial · invites going out soon"}
            </p>
            <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight md:text-5xl">
              Know what you <span className="text-primary">actually keep</span> from every sale.
            </h1>
            <p className="text-lg text-muted">
              Follow each find from the charity shop to the payout. Hidden Gems works out your real profit after fees, postage and refunds, for sellers on Vinted, eBay, Depop and more.
            </p>
            <div className="card mx-auto max-w-md space-y-3 text-left md:mx-0">
              <JoinBox id="join-top" open={open} />
              <p className="text-center text-xs text-muted">Free for {days} days, then {price} a month. Cancel any time.</p>
            </div>
          </div>
          <ProfitCard />
        </section>

        <section className="mx-auto max-w-2xl space-y-3 py-10 text-center" aria-labelledby="problem">
          <h2 id="problem" className="text-2xl font-extrabold tracking-tight md:text-3xl">Your sales total isn&apos;t your profit</h2>
          <p className="text-lg text-muted">
            Between the price you charge and the money you keep sit what you paid, the platform&apos;s fee, the postage, and the odd return. Hidden Gems does that sum on every item, so you don&apos;t have to.
          </p>
        </section>

        <section className="space-y-6 py-10" aria-labelledby="how">
          <h2 id="how" className="text-center text-2xl font-extrabold tracking-tight md:text-3xl">From purchase to payout</h2>
          <ol className="grid gap-3 md:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.title} className="card space-y-2">
                <StatusPill status={s.status} />
                <h3 className="font-extrabold">{s.title}</h3>
                <p className="text-sm text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="grid items-center gap-6 py-10 md:grid-cols-2 md:gap-12" aria-labelledby="platforms">
          <div className="space-y-3 text-center md:text-left">
            <h2 id="platforms" className="text-2xl font-extrabold tracking-tight md:text-3xl">Sell on several platforms, price each one</h2>
            <p className="text-lg text-muted">
              List the same item on Vinted, eBay and Depop at different prices. When it sells, the sale is recorded against the platform it sold on, the fee comes off, and the other listings end.
            </p>
          </div>
          <div className="flex justify-center"><PlatformsMock /></div>
        </section>

        <section className="grid items-center gap-6 py-10 md:grid-cols-2 md:gap-12" aria-labelledby="posting">
          <div className="order-2 flex justify-center md:order-1"><SendMock /></div>
          <div className="order-1 space-y-3 text-center md:order-2 md:text-left">
            <h2 id="posting" className="text-2xl font-extrabold tracking-tight md:text-3xl">Posting day, sorted</h2>
            <p className="text-lg text-muted">
              Everything you&apos;ve sold and not yet sent is on one list, grouped by how it&apos;s going: Royal Mail, Evri, InPost or by hand. One tap marks a parcel as posted, and there&apos;s an Undo if you tap the wrong one.
            </p>
          </div>
        </section>

        <section className="grid items-center gap-6 py-10 md:grid-cols-2 md:gap-12" aria-labelledby="reports">
          <div className="space-y-3 text-center md:text-left">
            <h2 id="reports" className="text-2xl font-extrabold tracking-tight md:text-3xl">Reports that answer real questions</h2>
            <p className="text-lg text-muted">
              What did I make this month? Which platform earns the most? How long do things take to sell? What&apos;s been sitting in the spare room too long? Every figure is after fees and postage.
            </p>
          </div>
          <div className="flex justify-center"><ReportsMock /></div>
        </section>

        <section className="space-y-6 py-10" aria-labelledby="more">
          <h2 id="more" className="text-center text-2xl font-extrabold tracking-tight md:text-3xl">The small things that matter</h2>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {MORE.map((f) => (
              <div key={f.title} className="card space-y-1.5">
                <h3 className="font-extrabold">{f.title}</h3>
                <p className="text-sm text-muted">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid items-center gap-6 py-10 md:grid-cols-2 md:gap-12" aria-labelledby="goal-title">
          <div className="space-y-3 text-center md:text-left">
            <h2 id="goal-title" className="text-2xl font-extrabold tracking-tight md:text-3xl">A goal, and a little party when you hit it</h2>
            <p className="text-lg text-muted">
              Set a monthly profit goal and watch the bar fill as the sales come in. Beat it, and the confetti comes out.
            </p>
          </div>
          <GoalShowcase />
        </section>

        <section className="mx-auto max-w-2xl space-y-3 py-10 text-center" aria-labelledby="why">
          <h2 id="why" className="text-2xl font-extrabold tracking-tight md:text-3xl">Built by one person, for sellers like this</h2>
          <p className="text-lg text-muted">
            Hidden Gems started as a tracker I made for my wife, who sells charity-shop finds on Vinted. It&apos;s now open to other sellers.
          </p>
        </section>

        <section className="py-10" aria-labelledby="price">
          <div className="mx-auto max-w-md space-y-4 rounded-[2rem] bg-primary-soft p-6 text-center">
            <h2 id="price" className="text-2xl font-extrabold tracking-tight">{price} a month, after {days} free days</h2>
            <ul className="space-y-1 text-muted">
              <li>One plan, everything included</li>
              <li>No card to start the trial</li>
              <li>Cancel any time</li>
              <li>Stop and your data stays yours</li>
            </ul>
            <div className="card text-left">
              <JoinBox id="join-bottom" open={open} />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-2xl space-y-4 py-10" aria-labelledby="faq">
          <h2 id="faq" className="text-center text-2xl font-extrabold tracking-tight md:text-3xl">Questions</h2>
          <div className="space-y-2">
            {FAQ.map(([q, a]) => (
              <details key={q} className="card group">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-extrabold [&::-webkit-details-marker]:hidden">
                  {q}
                  <span aria-hidden className="text-primary transition group-open:rotate-45">+</span>
                </summary>
                <p className="pt-1 text-muted">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 pt-6 text-sm text-muted">
        <span>© {new Date().getFullYear()} Hidden Gems</span>
        <Link href="/privacy" className="font-bold underline">Privacy</Link>
        <Link href="/terms" className="font-bold underline">Terms</Link>
        <Link href="/login" className="font-bold underline">Sign in</Link>
      </footer>
    </div>
  );
}
