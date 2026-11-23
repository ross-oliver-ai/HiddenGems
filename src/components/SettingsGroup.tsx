/** A small heading with a thin line in the theme colour, used to split Settings into groups. */
export function SettingsGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-3" data-settings-group>
      <h2 className="text-xs font-extrabold uppercase tracking-wider text-primary">{children}</h2>
      <span aria-hidden className="h-px flex-1 bg-primary/30" />
    </div>
  );
}
