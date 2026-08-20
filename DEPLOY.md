# Deploy guide — Netlify (frontend) + Render Free (API)

This app is split:
- **Frontend** (Vite/React) → Netlify Free
- **Backend** (FastAPI in `main.py` / `backend/`) → Render Free
- **Data** → Supabase (already configured)

Pushing to GitHub can auto-update both once connected.

---

## 1. Prepare the repo

1. Put the `US Stock` project on GitHub (new repo or this monorepo).
2. Do **not** commit `.env` (secrets). Use host env vars instead.
3. Confirm these files exist:
   - `US Stock/requirements.txt`
   - `US Stock/render.yaml`
   - `US Stock/frontend/netlify.toml`
   - `US Stock/main.py`

---

## 2. Register & deploy Render Free (API)

1. Go to [https://render.com](https://render.com) → **Sign up** with GitHub.
2. **New +** → **Blueprint** (uses `render.yaml`) **or** **Web Service**.
3. Connect your GitHub repo.
4. If manual Web Service:
   - **Root directory:** `US Stock` (if monorepo) or repo root if this folder is the repo
   - **Runtime:** Python
   - **Build:** `pip install -r requirements.txt`
   - **Start:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Instance type:** Free
5. Add environment variables (from your local `.env`):
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`)
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL=gemini-2.5-flash` (free-tier safe; Pro models need Google AI billing)
   - `CORS_ALLOW_ORIGINS=https://YOUR-SITE.netlify.app` (set after Netlify exists; `*` works for a quick test)
   - `SITE_PASSWORD` (optional)
   - `IDEAS_WEBHOOK_URL` — Google Apps Script web app `/exec` URL so More ideas / Analyze POST a JSON batch to your Sheet. Leave empty to disable. See `scripts/ideas_to_google_sheet.gs`.
6. Deploy. Copy the service URL, e.g. `https://us-stock-api.onrender.com`.
7. Smoke test: open `https://YOUR-API.onrender.com/docs`

**Free tier note:** the service sleeps after ~15 minutes idle. The first Analyze after sleep can take 30–60 seconds.

Optional: keep warm with a free cron ping to `/api/snapshots` every 10–14 minutes (e.g. cron-job.org).

---

## 3. Register & deploy Netlify (dashboard)

1. Go to [https://app.netlify.com](https://app.netlify.com) → **Sign up** with GitHub.
2. **Add new site** → **Import an existing project** → pick the repo.
3. Build settings (also in `frontend/netlify.toml`):
   - **Base directory:** `US Stock/frontend` (or `frontend` if repo is only this project)
   - **Build command:** `npm ci && npm run build`
   - **Publish directory:** `dist`
4. Site settings → **Environment variables**:
   - `VITE_API_BASE` = `https://YOUR-API.onrender.com` (no trailing slash)
5. Deploy. Open the Netlify URL.
6. Optional: **Site configuration → Access control → Visitor access** → password protect the site.
7. Update Render `CORS_ALLOW_ORIGINS` to your Netlify URL and redeploy API if you locked CORS.

---

## 4. Day-to-day workflow

1. Edit code locally.
2. `git push` to `main`.
3. Netlify rebuilds the site; Render redeploys the API (if auto-deploy is on).
4. Holdings stay in Supabase — pushes do not wipe portfolio data.

---

## 5. Local run (dev)

```bash
# API
cd "US Stock"
source ../.venv/bin/activate   # or your venv
pip install -r requirements.txt
python main.py

# Frontend
cd frontend
npm install
npm run dev
```

Frontend `.env`:

```
VITE_API_BASE=http://localhost:8000
```
