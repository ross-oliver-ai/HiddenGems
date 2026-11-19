import Link from "next/link";
import { adminExists } from "./actions";
import { SetupForm } from "./SetupForm";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const done = await adminExists();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-10">
      <div className="mb-6 flex flex-col items-center text-center">
        <Logo size={56} />
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight">First-time setup</h1>
      </div>
      {done ? (
        <div className="card space-y-3 text-center">
          <p className="font-bold">Setup has already been completed.</p>
          <Link href="/login" className="btn w-full">Go to sign in</Link>
        </div>
      ) : (
        <SetupForm />
      )}
    </main>
  );
}
