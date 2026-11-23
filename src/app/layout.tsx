import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { THEMES } from "@/lib/themes";

// Rounded font shipped with the app, so PCs and Android phones match iPhones
// (which use Apple's own rounded font first; see --font-sans in globals.css).
const nunito = localFont({
  src: "./fonts/nunito-latin-wght-normal.woff2",
  weight: "200 1000",
  display: "swap",
  variable: "--font-nunito",
});

export const metadata: Metadata = {
  title: "Hidden Gems",
  description: "Track what you buy, list and sell",
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
    <html lang="en-GB" className={nunito.variable} data-theme={user?.theme ?? "blossom"} data-mode={user?.colorMode ?? "system"}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
