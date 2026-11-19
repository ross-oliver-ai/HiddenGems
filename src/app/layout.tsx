import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Hidden Gems",
  description: "Track your charity shop finds and Vinted sales",
  applicationName: "Hidden Gems",
  appleWebApp: { capable: true, title: "Hidden Gems", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#d9638b",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser().catch(() => null);
  return (
    <html lang="en-GB" data-theme={user?.theme ?? "blossom"} data-mode={user?.colorMode ?? "system"}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
