import { AwsClient } from "aws4fetch";
import { ALLOWED_EXTS, EXT_TO_MIME, PAPER_ID_RE } from "../_lib/constants.js";

const ENV_VARS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"];

export async function onRequestPost({ request, env }) {
  for (const v of ENV_VARS) {
    if (!env[v]) {
      return jsonError(500, `Server not configured: ${v} is missing.`);
    }
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body.");
  }

  const paperId = String(payload.paperId || "");
  const filename = String(payload.filename || "");

  if (!PAPER_ID_RE.test(paperId)) {
    return jsonError(400, "Invalid paperId.");
  }

  const ext = filename.includes(".") ? filename.split(".").pop().toLowerCase() : "";
  if (!ALLOWED_EXTS.includes(ext)) {
    return jsonError(400, `Unsupported file type. Accepted: ${ALLOWED_EXTS.join(", ")}`);
  }

  const contentType = EXT_TO_MIME[ext];
  const key = `slides/${paperId}.${ext}`;

  const client = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  });

  const target = new URL(`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_NAME}/${key}`);
  target.searchParams.set("X-Amz-Expires", "3600");

  const signed = await client.sign(target, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    aws: { signQuery: true },
  });

  return Response.json({
    uploadUrl: signed.url,
    method: "PUT",
    headers: { "Content-Type": contentType },
    key,
    ext,
  });
}

function jsonError(status, message) {
  return Response.json({ error: message }, { status });
}
