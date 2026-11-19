import type { ItemStatus } from "@/db/schema";
import { STATUS_LABEL, STATUS_STYLE } from "@/lib/items";

export function StatusPill({ status }: { status: ItemStatus }) {
  return (
    <span className={`inline-block shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
