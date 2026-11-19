import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { getCurrentUser } from "@/lib/auth";
import { signupsOpen } from "@/lib/email";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = { title: "Create your account · Hidden Gems" };
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (await getCurrentUser().catch(() => null)) redirect("/");
  if (!signupsOpen()) {
    return (
      <AuthShell title="Not open just yet" subtitle="Sign-ups will open soon.">
        <div className="card space-y-3 text-center">
          <p className="text-muted">Leave your email on the home page and we&apos;ll let you know as soon as it&apos;s ready.</p>
          <Link href="/" className="btn">Back to the home page</Link>
        </div>
      </AuthShell>
    );
  }
  return (
    <AuthShell
      title="Create your account"
      subtitle="Free trial, no card needed"
      footer={<>Already have an account? <Link href="/login" className="font-bold text-primary">Sign in</Link></>}
    >
      <SignupForm />
    </AuthShell>
  );
}
