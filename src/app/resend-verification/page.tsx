import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { EmailOnlyForm } from "@/components/EmailOnlyForm";
import { resendVerificationAction } from "@/app/verify/actions";

export const metadata: Metadata = { title: "Resend confirmation · Hidden Gems" };

export default function ResendPage() {
  return (
    <AuthShell title="Confirm your email" subtitle="We'll send you a fresh link." footer={<Link href="/login" className="font-bold text-primary">Back to sign in</Link>}>
      <EmailOnlyForm
        action={resendVerificationAction}
        button="Send the link"
        pending="Sending…"
        done="If that email has an account waiting to be confirmed, we've sent a new link. Check your spam folder too."
      />
    </AuthShell>
  );
}
