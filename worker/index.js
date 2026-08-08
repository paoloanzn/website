/**
 * Serves the Eleventy build from the ASSETS binding, and records a page view
 * in Workers Analytics Engine.
 *
 * Recorded, per request:  path, referrer *hostname*, country, status code.
 * Not recorded, ever:     IP addresses, user agents, cookies, session or
 *                         visitor identifiers, query strings, or anything
 *                         else that could single out a person.
 *
 * Nothing is sent from the browser — no script, no pixel, no cookie. These
 * are facts the server already sees in the course of answering the request.
 * A visitor cannot be distinguished from any other visitor from the same
 * country reading the same page, which is the point.
 */

const CANONICAL_HOST = "paoloanzn.com";

// Matched against the user agent to keep crawlers out of the page counts. The
// UA is read and thrown away — it is never written to the dataset.
const BOT_RE =
  /bot|crawl|spider|slurp|search|curl|wget|headless|phantom|puppeteer|playwright|monitor|probe|scan|check|python-requests|go-http|okhttp|java\/|libwww|httpx|axios|node-fetch|lighthouse|pingdom|uptime|semrush|ahrefs|dataprovider|screaming/i;

/** Referrer reduced to a bare hostname, so no paths or query strings survive. */
function referrerHost(request) {
  const raw = request.headers.get("referer");
  if (!raw) return "(direct)";
  try {
    const host = new URL(raw).hostname.replace(/^www\./, "");
    return host === CANONICAL_HOST ? "(internal)" : host.slice(0, 64);
  } catch {
    return "(direct)";
  }
}

function record(request, url, response, env) {
  if (!env.ANALYTICS || request.method !== "GET") return;

  const type = response.headers.get("content-type") || "";
  const isPage = type.includes("text/html");
  const isFeed =
    url.pathname === "/feed.xml" || type.includes("application/atom+xml");
  if (!isPage && !isFeed) return;

  // Feed readers are robots by definition, so the bot filter would erase
  // exactly the thing we want to count. Pages get filtered, feeds don't.
  if (isPage) {
    const ua = request.headers.get("user-agent") || "";
    if (!ua || BOT_RE.test(ua)) return;
  }

  // Query strings are dropped: they are the most likely place for something
  // identifying to show up.
  const path = url.pathname.slice(0, 128) || "/";

  env.ANALYTICS.writeDataPoint({
    blobs: [
      path,
      referrerHost(request),
      request.cf?.country || "XX",
      isFeed ? "feed" : "page",
    ],
    doubles: [response.status],
    // The index is the sampling key: if one page gets hammered, only that
    // page's rows get sampled, and everything else stays exact.
    indexes: [path.slice(0, 64)],
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Send www (and anything else pointed at the zone) to the apex. The
    // workers.dev preview hostname doesn't match, so previews still work.
    if (
      url.hostname !== CANONICAL_HOST &&
      url.hostname.endsWith(`.${CANONICAL_HOST}`)
    ) {
      url.hostname = CANONICAL_HOST;
      return Response.redirect(url.toString(), 301);
    }

    const response = await env.ASSETS.fetch(request);

    // Analytics must never be able to break page delivery.
    try {
      record(request, url, response, env);
    } catch {
      // ignored on purpose
    }

    return response;
  },
};
