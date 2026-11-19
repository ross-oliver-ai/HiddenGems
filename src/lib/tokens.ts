import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { authTokens } from "@/db/schema";

type Kind = "verify_email" | "reset_password";
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export const TOKEN_TTL: Record<Kind, number> = {
  verify_email: 24 * 60 * 60 * 1000,
  reset_password: 60 * 60 * 1000,
};

/** Makes a one-time token. Only its hash is stored, so a database leak can't be used to take over accounts. */
export async function createToken(userId: number, kind: Kind): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await db.insert(authTokens).values({ userId, kind, tokenHash: hash(raw), expiresAt: new Date(Date.now() + TOKEN_TTL[kind]) });
  return raw;
}

/** Is this token still usable? (Doesn't use it up.) */
export async function peekToken(raw: string, kind: Kind): Promise<boolean> {
  if (!raw || raw.length > 100) return false;
  const [row] = await db
    .select({ id: authTokens.id })
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, hash(raw)), eq(authTokens.kind, kind), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())))
    .limit(1);
  return !!row;
}

/** Uses the token up (once only). Returns the user it belongs to, or null if it's invalid, used or expired. */
export async function consumeToken(raw: string, kind: Kind): Promise<number | null> {
  if (!raw || raw.length > 100) return null;
  const rows = await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(authTokens.tokenHash, hash(raw)), eq(authTokens.kind, kind), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())))
    .returning({ userId: authTokens.userId });
  return rows[0]?.userId ?? null;
}

/** How many tokens of this kind we've made for the user lately (to stop email spamming). */
export async function recentTokens(userId: number, kind: Kind, withinMs = 60 * 60 * 1000): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(authTokens)
    .where(and(eq(authTokens.userId, userId), eq(authTokens.kind, kind), gte(authTokens.createdAt, new Date(Date.now() - withinMs))));
  return r?.n ?? 0;
}
