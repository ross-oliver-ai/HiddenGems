"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const icons = {
  home: <path d="M3 11.5 12 4l9 7.5M5.5 10v10h13V10" />,
  items: <><rect x="3.5" y="4" width="17" height="16" rx="3" /><path d="M8 9h8M8 13h8M8 17h5" /></>,
  reports: <path d="M4 20V10m6 10V4m6 16v-7m4 7H2" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></>,
};

type IconKey = keyof typeof icons;

function NavLink({ href, label, icon, active }: { href: string; label: string; icon: IconKey; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-bold ${active ? "text-primary" : "text-muted"}`}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {icons[icon]}
      </svg>
      {label}
    </Link>
  );
}

export function BottomNav() {
  const path = usePathname();
  const is = (p: string) => (p === "/" ? path === "/" : path.startsWith(p));
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-lg items-end px-2">
        <NavLink href="/" label="Home" icon="home" active={is("/")} />
        <NavLink href="/items" label="Items" icon="items" active={is("/items") && path !== "/items/new"} />
        <div className="flex flex-1 justify-center">
          <Link
            href="/items/new"
            aria-label="Add item"
            className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-contrast shadow-lg shadow-primary/30 active:scale-95"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </Link>
        </div>
        <NavLink href="/reports" label="Reports" icon="reports" active={is("/reports")} />
        <NavLink href="/settings" label="Settings" icon="settings" active={is("/settings") || is("/admin")} />
      </div>
    </nav>
  );
}
