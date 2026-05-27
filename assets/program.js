/**
 * Shared utilities for loading program data and computing schedule.
 * Used by both the upload portal (index.html) and the room view (room.html).
 */

export const PROGRAM_URL =
  "https://raw.githubusercontent.com/yupengliuCU/strategyscience2026/main/deploy/data/program.json";

// R2 Custom Domain ("Connect Domain") on the same Cloudflare zone as the
// portal. Downloads from room views point here directly, bypassing the
// Pages Function proxy. We had to switch because the on-campus CU VPN
// kills response streams from slides.strategyscience2026.org for some
// downloads. The r2.* subdomain — same TLS cert chain, same zone, but
// fronted by R2 instead of Pages — isn't on whatever blocklist is tripping
// the VPN.
export const R2_PUBLIC_BASE = "https://r2.strategyscience2026.org";

// Papers to hide from the portal (e.g., presenter cancelled). The main program
// data is maintained in the conference site repo; this is the portal's local
// override so we don't have to wait for a content commit upstream.
export const HIDDEN_PAPER_IDS = new Set([
  "P094", // presenter cancelled, May 21
]);

// Hardcoded schedule (matches strategyscience2026.org).
// Times are America/Denver wall-clock.
export const SESSION_TIMES = {
  1: { day: "fri", date: "2026-05-29", start: "09:30", end: "11:00", label: "Friday May 29 · 9:30–11:00 AM" },
  2: { day: "fri", date: "2026-05-29", start: "14:00", end: "15:30", label: "Friday May 29 · 2:00–3:30 PM" },
  3: { day: "fri", date: "2026-05-29", start: "16:00", end: "17:30", label: "Friday May 29 · 4:00–5:30 PM" },
  4: { day: "sat", date: "2026-05-30", start: "09:00", end: "10:30", label: "Saturday May 30 · 9:00–10:30 AM" },
  5: { day: "sat", date: "2026-05-30", start: "11:00", end: "12:30", label: "Saturday May 30 · 11:00 AM–12:30 PM" },
};

export const ROOMS = {
  A: { name: "ECCS 201", building: "Engineering Center" },
  B: { name: "KOBL 352", building: "Koelbel" },
  C: { name: "KOBL 323", building: "Koelbel" },
  D: { name: "KOBL 317", building: "Koelbel" },
};

export const TRACK_LETTER = ["A", "B", "C", "D"];

export function roomCode(period, track) {
  return `S${period}${TRACK_LETTER[track - 1]}`;
}

export function letterFromTrack(track) {
  return TRACK_LETTER[track - 1];
}

let _programCache = null;
export async function loadProgram() {
  if (_programCache) return _programCache;
  // Always fetch fresh — title / author / abstract edits in the main-site
  // repo need to propagate the next time anyone loads the portal. The
  // in-memory _programCache below still avoids re-fetching within a single
  // page load.
  const res = await fetch(PROGRAM_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load program (${res.status})`);
  const raw = await res.json();
  _programCache = enrichProgram(raw);
  return _programCache;
}

function enrichProgram(raw) {
  const sessions = raw.sessions
    .map((s) => {
      const visiblePapers = (raw.papers[s.id] || []).filter(
        (p) => !HIDDEN_PAPER_IDS.has(p.id),
      );
      return {
        ...s,
        code: roomCode(s.period, s.track),
        roomLetter: letterFromTrack(s.track),
        time: SESSION_TIMES[s.period],
        papers: visiblePapers.map((p, i) => ({
          ...p,
          sessionId: s.id,
          sessionCode: roomCode(s.period, s.track),
          positionInSession: i + 1,
          positionTotal: visiblePapers.length,
        })),
      };
    })
    .sort((a, b) => a.period - b.period || a.track - b.track);

  return { sessions };
}

export async function loadUploads() {
  try {
    const res = await fetch("/api/uploads", { cache: "no-store" });
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

/**
 * Returns the current "conference position" based on now() in America/Denver.
 * - { kind: 'session', period }   if we're inside a session window
 * - { kind: 'day',     day }      if it's a conference day but no active session
 * - { kind: 'off' }                otherwise
 */
export function conferencePosition(now = new Date()) {
  const dt = denverDateTime(now);
  let day = null;
  if (dt.date === "2026-05-29") day = "fri";
  else if (dt.date === "2026-05-30") day = "sat";
  else if (dt.weekday === 5) day = "fri"; // fallback for testing in May 2026
  else if (dt.weekday === 6) day = "sat";
  if (!day) return { kind: "off", denver: dt };

  for (const [period, s] of Object.entries(SESSION_TIMES)) {
    if (s.day === day && dt.hhmm >= s.start && dt.hhmm <= s.end) {
      return { kind: "session", period: Number(period), day, denver: dt };
    }
  }
  return { kind: "day", day, denver: dt };
}

export function denverDateTime(now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  // 24h hour: Intl sometimes returns "24" at midnight in older runtimes — normalize.
  const hh = parts.hour === "24" ? "00" : parts.hour;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: weekdayMap[parts.weekday],
    hhmm: `${hh}:${parts.minute}`,
  };
}

export function formatUploadTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

/**
 * Friendly filename for downloads, e.g. "S2C-2-Liu.pdf".
 * Format: {sessionCode}-{positionInSession}-{firstAuthorLastName}.{ext}
 *
 * The R2 storage key still uses the stable internal id (slides/Pxxx.ext) so
 * program data changes don't strand uploaded files. This name is only used
 * for Content-Disposition when the file is served.
 */
export function friendlyFilename(paper, ext) {
  const surname = firstAuthorSurname(paper && paper.authors);
  const session = (paper && paper.sessionCode) || "Session";
  const pos = (paper && paper.positionInSession) || "?";
  return `${session}-${pos}-${surname}.${ext}`;
}

export function firstAuthorSurname(authors) {
  if (!authors) return "Author";
  const firstAuthor = String(authors).split(",")[0].trim();
  if (!firstAuthor) return "Author";
  // Last whitespace-separated token — handles "Georg von Krogh" -> "Krogh"
  const lastWord = firstAuthor.split(/\s+/).pop() || "";
  // Strip diacritics (Unicode combining marks U+0300–U+036F), then everything
  // except letters and hyphens. So "Saint-Exupéry" -> "Saint-Exupery".
  const ascii = lastWord
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z-]/g, "");
  return ascii || "Author";
}

export function formatBytes(b) {
  if (!Number.isFinite(b)) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}
