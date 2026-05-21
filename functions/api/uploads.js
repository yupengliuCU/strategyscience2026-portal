export async function onRequestGet({ env }) {
  if (!env.SLIDES_BUCKET) {
    return Response.json({ error: "Server not configured: SLIDES_BUCKET binding missing." }, { status: 500 });
  }

  const index = {};
  let cursor;
  do {
    const result = await env.SLIDES_BUCKET.list({ prefix: "slides/", cursor });
    for (const obj of result.objects) {
      const match = obj.key.match(/^slides\/(P\d{3})\.([a-z0-9]+)$/i);
      if (!match) continue;
      const [, paperId, ext] = match;
      index[paperId] = {
        ext: ext.toLowerCase(),
        key: obj.key,
        uploadedAt: obj.uploaded ? obj.uploaded.toISOString() : null,
        sizeBytes: obj.size,
      };
    }
    cursor = result.truncated ? result.cursor : undefined;
  } while (cursor);

  return Response.json(index, {
    headers: { "Cache-Control": "no-store" },
  });
}
