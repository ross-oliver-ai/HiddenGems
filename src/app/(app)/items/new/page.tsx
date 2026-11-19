import { requireUser } from "@/lib/auth";

export default async function NewItemPage() {
  await requireUser();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight">Add item</h1>
      <div className="card text-sm text-muted">Coming in the next stage.</div>
    </div>
  );
}
