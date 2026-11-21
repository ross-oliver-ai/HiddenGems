import { requireUser } from "@/lib/auth";
import { BottomNav } from "@/components/BottomNav";
import { Logo } from "@/components/Logo";
import { BillingBanner } from "@/components/BillingBanner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="mx-auto min-h-dvh w-full max-w-lg">
      <header
        className="sticky top-0 z-10 flex items-center gap-3 bg-background/90 px-4 pb-3 backdrop-blur"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
      >
        <Logo size={36} />
        <span className="text-lg font-extrabold tracking-tight">Hidden Gems</span>
        <span className="ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-sm font-extrabold text-primary" title={user.name}>
          {user.name.charAt(0).toUpperCase()}
        </span>
      </header>
      <main className="px-4 pb-32">
        <BillingBanner user={user} />
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
