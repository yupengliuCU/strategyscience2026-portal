export const ALLOWED_EXTS = ["pdf", "ppt", "pptx", "key"];

export const EXT_TO_MIME = {
  pdf: "application/pdf",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  key: "application/vnd.apple.keynote",
};

export const PAPER_ID_RE = /^P\d{3}$/;
