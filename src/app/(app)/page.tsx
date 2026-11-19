import { requireUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await requireUser();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/London" }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight">
        {greeting}, {user.name.split(" ")[0]} ✨
      </h1>
      <div className="card">
        <p className="font-bold">Your dashboard is on its way</p>
        <p className="mt-1 text-sm text-muted">
          Next up: adding items, tracking them from charity shop to sold, and your profit reports.
        </p>
      </div>
    </div>
  );
}
