/**
 * Cache-bust /assets/* URLs in HTML responses.
 *
 * Why: when we change upload.js or room.js, Chrome's in-memory module map
 * sometimes keeps the old type="module" script alive across reloads — even
 * with Cache-Control: no-store on the network layer. By rewriting
 *   <script src="/assets/upload.js">
 * to
 *   <script src="/assets/upload.js?v=Lxxxx">
 * on every HTML response, the URL changes between deploys (and between
 * page loads), so the browser is guaranteed to treat it as a fresh module.
 *
 * Runs on every request but only touches text/html 2xx GET responses.
 * Everything else (API JSON, R2 binary streams, redirects) passes through
 * untouched.
 */
export async function onRequest(context) {
  const response = await context.next();

  if (context.request.method !== "GET") return response;
  if (response.status < 200 || response.status >= 300) return response;

  const ct = response.headers.get("content-type") || "";
  if (!ct.includes("text/html")) return response;

  const version = Date.now().toString(36);
  const html = await response.text();
  const updated = html.replace(
    /(["'])(\/assets\/[^"'?\s]+)(?:\?[^"'\s]*)?\1/g,
    (_m, q, path) => `${q}${path}?v=${version}${q}`,
  );

  const newHeaders = new Headers(response.headers);
  newHeaders.delete("content-length"); // body length changed
  newHeaders.delete("content-encoding"); // body now plain text

  return new Response(updated, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
