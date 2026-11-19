import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { peekToken } from "@/lib/tokens";
import { ResetForm } from "./ResetForm";

export const metadata: Metadata = { title: "Choose a new password · Hidden Gems" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const valid = await peekToken(token, "reset_password").catch(() => false);
  if (!valid) {
    return (
      <AuthShell title="Link expired" subtitle="That link has expired or was already used.">
        <div className="card space-y-3 text-center">
          <Link href="/forgot-password" className="btn">Send me a new link</Link>
          <Link href="/login" className="block text-sm font-bold text-primary">Back to sign in</Link>
        </div>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Choose a new password">
      <ResetForm token={token} />
    </AuthShell>
  );
}
