import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";
import { readSession } from "./session";
import { entitlement } from "./billing";

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const session = await readSession();
  if (!session) return null;
  const [user] = await db.select().from(users).where(eq(users.id, session.uid)).limit(1);
  if (!user || user.disabled) return null;
  return user;
});

/** For pages inside the app: must be logged in and have set their own password. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}

/**
 * For anything that adds, edits or deletes data. When billing is on and the trial or subscription has ended the account is
 * read-only, so this sends them to the billing page instead. (Reading, exporting and signing out are never blocked.)
 */
export async function requireWritableUser(): Promise<User> {
  const user = await requireUser();
  if (!entitlement(user).canWrite) redirect("/billing?locked=1");
  return user;
}
