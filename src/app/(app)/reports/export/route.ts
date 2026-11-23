import { getCurrentUser } from "@/lib/auth";
import { itemsCsv, withBom } from "@/lib/export";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new Response("Not signed in", { status: 401 });

  const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  return new Response(withBom(await itemsCsv(user.id)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="hidden-gems-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
