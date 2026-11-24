/**
 * Where someone lands straight after signing in (or after the forced first password change).
 * Admins go to the Overview (`/admin`), where they spend their time; everyone else goes to Home.
 * Only the moment of signing in uses this: opening the app while already signed in, and the Home tab, still go to Home.
 */
export function landingPathFor(role: string): string {
  return role === "admin" ? "/admin" : "/";
}
