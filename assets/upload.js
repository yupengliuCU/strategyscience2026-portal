import {
  loadProgram,
  loadUploads,
  ROOMS,
  SESSION_TIMES,
  formatUploadTime,
} from "/assets/program.js";

const MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED_EXTS = ["pdf", "ppt", "pptx", "key"];

const state = {
  sessions: [],
  uploads: {},
};

main().catch((err) => {
  console.error(err);
  document.getElementById("loading-state").textContent =
    "Couldn't load the program. Refresh the page or contact the organizers.";
});

async function main() {
  const [{ sessions }, uploads] = await Promise.all([loadProgram(), loadUploads()]);
  state.sessions = sessions;
  state.uploads = uploads;
  render();
}

function render() {
  renderJumpGrid();
  renderSessions();
}

function renderJumpGrid() {
  const host = document.getElementById("jump-content");
  // group by day: Friday = periods 1–3, Saturday = periods 4–5
  const groups = [
    { label: "Friday May 29", periods: [1, 2, 3] },
    { label: "Saturday May 30", periods: [4, 5] },
  ];
  host.innerHTML = groups
    .map((g) => {
      const cells = g.periods
        .map((period) => {
          const row = state.sessions.filter((s) => s.period === period);
          return row
            .map((s) => {
              const t = SESSION_TIMES[s.period];
              return `
                <a class="jump-cell" href="#sess-${s.code}">
                  <span class="code">${s.code} · ${shortTime(t)}</span>
                  <span class="theme">${escapeHtml(s.theme)}</span>
                </a>
              `;
            })
            .join("");
        })
        .join("");
      return `
        <h2>${g.label}</h2>
        <div class="jump-grid">${cells}</div>
      `;
    })
    .join("");
}

function shortTime(t) {
  const fmt = (hhmm) => {
    const [h, m] = hhmm.split(":").map(Number);
    const period = h >= 12 ? "p" : "a";
    const h12 = ((h + 11) % 12) + 1;
    return m === 0 ? `${h12}${period}` : `${h12}:${m.toString().padStart(2, "0")}${period}`;
  };
  return `${fmt(t.start)}–${fmt(t.end)}`;
}

function renderSessions() {
  const root = document.getElementById("sessions");
  root.innerHTML = state.sessions
    .map((s) => {
      const room = ROOMS[s.roomLetter];
      const t = s.time;
      return `
        <section class="session" id="sess-${s.code}">
          <div class="session-head">
            <p class="session-code">${s.code} · ${t.label} · ${room.name}</p>
            <h2 class="session-theme">${escapeHtml(s.theme)}</h2>
            <p class="session-desc">${escapeHtml(s.description || "")}</p>
          </div>
          <div class="papers">
            ${s.papers.map((p) => paperCard(p)).join("")}
          </div>
        </section>
      `;
    })
    .join("");

  // Attach handlers per paper
  for (const s of state.sessions) {
    for (const p of s.papers) {
      attachUploadHandlers(p);
    }
  }
}

function paperCard(p) {
  const uploaded = state.uploads[p.id];
  return `
    <article class="paper ${uploaded ? "is-uploaded" : ""}" data-paper="${p.id}">
      <div class="paper-body">
        <p class="paper-meta">${p.sessionCode} · paper ${p.positionInSession} of ${p.positionTotal}</p>
        <h3 class="paper-title">${escapeHtml(p.title)}</h3>
        <p class="paper-authors">${escapeHtml(p.authors)}</p>
      </div>
      <div class="paper-actions">
        ${renderUploadState(p, uploaded)}
        <div class="btn-row">
          <label class="btn ${uploaded ? "btn-secondary" : ""}" data-role="picker">
            ${uploaded ? "Replace" : "Upload slides"}
            <input class="file-input" type="file" accept=".pdf,.ppt,.pptx,.key" data-paper="${p.id}" />
          </label>
          ${uploaded ? `<button type="button" class="btn btn-danger" data-role="delete" data-paper="${p.id}">Delete</button>` : ""}
        </div>
        <div class="progress" data-role="progress-host" hidden>
          <div class="progress-bar" data-role="progress-bar"></div>
        </div>
        <div class="error" data-role="error" hidden></div>
      </div>
    </article>
  `;
}

function renderUploadState(p, uploaded) {
  if (!uploaded) return "";
  return `
    <div class="upload-state" data-role="state">
      <span class="filename">slides.${uploaded.ext}</span>
      uploaded ${formatUploadTime(uploaded.uploadedAt)}
    </div>
  `;
}

