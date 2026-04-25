/**
 * Dev-only QA routes. In production, set ENABLE_QA_TEMPLATES=true to allow access.
 */
export function isQaTemplatesRouteEnabled(): boolean {
  if (process.env.ENABLE_QA_TEMPLATES === "true") return true;
  return process.env.NODE_ENV !== "production";
}
