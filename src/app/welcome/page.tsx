import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { WaitlistForm } from "./WaitlistForm";
import { GoalShowcase } from "./GoalShowcase";

export const metadata: Metadata = {
  title: "Hidden Gems: know what you really make from reselling",
  description:
    "Track everything you buy and sell, and see your spend, stock and profit in clear, beautiful reports. Built for resellers. Join the free trial.",
  openGraph: {
    title: "Hidden Gems: know what you really make from reselling",
    description: "Track what you buy and sell, and see your profit at a glance. Join the free trial.",
    type: "website",
  },
};

const STEPS = [
  { n: "1", title: "Add what you buy", text: "Price, where it came from, the date and a photo. It takes a few seconds." },
  { n: "2", title: "Follow it to the sale", text: "Note when you list it, what it sells for, how it's posted, and any returns." },
  { n: "3", title: "See what you make", text: "Profit on every item, and reports for any week, month or tax year." },
];

const FEATURES = [
  { icon: "💷", title: "Profit on every item", text: "See exactly what each find earned, or lost, once you take off what you paid." },
  { icon: "📈", title: "Reports for any period", text: "Spend, revenue, profit and stock by week, month, quarter or UK tax year." },
  { icon: "🎯", title: "Goals worth hitting", text: "Set a monthly profit goal and watch the bar fill. There's confetti when you beat it." },
  { icon: "⏰", title: "Stock that doesn't go stale", text: "Gentle nudges when something has sat unsold for too long." },
  { icon: "↩️", title: "Returns and refunds", text: "Sold, then sent back? Your profit stays honest." },
  { icon: "🎨", title: "Yours to style", text: "Pick a colour theme, go light or dark, and add it to your phone's home screen." },
];

function PreviewCard() {
  const bars = [28, 46, 35, 62, 54, 78, 70];
  return (
    <div className="card mx-auto w-full max-w-sm space-y-4 shadow-[0_20px_50px_-20px_color-mix(in_srgb,var(--primary)_45%,transparent)]" aria-label="Example report">
      <div className="flex items-baseline justify-between">
        <p className="font-extrabold">This month</p>
        <p className="text-xs font-bold text-muted">Example</p>
      </div>
      <div>
        <p className="text-4xl font-extrabold tracking-tight text-primary">£342.50</p>
        <p className="text-sm font-bold text-muted">profit · £518 revenue</p>
      </div>
      <div className="flex h-24 items-end gap-2" aria-hidden>
        {bars.map((h, i) => (
          <div key={i} className="flex-1 rounded-t-lg bg-primary" style={{ height: `${h}%`, opacity: 0.45 + i * 0.09 }} />
        ))}
      </div>
      <div>
        <div className="mb-1 flex justify-between text-xs font-bold text-muted">
          <span>Monthly goal</span>
          <span>68%</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-primary-soft">
          <div className="h-full w-[68%] rounded-full bg-primary" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[["24", "sold"], ["38", "in stock"], ["71%", "sell-through"]].map(([v, l]) => (
          <div key={l} className="rounded-2xl bg-primary-soft py-2">
            <p className="text-lg font-extrabold">{v}</p>
            <p className="text-[11px] font-bold text-muted">{l}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function WelcomePage() {
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
              Free trial · invites going out soon
            </p>
            <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight md:text-5xl">
              Know what you <span className="text-primary">really</span> make from reselling.
            </h1>
            <p className="text-lg text-muted">
              Hidden Gems keeps track of everything you buy and sell, then turns it into clear, pretty reports, so you can see your spend, stock and profit at a glance.
            </p>
            <div className="card mx-auto max-w-md text-left md:mx-0">
              <WaitlistForm id="join-top" />
            </div>
          </div>
          <PreviewCard />
        </section>

        <section className="space-y-6 py-10" aria-labelledby="how">
          <h2 id="how" className="text-center text-2xl font-extrabold tracking-tight md:text-3xl">Simple from the first item</h2>
          <ol className="grid gap-3 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="card space-y-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary font-extrabold text-primary-contrast">{s.n}</span>
                <h3 className="font-extrabold">{s.title}</h3>
                <p className="text-sm text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="space-y-6 py-10" aria-labelledby="features">
          <h2 id="features" className="text-center text-2xl font-extrabold tracking-tight md:text-3xl">Everything a growing reseller needs</h2>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="card space-y-1.5">
                <p className="text-2xl" aria-hidden>{f.icon}</p>
                <h3 className="font-extrabold">{f.title}</h3>
                <p className="text-sm text-muted">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid items-center gap-6 py-10 md:grid-cols-2 md:gap-12" aria-labelledby="goal-title">
          <div className="space-y-3 text-center md:text-left">
            <h2 id="goal-title" className="text-2xl font-extrabold tracking-tight md:text-3xl">Celebrate the wins</h2>
            <p className="text-lg text-muted">
              Set a monthly profit goal and watch the bar fill as the sales roll in. Beat it, and Hidden Gems throws you a little party.
            </p>
          </div>
          <GoalShowcase />
        </section>

        <section className="py-10" aria-labelledby="join-bottom-title">
          <div className="mx-auto max-w-md space-y-4 rounded-[2rem] bg-primary-soft p-6 text-center">
            <h2 id="join-bottom-title" className="text-2xl font-extrabold tracking-tight">Get an early invite</h2>
            <p className="text-muted">The trial is free. Leave your email and we&apos;ll let you in as spots open up.</p>
            <div className="card text-left">
              <WaitlistForm id="join-bottom" />
            </div>
          </div>
        </section>
      </main>

      <footer className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 pt-6 text-sm text-muted">
        <span>© {new Date().getFullYear()} Hidden Gems</span>
        <Link href="/privacy" className="font-bold underline">Privacy</Link>
        <Link href="/login" className="font-bold underline">Sign in</Link>
      </footer>
    </div>
  );
}
