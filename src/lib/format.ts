// Money and date helpers (GBP, UK dates, London time)

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

export function money(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "–";
  return gbp.format(Number(v));
}

/** A percentage as a whole number ("62%"), or a dash when there is nothing to show. */
export function percent(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "–";
  return `${Math.round(n)}%`;
}

/** Parses "£1.50", "1,50", "1.5" -> "1.50". Returns null when empty/invalid. */
export function parseMoney(raw: FormDataEntryValue | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).replace(/[£\s]/g, "");
  if (!s) return null;
  if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
  s = s.replace(/,/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n > 100000) return null;
  return n.toFixed(2);
}

/** Like parseMoney, but an empty box means 0.00 (for optional amounts such as fees). null = something was typed but isn't an amount. */
export function parseOptionalMoney(raw: FormDataEntryValue | null | undefined): string | null {
  if (raw === null || raw === undefined || String(raw).replace(/[£\s]/g, "") === "") return "0.00";
  return parseMoney(raw);
}

export function todayLondon(): string {
  // en-CA gives YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
}

export function shortDate(d: string | null | undefined): string {
  if (!d) return "–";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function daysBetween(from: string, to: string = todayLondon()): number {
  const a = Date.parse(from + "T00:00:00Z");
  const b = Date.parse(to + "T00:00:00Z");
  return Math.max(0, Math.round((b - a) / 86_400_000));
}
