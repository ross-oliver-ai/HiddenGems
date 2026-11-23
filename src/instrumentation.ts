import type { Instrumentation } from "next";

// Next.js calls this whenever a page, route or server action crashes on the server. We email the owner (see src/lib/alerts.ts).
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordError } = await import("@/lib/alerts");
  await recordError({ source: context.routeType, error: err, route: context.routePath || request.path });
};
