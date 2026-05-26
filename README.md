# 2026 Strategy Science Conference — Presenter Portal

Companion site to [strategyscience2026.org](https://strategyscience2026.org).
Lets presenters upload slides ahead of time and lets each classroom pull them up during the session.

- **Upload portal** — `https://slides.strategyscience2026.org/`
- **Room views** — `https://slides.strategyscience2026.org/room/A` (B, C, D)

Honor system. No login. No per-paper magic links.

---

## Repo layout

```
.
├── index.html              # Upload portal (page 1)
├── room.html               # Room view (page 2) — served at /room/A,B,C,D via _redirects
├── _redirects              # Cloudflare Pages rewrite rule
├── assets/
│   ├── styles.css          # Design tokens + components
│   ├── program.js          # Shared: load program.json + schedule helpers
│   ├── upload.js           # Upload portal logic
│   └── room.js             # Room view logic
├── functions/              # Cloudflare Pages Functions
│   ├── _lib/
│   │   └── constants.js    # Shared constants (allowed exts, MIME)
│   ├── api/
│   │   ├── upload.js       # PUT: stream file body to R2 (proxy upload)
│   │   ├── delete.js       # POST: delete slides/<paperId>.* from R2
│   │   └── uploads.js      # GET:  list of all uploaded slides
│   ├── files/
│   │   └── [[path]].js     # GET /files/slides/<id>.<ext>: stream from R2
│   └── room/
│       └── [[path]].js     # GET /room/<letter>: serve room.html (routing)
├── package.json            # No runtime deps
└── README.md
```

The paper list is fetched at runtime from the main site's repo
(`raw.githubusercontent.com/.../program.json`). No data is duplicated here.

---

## First-time setup (Cloudflare dashboard)

You'll do all of this in the Cloudflare dashboard.
Claude can't reach the dashboard, so this is a manual step.

### 1. Create the R2 bucket

1. **Cloudflare dashboard → R2 → Create bucket**
2. Name: `ssc2026-slides` (or whatever — note the exact name; you'll need it later)
3. Location hint: **North America (West)** — closer to Boulder.

No CORS configuration needed — the browser only ever talks to
`slides.strategyscience2026.org`; the Pages Function (running on the same
edge) is what writes to R2 via the bucket binding.

### 2. Connect this repo to Cloudflare Pages

1. **Pages → Create application → Connect to Git**
2. Select the GitHub repo `yupengliuCU/strategyscience2026-portal`.
3. Project name: `ssc2026-portal` (or whatever — this becomes the `*.pages.dev` URL).
4. Production branch: `main`.
5. Framework preset: **None**.
6. Build command: leave empty.
7. Build output directory: leave empty (root). If the form requires a value, enter `/`.
8. Root directory: leave empty.
9. Click **Save and Deploy**.
10. Wait for the first build to finish.

### 3. Add the R2 bucket binding

1. After the first deploy: **your project → Settings → Functions → Bindings**.
2. Add an **R2 bucket binding**:
   - Variable name: `SLIDES_BUCKET`
   - R2 bucket: select `ssc2026-slides`
   - Apply to: both **Production** and **Preview**
3. Go to **Deployments**, click the latest one's `⋯` menu, and pick **Retry deployment**
   so the Functions pick up the new binding.

No API tokens or environment variables are needed — the bucket binding gives
Functions read/write access directly, without S3-style signing.

### 4. Hook up the subdomain

1. **DNS** for `strategyscience2026.org`: this should already live on Cloudflare since the main site is there.
2. **Pages project → Custom domains → Set up a custom domain** → enter `slides.strategyscience2026.org`.
   - Cloudflare adds the CNAME automatically if DNS is on the same account.
   - If it asks you to add a CNAME manually: `slides` → `<project-name>.pages.dev`.
3. Wait ~30s for the certificate to issue.

### 6. Smoke test

1. Visit `https://slides.strategyscience2026.org/`. You should see the upload portal.
2. Upload a small PDF for any paper. The card should flip to "uploaded".
3. Visit `https://slides.strategyscience2026.org/room/A` through `/room/D`. Each should
   show all sessions for that room across Friday and Saturday. The "NOW" highlight only
   activates on May 29 or May 30; outside those dates, sessions render without it.

---

## Pushing updates

The user pushes from this machine, using a short-lived GitHub Personal Access Token.

1. Make changes locally (or ask Claude to).
2. Commit:
   ```bash
   git add .
   git commit -m "your message"
   ```
3. Generate a short-lived PAT: <https://github.com/settings/tokens/new>
   - Scope: `repo`
   - Expiry: **1 day**
4. Push:
   ```bash
   git push https://yupengliuCU:<PAT>@github.com/yupengliuCU/strategyscience2026-portal.git main
   ```
5. Revoke the PAT immediately: <https://github.com/settings/tokens>
6. Cloudflare Pages auto-deploys from `main` within ~30 seconds.

---

## Local development (optional)

```bash
npx wrangler pages dev . --r2 SLIDES_BUCKET=ssc2026-slides
```

Easier in practice: push to a feature branch — Cloudflare Pages auto-builds a preview URL.

---

## How things work

### Upload flow

1. Presenter picks a file in `/`.
2. Browser → `PUT /api/upload?paperId=Pxxx&ext=pdf` with the file body.
3. Pages Function streams the body into R2 via the `SLIDES_BUCKET` binding.
4. Before writing, the function lists `slides/<paperId>.*` and deletes any
   stale entries with a different extension, so a `.pptx` cleanly replaces a `.pdf`.
5. Function returns `{ ok: true, key, ext }`; UI flips the card to "uploaded".

We previously used presigned URLs (browser → R2 directly) to bypass the
Workers 100 MiB request-body cap. That approach broke for users on CU's
VPN, whose egress firewall RSTs connections to `*.r2.cloudflarestorage.com`.
The proxy flow keeps all browser traffic on `slides.strategyscience2026.org`
and still fits inside the 100 MiB ceiling that matches the UI's existing limit.

### Read flow (room view)

1. `GET /api/uploads` returns a map of `paperId → {ext, key, uploadedAt, sizeBytes}` by
   listing the R2 bucket. There's no `_index.json` — the bucket listing is the source of truth.
2. Click a paper → `GET /files/slides/<paperId>.<ext>` streams the object out of R2.
   PDFs come back `inline`; PowerPoint / Keynote come back as `attachment` (download).

### Schedule logic

`assets/program.js` hardcodes the session windows in **Mountain Time**:

| Session | Day        | Time              |
|---------|------------|-------------------|
| S1      | Fri May 29 | 9:30 – 11:00 AM   |
| S2      | Fri May 29 | 2:00 – 3:30 PM    |
| S3      | Fri May 29 | 4:00 – 5:30 PM    |
| S4      | Sat May 30 | 9:00 – 10:30 AM   |
| S5      | Sat May 30 | 11:00 AM – 12:30 PM |

Room codes are derived from the program's `(period, track)` pair:
`S{period}{['A','B','C','D'][track-1]}`. E.g., the session with period=2, track=3 displays as **S2C**.

Rooms:

| Letter | Name      | Building              |
|--------|-----------|-----------------------|
| A      | ECCS 201  | Engineering Center    |
| B      | KOBL 352  | Koelbel               |
| C      | KOBL 323  | Koelbel               |
| D      | KOBL 317  | Koelbel               |

The room view uses the browser's wall clock, converted to America/Denver, to mark the
"NOW" session. Sessions in the past are dimmed; upcoming sessions are full-bright.

---

## Troubleshooting

**"Server not configured: SLIDES_BUCKET binding missing"** — the R2 binding isn't
attached to the Pages project, or the deployment was made before the binding was
added. Add the binding (Settings → Functions → Bindings) and retry the deployment.

**"Network error during upload" / `ERR_CONNECTION_RESET`** — usually a network
middleman (corporate VPN, school VPN, hotel WiFi) RSTing the connection. Have the
presenter disconnect VPN and try again. The portal lives on
`slides.strategyscience2026.org` and never touches `*.r2.cloudflarestorage.com`,
which catches most of these cases.

**A paper appears uploaded with the wrong file** — the presenter uploaded to the
wrong card. Press **Delete** on that card to wipe the file, then have the right
presenter upload to their own card.

**Need to hide a paper (presenter cancelled)** — add their paper ID to
`HIDDEN_PAPER_IDS` in `assets/program.js`, commit, push. The session's per-paper
numbering renumbers automatically.

---

## Security notes

- No authentication is intentional. Risk surface: someone with the right `paperId`
  could upload or delete a bogus file. They can't read other papers' data (no
  per-paper listing endpoint).
- The R2 binding is scoped to this one bucket. No S3 API keys are stored anywhere.
- After the conference: delete the bucket if you want a clean slate.
