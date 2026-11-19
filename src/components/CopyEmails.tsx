"use client";

import { useState } from "react";

export function CopyEmails({ emails }: { emails: string[] }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-soft shrink-0"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(emails.join(", "));
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          window.prompt("Copy these emails:", emails.join(", "));
        }
      }}
    >
      {done ? "Copied ✓" : "Copy emails"}
    </button>
  );
}
