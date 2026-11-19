import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifyToken } from "@/lib/session";

// Pages anyone can open without signing in
const PUBLIC_PATHS = new Set(["/privacy", "/terms", "/welcome", "/signup", "/verify", "/resend-verification", "/forgot-password", "/reset-password"]);

// Cheap first gate: no valid session cookie -> /login.
// Real authorisation (user still exists, not disabled, admin role) is checked in the server code.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await verifyToken(request.cookies.get(SESSION_COOKIE)?.value);

  // One-time first-run setup page (protected by SETUP_TOKEN, refuses once an admin exists)
  if (pathname === "/setup") return NextResponse.next();

  // Public pages: the landing page and privacy notice
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  if (pathname === "/login") {
    if (session) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }
  if (!session) {
    // Logged-out visitors to the front door see the landing page (the address stays "/")
    if (pathname === "/") return NextResponse.rewrite(new URL("/welcome", request.url));
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
