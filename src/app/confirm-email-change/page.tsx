import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, gt, isNull } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "@/db";
import { authTokens } from "@/db/schema";
import { AuthShell } from "@/components/AuthShell";
import { ConfirmChangeForm } from "./ConfirmChangeForm";

export const metadata: Metadata = { title: "Confirm your new email · Hidden Gems" };
export const dynamic = "force-dynamic";

/** Looks at the link without using it up, and returns the address it would switch to. */
async function pendingAddress(raw: string): Promise<string | null> {
  if (!raw || raw.length > 100) return null;
  const hash = createHash("sha256").update(raw).digest("hex");
  const [row] = await db
    .select({ payload: authTokens.payload })
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, hash), eq(authTokens.kind, "change_email"), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())))
    .limit(1);
  return row?.payload ?? null;
}

export default async function ConfirmEmailChangePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const email = await pendingAddress(token).catch(() => null);
  if (!email) {
    return (
      <AuthShell title="Link expired" subtitle="That link has expired or was already used.">
        <div className="card space-y-3 text-center">
          <p className="text-sm text-muted">You can ask for a new one from Settings → Account.</p>
          <Link href="/settings/account" className="btn">Go to Account settings</Link>
        </div>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Confirm your new email">
      <ConfirmChangeForm token={token} email={email} />
    </AuthShell>
  );
}
