import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { THEMES } from "@/lib/themes";

export const metadata: Metadata = {
  title: "Hidden Gems",
  description: "Track your charity shop finds and Vinted sales",
  applicationName: "Hidden Gems",
  appleWebApp: { capable: true, title: "Hidden Gems", statusBarStyle: "default" },
};

export async function generateViewport(): Promise<Viewport> {
  const user = await getCurrentUser().catch(() => null);
  const theme = THEMES.find((t) => t.id === user?.theme) ?? THEMES[0];
  return { width: "device-width", initialScale: 1, maximumScale: 1, viewportFit: "cover", themeColor: theme.swatch[0] };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser().catch(() => null);
  return (
    <html lang="en-GB" data-theme={user?.theme ?? "blossom"} data-mode={user?.colorMode ?? "system"}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
