"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  className = "btn w-full",
  pendingText = "Please wait…",
  name,
  value,
}: {
  name?: string;
  value?: string;
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} className={className}>
      {pending ? pendingText : children}
    </button>
  );
}