function attachUploadHandlers(p) {
  const card = document.querySelector(`.paper[data-paper="${p.id}"]`);
  if (!card) return;
  const input = card.querySelector(`input[type="file"]`);
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    await handleUpload(p, file, card);
    input.value = ""; // reset so user can re-select same file
  });
  const delBtn = card.querySelector(`[data-role="delete"]`);
  if (delBtn) {
    delBtn.addEventListener("click", () => handleDelete(p, card));
  }
}

async function handleDelete(paper, card) {
  const ok = window.confirm(
    `Delete the uploaded slides?\n\n"${paper.title}"\n\nThis can't be undone, but you can upload again afterward.`,
  );
  if (!ok) return;

  const errEl = card.querySelector(`[data-role="error"]`);
  const delBtn = card.querySelector(`[data-role="delete"]`);
  errEl.hidden = true;
  errEl.textContent = "";
  if (delBtn) {
    delBtn.disabled = true;
    delBtn.textContent = "Deleting…";
  }

  try {
    const res = await fetch("/api/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paperId: paper.id }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Delete failed (${res.status})`);
    }
    delete state.uploads[paper.id];
    replaceCard(paper);
    toast(`Deleted slides for ${paper.sessionCode} paper ${paper.positionInSession}`, "ok");
  } catch (err) {
    console.error(err);
    showError(errEl, err.message || "Delete failed. Try again.");
    toast("Delete failed", "err");
    if (delBtn) {
      delBtn.disabled = false;
      delBtn.textContent = "Delete";
    }
  }
}

async function handleUpload(paper, file, card) {
  const errEl = card.querySelector(`[data-role="error"]`);
  const progressHost = card.querySelector(`[data-role="progress-host"]`);
  const progressBar = card.querySelector(`[data-role="progress-bar"]`);
  const picker = card.querySelector(`[data-role="picker"]`);

  errEl.hidden = true;
  errEl.textContent = "";

  // Client-side validation
  const ext = file.name.toLowerCase().split(".").pop();
  if (!ALLOWED_EXTS.includes(ext)) {
    showError(errEl, `Unsupported file type. Use ${ALLOWED_EXTS.join(", ")}.`);
    return;
  }
  if (file.size > MAX_BYTES) {
    showError(errEl, `File is too large (${(file.size / 1048576).toFixed(1)} MB). Max 100 MB.`);
    return;
  }
  if (file.size === 0) {
    showError(errEl, "That file is empty.");
    return;
  }

  picker.style.pointerEvents = "none";
  picker.style.opacity = "0.6";
  progressHost.hidden = false;
  progressBar.style.width = "0%";

  try {
    // PUT the file straight to our own domain. The Pages Function streams it
    // into R2 — keeps traffic inside Cloudflare's network and avoids
    // r2.cloudflarestorage.com, which CU VPN's egress firewall blocks.
    const uploadUrl = `/api/upload?paperId=${encodeURIComponent(paper.id)}&ext=${encodeURIComponent(ext)}`;
    const result = await putWithProgress(uploadUrl, file, {}, (pct) => {
      progressBar.style.width = `${pct}%`;
    });

    // Update local state + re-render card
    state.uploads[paper.id] = {
      ext: result.ext || ext,
      key: result.key || `slides/${paper.id}.${ext}`,
      uploadedAt: new Date().toISOString(),
      sizeBytes: file.size,
    };
    replaceCard(paper);
    toast(`Uploaded slides for ${paper.sessionCode} paper ${paper.positionInSession}`, "ok");
  } catch (err) {
    console.error(err);
    showError(errEl, err.message || "Upload failed. Try again.");
    toast("Upload failed", "err");
  } finally {
    picker.style.pointerEvents = "";
    picker.style.opacity = "";
    progressHost.hidden = true;
  }
}

function replaceCard(paper) {
  const old = document.querySelector(`.paper[data-paper="${paper.id}"]`);
  if (!old) return;
  const tmp = document.createElement("div");
  tmp.innerHTML = paperCard(paper);
  const fresh = tmp.firstElementChild;
  old.replaceWith(fresh);
  attachUploadHandlers(paper);
}

function putWithProgress(url, file, headers, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers || {})) {
      xhr.setRequestHeader(k, v);
    }
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        let parsed = {};
        try {
          parsed = JSON.parse(xhr.responseText || "{}");
        } catch {
          /* upstream may not return JSON (e.g. R2 direct) — that's OK */
        }
        resolve(parsed);
      } else {
        let serverMsg = "";
        try {
          serverMsg = (JSON.parse(xhr.responseText || "{}").error || "");
        } catch {
          /* ignore */
        }
        reject(new Error(serverMsg || `Upload failed: ${xhr.status} ${xhr.statusText}`));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
    xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));
    xhr.send(file);
  });
}

function showError(el, msg) {
  el.hidden = false;
  el.textContent = msg;
}

function toast(msg, kind = "ok") {
  const host = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
