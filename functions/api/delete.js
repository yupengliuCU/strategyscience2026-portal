import { PAPER_ID_RE } from "../_lib/constants.js";

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
  if (!PAPER_ID_RE.test(paperId)) {
    return Response.json({ error: "Invalid paperId." }, { status: 400 });
  }

  // Find every object under slides/{paperId}.* and delete them all.
  const listed = await env.SLIDES_BUCKET.list({ prefix: `slides/${paperId}.` });
  const keys = listed.objects.map((o) => o.key);

  if (keys.length) {
    await env.SLIDES_BUCKET.delete(keys);
  }

  return Response.json({ ok: true, deleted: keys });
}
