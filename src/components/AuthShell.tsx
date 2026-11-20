import Link from "next/link";
import { Logo } from "./Logo";

/** The centred card layout shared by sign-in, sign-up and password pages. */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 pb-10 pt-[calc(env(safe-area-inset-top)+2rem)]">
      <Link href="/" className="mb-4 -ml-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-xl px-2 text-sm font-bold text-primary">
        <span aria-hidden>←</span> Back to home
      </Link>
      <div className="mb-8 flex flex-col items-center text-center">
        <Link href="/" aria-label="Hidden Gems home"><Logo size={64} /></Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {children}
      {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
    </main>
  );
}

export const Notice = ({ tone = "ok", children }: { tone?: "ok" | "error"; children: React.ReactNode }) => (
  <p role={tone === "error" ? "alert" : "status"} className={`rounded-xl px-3 py-2 text-sm font-semibold ${tone === "ok" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
    {children}
  </p>
);
