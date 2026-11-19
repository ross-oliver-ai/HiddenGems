import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { EmailOnlyForm } from "@/components/EmailOnlyForm";
import { forgotPasswordAction } from "./actions";

export const metadata: Metadata = { title: "Forgot password · Hidden Gems" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Forgot your password?" subtitle="We'll email you a link to choose a new one." footer={<Link href="/login" className="font-bold text-primary">Back to sign in</Link>}>
      <EmailOnlyForm
        action={forgotPasswordAction}
        button="Email me a link"
        pending="Sending…"
        done="If that email has an account, we've sent a link to choose a new password. It works for 1 hour. Check your spam folder too."
      />
    </AuthShell>
  );
}
