import { getCurrentUser } from "@/lib/auth";
import { exportZip } from "@/lib/export";

// The full download of everything in the account. Like the Reports CSV it works on every plan, including after the trial ends.
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new Response("Not signed in", { status: 401 });

  const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  return new Response(Buffer.from(await exportZip(user)), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="hidden-gems-all-my-data-${stamp}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
