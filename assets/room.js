import {
  loadProgram,
  loadUploads,
  ROOMS,
  SESSION_TIMES,
  TRACK_LETTER,
  conferencePosition,
  denverDateTime,
} from "/assets/program.js";

const state = {
  room: null,
  sessions: [],
  uploads: {},
  refreshTimer: null,
};

function detectRoom() {
  // 1. Pathname like /room/B or /room/B/ — primary source
  const m = location.pathname.match(/\/room\/([A-Za-z])\/?$/);
  if (m) return m[1].toUpperCase();
  // 2. Query string ?room=B — fallback (works if Pages preserves search)
  const params = new URLSearchParams(location.search);
  const q = params.get("room");
  if (q) return q.toUpperCase();
  // 3. Default
  return "A";
}

main().catch((err) => {
  console.error(err);
  document.getElementById("room-meta").innerHTML =
    `<h1>Couldn't load program</h1><p class="room-date">Refresh the page or contact the organizers.</p>`;
});

async function main() {
  const roomLetter = detectRoom();
  if (!ROOMS[roomLetter]) {
    document.getElementById("room-meta").innerHTML =
      `<h1>Unknown room "${escapeHtml(roomLetter)}"</h1><p class="room-date">Use /room/A, /room/B, /room/C, or /room/D.</p>`;
    return;
  }
  state.room = roomLetter;

  const [{ sessions }, uploads] = await Promise.all([loadProgram(), loadUploads()]);
  state.sessions = sessions;
  state.uploads = uploads;

  renderHeader();
  renderSessions();
  highlightNavActive();

  // Refresh the "now" indicator every 30s, full upload refresh every 60s.
  startRefreshLoop();
}

function startRefreshLoop() {
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  state.refreshTimer = setInterval(async () => {
    try {
      state.uploads = await loadUploads();
    } catch {
      /* ignore */
    }
    renderSessions();
  }, 60_000);

  // Re-run highlight more frequently
  setInterval(() => renderSessions(), 30_000);
}

function renderHeader() {
  const room = ROOMS[state.room];
  const dt = denverDateTime();
  document.getElementById("room-meta").innerHTML = `
    <p class="room-tag">
      Room
      <span class="big">${state.room}</span>
      · ${room.name} · ${room.building}
    </p>
    <h1>Friday May 29 – Saturday May 30, 2026</h1>
    <p class="room-date">Mountain Time · now ${dt.hhmm}</p>
  `;
}

function roomSessions() {
  const trackIdx = TRACK_LETTER.indexOf(state.room) + 1;
  return state.sessions
    .filter((s) => s.track === trackIdx)
    .sort((a, b) => a.period - b.period);
}

function renderSessions() {
  const root = document.getElementById("sessions");
  const sessions = roomSessions();

  if (!sessions.length) {
    root.innerHTML = `<div class="room-empty">No sessions scheduled in this room.</div>`;
    return;
  }

  const pos = conferencePosition();
  const liveCheck = pos.kind !== "off"; // only highlight now/past when actually on a conference day
  const nowHHMM = pos.denver.hhmm;
  const today = pos.denver.date;

  // Group sessions by day
  const byDay = { fri: [], sat: [] };
  for (const s of sessions) byDay[s.time.day].push(s);

  const dayBlock = (label, list) => {
    if (!list.length) return "";
    return `
      <h2 class="day-heading">${label}</h2>
      ${list.map((s) => sessionCard(s, liveCheck, nowHHMM, today)).join("")}
    `;
  };

  root.innerHTML = `
    ${dayBlock("Friday · May 29", byDay.fri)}
    ${dayBlock("Saturday · May 30", byDay.sat)}
  `;
}

function sessionCard(s, liveCheck, nowHHMM, today) {
  const t = s.time;
  const status = liveCheck && t.date === today ? sessionStatus(t, nowHHMM) : "neutral";
  const cls = status === "now" ? "is-now" : status === "past" ? "is-past" : "";
  return `
    <article class="session-card ${cls}">
      <p class="when">${t.label.replace(/^\w+ \w+ \d+ · /, "")}</p>
      <h2>${escapeHtml(s.theme)}</h2>
      ${s.description ? `<p class="desc">${escapeHtml(s.description)}</p>` : ""}
      <ol class="paper-list">
        ${s.papers.map((p, i) => paperRow(p, i + 1)).join("")}
      </ol>
    </article>
  `;
}

function sessionStatus(time, nowHHMM) {
  if (nowHHMM > time.end) return "past";
  if (nowHHMM >= time.start && nowHHMM <= time.end) return "now";
  return "upcoming";
}

function paperRow(p, n) {
  const uploaded = state.uploads[p.id];
  if (uploaded) {
    const href = `/files/${uploaded.key}`;
    return `
      <li>
        <a class="paper-link" href="${href}" target="_blank" rel="noopener">
          <span class="num">${n}.</span>
          <span class="info">
            <span class="title">${escapeHtml(p.title)}</span>
            <span class="who">${escapeHtml(p.authors)}</span>
          </span>
          <span class="tag">${uploaded.ext.toUpperCase()}</span>
        </a>
      </li>
    `;
  }
  return `
    <li>
      <div class="paper-link no-slides">
        <span class="num">${n}.</span>
        <span class="info">
          <span class="title">${escapeHtml(p.title)}</span>
          <span class="who">${escapeHtml(p.authors)}</span>
        </span>
        <span class="tag missing">No slides yet</span>
      </div>
    </li>
  `;
}

function highlightNavActive() {
  document.querySelectorAll(".room-nav a").forEach((a) => {
    if (a.dataset.room === state.room) a.classList.add("active");
  });
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
