"use client";

import { useRef } from "react";

const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function PasswordInput({ id = "password" }: { id?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  function generate() {
    const bytes = crypto.getRandomValues(new Uint32Array(12));
    const pw = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
    if (ref.current) ref.current.value = pw;
  }
  return (
    <div className="flex gap-2">
      <input
        ref={ref}
        id={id}
        name="password"
        type="text"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        minLength={10}
        required
        placeholder="Temporary password"
        className="field font-mono"
      />
      <button type="button" onClick={generate} className="btn-soft shrink-0">
        Generate
      </button>
    </div>
  );
}
