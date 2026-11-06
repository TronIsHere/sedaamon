/**
 * Universal Links: lets the macOS app (desktop/) open invite links (sedamon.ir/invite/...) itself instead of
 * the browser. macOS reads this from the site root and only trusts it for an app signed by APPLE_TEAM_ID.
 */
const BUNDLE_ID = "ir.arzhaam.seda";

export function GET() {
  const team = process.env.APPLE_TEAM_ID;
  if (!team) return new Response("Not found", { status: 404 });
  return Response.json({
    applinks: { details: [{ appIDs: [`${team}.${BUNDLE_ID}`], components: [{ "/": "/invite/*" }] }] },
  });
}
