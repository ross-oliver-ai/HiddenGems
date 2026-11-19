import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { peekToken } from "@/lib/tokens";
import { ConfirmForm } from "./ConfirmForm";

export const metadata: Metadata = { title: "Confirm your email · Hidden Gems" };
export const dynamic = "force-dynamic";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const valid = await peekToken(token, "verify_email").catch(() => false);
  if (!valid) {
    return (
      <AuthShell title="Link expired" subtitle="That link has expired or was already used.">
        <div className="card space-y-3 text-center">
          <Link href="/resend-verification" className="btn">Send me a new link</Link>
          <Link href="/login" className="block text-sm font-bold text-primary">Back to sign in</Link>
        </div>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Confirm your email">
      <ConfirmForm token={token} />
    </AuthShell>
  );
}
