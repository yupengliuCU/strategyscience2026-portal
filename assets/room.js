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

main().catch((err) => {
  console.error(err);
  document.getElementById("room-meta").innerHTML =
    `<h1>Couldn't load program</h1><p class="room-date">Refresh the page or contact the organizers.</p>`;
});

async function main() {
  const params = new URLSearchParams(location.search);
  const roomLetter = (params.get("room") || "A").toUpperCase();
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
  const pos = conferencePosition();
  const dateLabel = posDateLabel(pos);
  document.getElementById("room-meta").innerHTML = `
    <p class="room-tag">
      Room
      <span class="big">${state.room}</span>
      · ${room.name} · ${room.building}
    </p>
    <h1>${dateLabel.title}</h1>
    <p class="room-date">${dateLabel.subtitle}</p>
  `;
}

function posDateLabel(pos) {
  if (pos.kind === "off") {
    return {
      title: "Conference is not in session today",
      subtitle: `Today is ${pos.denver.date}. The conference runs May 28–30, 2026.`,
    };
  }
  const day = pos.day;
  if (day === "fri") {
    return { title: "Friday, May 29, 2026", subtitle: `Mountain Time · now ${pos.denver.hhmm}` };
  }
  return { title: "Saturday, May 30, 2026", subtitle: `Mountain Time · now ${pos.denver.hhmm}` };
}

function todaysSessions() {
  const pos = conferencePosition();
  if (pos.kind === "off") return { pos, sessions: [] };
  const trackIdx = TRACK_LETTER.indexOf(state.room) + 1;
  const periods = pos.day === "fri" ? [1, 2, 3] : [4, 5];
  const sessions = state.sessions
    .filter((s) => s.track === trackIdx && periods.includes(s.period))
    .sort((a, b) => a.period - b.period);
  return { pos, sessions };
}

function renderSessions() {
  const root = document.getElementById("sessions");
  const { pos, sessions } = todaysSessions();

  if (pos.kind === "off") {
    root.innerHTML = `
      <div class="room-empty">
        <p>The conference isn't running today.</p>
        <p style="font-family: var(--mono); font-size: 13px; margin-top: 8px;">
          May 29 (Fri) sessions: S1–S3 · May 30 (Sat) sessions: S4–S5
        </p>
      </div>
    `;
    return;
  }

  if (!sessions.length) {
    root.innerHTML = `<div class="room-empty">No sessions scheduled in this room today.</div>`;
    return;
  }

  const nowHHMM = pos.denver.hhmm;

  root.innerHTML = sessions
    .map((s) => {
      const t = s.time;
      const status = sessionStatus(t, nowHHMM);
      return `
        <article class="session-card ${status === "now" ? "is-now" : status === "past" ? "is-past" : ""}">
          <p class="when">${t.label.replace(/^\w+ \w+ \d+ · /, "")}</p>
          <h2>${escapeHtml(s.theme)}</h2>
          ${s.description ? `<p class="desc">${escapeHtml(s.description)}</p>` : ""}
          <ol class="paper-list">
            ${s.papers.map((p, i) => paperRow(p, i + 1)).join("")}
          </ol>
        </article>
      `;
    })
    .join("");
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
