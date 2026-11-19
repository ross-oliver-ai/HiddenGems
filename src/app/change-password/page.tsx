import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { Logo } from "@/components/Logo";

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.mustChangePassword) redirect("/");
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-10">
      <div className="mb-6 flex flex-col items-center text-center">
        <Logo size={56} />
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight">Choose your own password</h1>
        <p className="mt-1 text-muted">Hi {user.name}! Replace the temporary password you were given.</p>
      </div>
      <div className="card">
        <ChangePasswordForm />
      </div>
    </main>
  );
}
