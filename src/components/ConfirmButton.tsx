"use client";

/** A submit button that asks "are you sure?" first. Use inside a <form action={...}>. */
export function ConfirmButton({
  message,
  children,
  className = "btn-soft w-full",
}: {
  message: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
