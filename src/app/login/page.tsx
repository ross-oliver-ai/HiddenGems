import Link from "next/link";
import { AuthShell, Notice } from "@/components/AuthShell";
import { emailConfigured, signupsOpen } from "@/lib/email";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ verified?: string; reset?: string }> }) {
  const sp = await searchParams;
  return (
    <AuthShell
      title="Hidden Gems"
      subtitle="Sign in to see your finds"
      footer={
        signupsOpen() ? (
          <>New here? <Link href="/signup" className="font-bold text-primary">Create an account</Link></>
        ) : (
          "No account? Ask the admin to set one up for you."
        )
      }
    >
      {sp.verified && <div className="mb-4"><Notice>Email confirmed! You can sign in now.</Notice></div>}
      {sp.reset && <div className="mb-4"><Notice>Password changed. Please sign in.</Notice></div>}
      <LoginForm canReset={emailConfigured()} />
    </AuthShell>
  );
}
