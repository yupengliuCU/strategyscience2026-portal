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
│   │   ├── upload-url.js   # POST: mint a presigned R2 PUT URL
│   │   ├── finalize.js     # POST: after upload, clean up stale extensions
│   │   └── uploads.js      # GET:  list of all uploaded slides
│   └── files/
│       └── [[path]].js     # GET /files/slides/<id>.<ext>: stream from R2
├── package.json            # Single dep: aws4fetch (V4 signing)
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
4. After creating, open the bucket → **Settings → CORS Policy → Edit**, and paste:

   ```json
   [
     {
       "AllowedOrigins": ["*"],
       "AllowedMethods": ["PUT", "GET", "HEAD"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   `AllowedOrigins: ["*"]` is fine: uploads need a valid presigned signature, so
   wide CORS doesn't expose anything new.

### 2. Create an R2 API token

1. **R2 → Manage R2 API tokens → Create API token**
2. Permissions: **Object Read & Write**
3. Apply to: **the bucket you just created** (not all buckets — narrower is safer)
4. TTL: leave default (forever) or set an end date past June 2026
5. Click **Create** and copy the **Access Key ID** and **Secret Access Key**.
   You'll never see the secret again — save them somewhere temporary.
6. Also note your **Account ID** (visible in the top-right of any Cloudflare page).

### 3. Connect this repo to Cloudflare Pages

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

### 4. Add bindings and environment variables

1. After the first deploy: **your project → Settings → Functions → Bindings**.
2. Add an **R2 bucket binding**:
   - Variable name: `SLIDES_BUCKET`
   - R2 bucket: select `ssc2026-slides`
   - Apply to: both **Production** and **Preview**
3. Add four **Environment Variables** (under Settings → Environment variables; mark each as **Encrypted**):
   - `R2_ACCOUNT_ID` → your Cloudflare Account ID
   - `R2_ACCESS_KEY_ID` → the R2 token's Access Key ID
   - `R2_SECRET_ACCESS_KEY` → the R2 token's Secret Access Key
   - `R2_BUCKET_NAME` → `ssc2026-slides` (same name as the bucket)
4. Apply each to both **Production** and **Preview**.
5. Go to **Deployments**, click the latest one's `⋯` menu, and pick **Retry deployment**
   so the Functions pick up the new bindings.

### 5. Hook up the subdomain

1. **DNS** for `strategyscience2026.org`: this should already live on Cloudflare since the main site is there.
2. **Pages project → Custom domains → Set up a custom domain** → enter `slides.strategyscience2026.org`.
   - Cloudflare adds the CNAME automatically if DNS is on the same account.
   - If it asks you to add a CNAME manually: `slides` → `<project-name>.pages.dev`.
3. Wait ~30s for the certificate to issue.

### 6. Smoke test

1. Visit `https://slides.strategyscience2026.org/`. You should see the upload portal.
2. Upload a small PDF for any paper. The card should flip to "uploaded".
3. Visit `https://slides.strategyscience2026.org/room/A`. You should see Friday's sessions
   (it'll say "Conference is not in session today" because we're before May 28 — that's expected).
4. To force-check the room view on a non-conference day, append `?room=A` to `/room.html`
   and visually inspect — `/room/A` won't render content outside conference dates by design.

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
npm install
npx wrangler pages dev . --binding R2_ACCOUNT_ID=... \
  --binding R2_ACCESS_KEY_ID=... --binding R2_SECRET_ACCESS_KEY=... \
  --binding R2_BUCKET_NAME=... --r2 SLIDES_BUCKET=ssc2026-slides
```

Or put bindings in a `.dev.vars` file (gitignored). Easier to test by deploying to a Pages preview branch.

---

## How things work

### Upload flow

1. Presenter picks a file in `/`.
2. Browser → `POST /api/upload-url` with `{ paperId, filename }`.
3. Pages Function signs an R2 S3 V4 PUT URL (1-hour expiry) using `aws4fetch`.
4. Browser → `PUT` the file directly to R2 (bypasses Pages' 100MB body limit).
5. Browser → `POST /api/finalize` with `{ paperId, ext }`.
6. Pages Function deletes any `slides/<paperId>.*` whose extension differs from the
   newly-uploaded one (so a `.pptx` cleanly replaces a `.pdf`).

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

**"Server not configured: R2_..."** — the env var isn't set on the Pages project, or
the deployment was made before the env vars were added. Re-deploy after adding them.

**Upload starts but R2 PUT fails with CORS error** — the R2 bucket's CORS policy is
either missing or doesn't allow your origin. See step 1 above.

**Upload finishes but the card doesn't flip to "uploaded"** — `/api/finalize` failed.
Check the function logs in Cloudflare → Pages → your project → Functions → Real-time logs.

**Room view shows "Conference is not in session today"** — that's correct outside
May 29 / 30. To preview, edit `assets/program.js` `conferencePosition()` temporarily, or
test on a Friday / Saturday — the fallback uses day-of-week if you're not on the exact date.

**A paper appears uploaded with the wrong file** — the presenter uploaded to the wrong
paper card. To wipe: in R2 dashboard, find `slides/Pxxx.<ext>` and delete it. The card
will revert next time `/api/uploads` is fetched.

---

## Security notes

- No authentication is intentional. The risk surface: someone guesses a `paperId` and
  uploads a bogus file. They can't read other papers' data (no per-paper listing).
- The R2 API token has write access only to this one bucket.
- Env vars are stored encrypted in Cloudflare. Don't commit them.
- After the conference: rotate the R2 API token, then delete the bucket if you want a
  clean slate.
