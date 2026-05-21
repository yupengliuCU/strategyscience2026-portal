/**
 * Catch-all handler for /room/A, /room/B, /room/C, /room/D (and anything
 * under /room/). The named-placeholder _redirects rule was not catching
 * cleanly in production, so we serve room.html via a Pages Function instead.
 *
 * The browser URL stays at /room/X — the room.js client code reads the
 * room letter from location.pathname.
 */
export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  url.pathname = "/room.html";
  return env.ASSETS.fetch(url);
}
