import { NextResponse } from "next/server";

// Only exists for the browser tests: it throws on purpose so they can check the error alert is recorded.
// Without E2E_BOOM=1 (never set in production) it pretends not to exist.
export async function GET() {
  if (process.env.E2E_BOOM !== "1") return NextResponse.json({ error: "Not found" }, { status: 404 });
  throw new Error("Deliberate test error for ada@example.com with token abcdefghijklmnopqrstuvwxyz0123456789");
}
