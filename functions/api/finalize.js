import { ALLOWED_EXTS, PAPER_ID_RE } from "../_lib/constants.js";

export async function onRequestPost({ request, env }) {
  if (!env.SLIDES_BUCKET) {
    return Response.json({ error: "Server not configured: SLIDES_BUCKET binding missing." }, { status: 500 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const paperId = String(payload.paperId || "");
  const ext = String(payload.ext || "").toLowerCase();

  if (!PAPER_ID_RE.test(paperId)) {
    return Response.json({ error: "Invalid paperId." }, { status: 400 });
  }
  if (!ALLOWED_EXTS.includes(ext)) {
    return Response.json({ error: "Invalid ext." }, { status: 400 });
  }

  const keepKey = `slides/${paperId}.${ext}`;
  const listed = await env.SLIDES_BUCKET.list({ prefix: `slides/${paperId}.` });

  const stale = listed.objects.filter((o) => o.key !== keepKey).map((o) => o.key);
  if (stale.length) {
    await env.SLIDES_BUCKET.delete(stale);
  }

  return Response.json({ ok: true, deletedStale: stale });
}
