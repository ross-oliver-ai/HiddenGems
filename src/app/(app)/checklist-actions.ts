"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { hideChecklist } from "@/lib/checklist";

/** "Hide this" on the first-run checklist. Not blocked for read-only accounts: it only changes what Home shows. */
export async function hideChecklistAction() {
  const user = await requireUser();
  await hideChecklist(user.id);
  revalidatePath("/");
}
