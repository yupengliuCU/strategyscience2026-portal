/**
 * Proxy upload endpoint. The browser PUTs the file body straight to this URL
 * on slides.strategyscience2026.org, which keeps all upload traffic inside
 * Cloudflare's network and avoids the *.r2.cloudflarestorage.com hostname
 * that CU VPN's egress firewall RSTs.
 *
 * The file body is streamed straight from the request to R2 via the bucket
 * binding — never buffered in JS memory. Cloudflare Workers caps the
 * request body at 100 MiB, which matches the UI's existing limit, so we
 * don't lose any practical headroom by switching away from presigned URLs.
 */
import { ALLOWED_EXTS, EXT_TO_MIME, PAPER_ID_RE } from "../_lib/constants.js";

const MAX_BYTES = 100 * 1024 * 1024;

export async function onRequestPut({ request, env }) {
  return handle(request, env);
}
export async function onRequestPost({ request, env }) {
  return handle(request, env);
}

async function handle(request, env) {
  if (!env.SLIDES_BUCKET) {
    return jsonError(500, "Server not configured: SLIDES_BUCKET binding missing.");
  }

  const url = new URL(request.url);
  const paperId = url.searchParams.get("paperId") || "";
  const ext = (url.searchParams.get("ext") || "").toLowerCase();

  if (!PAPER_ID_RE.test(paperId)) {
    return jsonError(400, "Invalid paperId.");
  }
  if (!ALLOWED_EXTS.includes(ext)) {
    return jsonError(400, `Unsupported file type. Accepted: ${ALLOWED_EXTS.join(", ")}`);
  }

  // Defensive content-length check (Workers also enforces this at the edge).
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared && declared > MAX_BYTES) {
    return jsonError(413, `File too large (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB).`);
  }
  if (!request.body) {
    return jsonError(400, "Empty request body.");
  }

  const keepKey = `slides/${paperId}.${ext}`;

  // Sweep stale files with this paperId but a different extension before we
  // overwrite, so /api/uploads doesn't return both the old and the new entry.
  const listed = await env.SLIDES_BUCKET.list({ prefix: `slides/${paperId}.` });
  const stale = listed.objects.filter((o) => o.key !== keepKey).map((o) => o.key);
  if (stale.length) {
    await env.SLIDES_BUCKET.delete(stale);
  }

  await env.SLIDES_BUCKET.put(keepKey, request.body, {
    httpMetadata: { contentType: EXT_TO_MIME[ext] },
  });

  return Response.json({
    ok: true,
    key: keepKey,
    ext,
    deletedStale: stale,
  });
}

function jsonError(status, message) {
  return Response.json({ error: message }, { status });
}
