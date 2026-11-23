import type { ItemStatus } from "@/db/schema";

/** What each status means, in the order an item normally moves through them. The Help page shows these next to the real status pills. */
export const STATUS_HELP: Record<ItemStatus, string> = {
  bought: "You've bought it but haven't listed it yet.",
  listed: "For sale on one or more platforms.",
  sold: "It has sold, and you still have it. Post it, or hand it over to the buyer.",
  posted: "You've posted it and are waiting for the money. It appears under Waiting for money.",
  completed: "The buyer has it and the money is in. This sale is finished.",
  returned: "The buyer sent it back and you refunded them. You can list it again.",
  unsold: "You gave up on it. What you paid counts as a loss.",
  donated: "You gave it away. What you paid counts as a loss.",
};

export const STATUS_ORDER: ItemStatus[] = ["bought", "listed", "sold", "posted", "completed", "returned", "unsold", "donated"];
