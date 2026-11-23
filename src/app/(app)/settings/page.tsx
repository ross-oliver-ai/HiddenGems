import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { THEMES, COLOR_MODES } from "@/lib/themes";
import { UpdateDatabase } from "@/components/UpdateDatabase";
import { SettingsGroup } from "@/components/SettingsGroup";
import { pendingMigrations } from "@/lib/migrations";
import { updateAppearanceAction, logoutAction } from "./actions";

const MODE_LABEL: Record<(typeof COLOR_MODES)[number], string> = {
  system: "Auto",
  light: "Light",
  dark: "Dark",
};

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight">Settings</h1>

      <SettingsGroup>Your app</SettingsGroup>

      <section className="card space-y-4">
        <h2 className="font-extrabold">Colour theme</h2>
        <form action={updateAppearanceAction} className="grid grid-cols-3 gap-3">
          {THEMES.map((t) => {
            const active = user.theme === t.id;
            return (
              <button
                key={t.id}
                type="submit"
                name="theme"
                value={t.id}
                aria-pressed={active}
                className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-3 text-sm font-bold transition active:scale-95 ${
                  active ? "border-primary bg-primary-soft" : "border-border bg-surface-2"
                }`}
              >
                <span className="flex -space-x-2">
                  {t.swatch.map((c) => (
                    <span key={c} className="h-6 w-6 rounded-full border-2 border-surface" style={{ background: c }} />
                  ))}
                </span>
                {t.name}
              </button>
            );
          })}
        </form>

        <div>
          <h3 className="label">Light or dark</h3>
          <form action={updateAppearanceAction} className="grid grid-cols-3 gap-2 rounded-2xl bg-surface-2 p-1">
            {COLOR_MODES.map((m) => (
              <button
                key={m}
                type="submit"
                name="mode"
                value={m}
                aria-pressed={user.colorMode === m}
                className={`rounded-xl py-2.5 text-sm font-bold ${
                  user.colorMode === m ? "bg-primary text-primary-contrast" : "text-muted"
                }`}
              >
                {MODE_LABEL[m]}
              </button>
            ))}
          </form>
        </div>
      </section>

      <Link href="/settings/platforms" className="card flex items-center justify-between font-extrabold">
        Platforms & postage
        <span aria-hidden className="text-primary">→</span>
      </Link>

      <Link href="/settings/lists" className="card flex items-center justify-between font-extrabold">
        Where from & categories
        <span aria-hidden className="text-primary">→</span>
      </Link>

      <Link href="/settings/targets" className="card flex items-center justify-between font-extrabold">
        Targets
        <span aria-hidden className="text-primary">→</span>
      </Link>

      <SettingsGroup>Your account</SettingsGroup>

      <Link href="/settings/account" className="card flex items-center justify-between font-extrabold">
        Account
        <span className="flex items-center gap-2 text-sm font-semibold text-muted">
          Email, password &amp; your data
          <span aria-hidden className="font-extrabold text-primary">→</span>
        </span>
      </Link>

      <Link href="/billing" className="card flex items-center justify-between font-extrabold">
        Billing
        <span aria-hidden className="text-primary">→</span>
      </Link>

      <Link href="/help" className="card flex items-center justify-between font-extrabold">
        Help and feedback
        <span aria-hidden className="text-primary">→</span>
      </Link>

      {user.role === "admin" && (
        <>
          <SettingsGroup>Admin</SettingsGroup>
          <Link href="/admin/users" className="card flex items-center justify-between font-extrabold">
            Manage users
            <span aria-hidden className="text-primary">→</span>
          </Link>
          <Link href="/admin/waitlist" className="card flex items-center justify-between font-extrabold">
            Waitlist
            <span aria-hidden className="text-primary">→</span>
          </Link>
          <section className="card space-y-2">
            <h2 className="font-extrabold">Database</h2>
            <UpdateDatabase pending={await pendingMigrations()} />
          </section>
        </>
      )}

      <section className="card space-y-1">
        <p className="font-bold">{user.name}</p>
        <p className="text-sm text-muted">{user.email}</p>
        <form action={logoutAction} className="pt-3">
          <button type="submit" className="btn-danger w-full">Sign out</button>
        </form>
      </section>
    </div>
  );
}
