import { EXT_TO_MIME } from "../_lib/constants.js";

const INLINE_EXTS = new Set(["pdf"]);

export async function onRequestGet({ params, env, request }) {
  if (!env.SLIDES_BUCKET) {
    return new Response("Server not configured", { status: 500 });
  }

  const raw = Array.isArray(params.path) ? params.path.join("/") : String(params.path || "");
  if (!raw || raw.includes("..")) {
    return new Response("Not Found", { status: 404 });
  }

  const obj = await env.SLIDES_BUCKET.get(raw, {
    onlyIf: request.headers,
    range: request.headers,
  });

  if (!obj) {
    return new Response("Not Found", { status: 404 });
  }

  const ext = (raw.split(".").pop() || "").toLowerCase();
  const contentType = EXT_TO_MIME[ext] || "application/octet-stream";
  const basename = raw.split("/").pop();
  const disposition = INLINE_EXTS.has(ext)
    ? "inline"
    : `attachment; filename="${basename.replace(/"/g, "")}"`;

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("Content-Type", contentType);
  headers.set("Content-Disposition", disposition);
  headers.set("Cache-Control", "private, max-age=60");
  if (obj.httpEtag) headers.set("ETag", obj.httpEtag);

  if (obj.body) {
    return new Response(obj.body, { headers, status: obj.range ? 206 : 200 });
  }
  return new Response(null, { headers, status: 304 });
}
