# Code

## Stock portfolio API (`Stock/`)

FastAPI app in `Stock/main.py`. Endpoints include `POST /api/analyze-portfolio`, which returns JSON with `ai_summary`, `policy_report`, and optional `ai_error`.

### Supabase `portfolio` table

Required columns include `symbol`, `shares`, `cost_basis` (plus any cash row you use). Add an optional nullable **`sector`** column (`text`). On each analysis, if `sector` is empty the app loads sector/industry once from Yahoo metadata, attaches it to positions for the sector mix, and **`update`s that row** so the next run reads from the DB only. If the column is missing, persistence fails silently; set **`SUPABASE_SKIP_SECTOR_PERSIST=1`** to skip writes. Example:

```sql
alter table portfolio add column if not exists sector text;
```

### API quickstart (local)

```bash
cd Code
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export SUPABASE_URL=...
export SUPABASE_ANON_KEY=...
export SUPABASE_PORTFOLIO_TABLE=portfolio
export PORTFOLIO_CASH_USD=0
export GEMINI_API_KEY=...   # optional
python Stock/main.py
```

Then call `POST /api/analyze-portfolio` (or use `Stock/daily_summary.py` below).

### Daily summary CLI (no server)

`Stock/daily_summary.py` calls the same core logic as `POST /api/analyze-portfolio` (`run_portfolio_analysis` in `main.py`). It prints the final summary to **stdout** only. If `GEMINI_API_KEY` is missing or Gemini fails, it falls back to a **rules-only** text built from `policy_report` (sections 1–9: Status, Market, Cash, three Actions lines, Why, Uncertainty, Disclaimer).

Local run (load `.env` from `Stock/` if present):

```bash
cd Code
source .venv/bin/activate
pip install -r Stock/requirements-prod.txt
export SUPABASE_URL=...
export SUPABASE_ANON_KEY=...
export SUPABASE_SERVICE_ROLE_KEY=...   # optional alternative to anon
export SUPABASE_PORTFOLIO_TABLE=portfolio
export PORTFOLIO_CASH_USD=0
export GEMINI_API_KEY=...   # optional
python Stock/daily_summary.py
```

Email the same body with SendGrid (stdin = plain text):

```bash
python Stock/daily_summary.py | python Stock/send_email_sendgrid.py
```

Requires `SENDGRID_API_KEY`, `EMAIL_TO`, `EMAIL_FROM`. Use **comma- or semicolon-separated** addresses in `EMAIL_TO` for multiple recipients (one GitHub secret). On failure the sender prints a short message to **stderr** and exits non-zero.

**GitHub Actions** does not read `.env`; configure **repository secrets** and map them to `env` in the workflow.

### GitHub Actions secrets (daily email workflow)

Add under **Settings → Secrets and variables → Actions**:

| Secret | Required |
|--------|----------|
| `SUPABASE_URL` | yes |
| `SUPABASE_ANON_KEY` | yes (or use service role via `SUPABASE_SERVICE_ROLE_KEY` in app env; the workflow sets `SUPABASE_ANON_KEY`) |
| `SUPABASE_PORTFOLIO_TABLE` | yes |
| `PORTFOLIO_CASH_USD` | yes (use `0` if cash is only in the table) |
| `SENDGRID_API_KEY` | yes |
| `EMAIL_TO` | yes (multiple: `a@x.com,b@y.com`) |
| `EMAIL_FROM` | yes (verified sender in SendGrid) |
| `GEMINI_API_KEY` | no |

Everything for the daily email lives under **`Stock/`**: `main.py`, `daily_summary.py`, `send_email_sendgrid.py`, `requirements-prod.txt`, and **`Stock/.github/workflows/main.yml`**.

GitHub only runs workflows from **the repository root** `.github/workflows/`. If you publish **only** the `Stock` folder as its own repo, that workflow path is already correct. If your GitHub repo root is **`Code/`** or the whole monorepo, copy `Stock/.github/workflows/main.yml` to **`<repo-root>/.github/workflows/`** and edit the YAML: use `pip install -r Code/Stock/requirements-prod.txt` (or `Stock/requirements-prod.txt` if root is `Code/`) and add `working-directory: Code/Stock` (or `Stock`) on the “Generate summary” step.

The workflow runs **weekdays only**, scheduled for **~10:30 Australia/Melbourne** (see `main.yml`; UTC cron must be adjusted when Melbourne switches AEDT/AEST). US exchange holidays are **not** auto-skipped. **Run workflow** sends every time it runs (no same-day deduplication).

The daily email body is the AI/rules summary plus a **plain-text portfolio snapshot** (top holdings, sector mix, deploy budget, benchmark closes, notes/warnings) appended by `rich_policy_appendix` in `main.py`.

**If the job says secrets are missing** but you added them, check:

1. **Correct place:** **Repository** → **Settings** → **Secrets and variables** → **Actions** → tab **Secrets** (not *Variables* — those use `vars.NAME` in YAML, not `secrets.NAME`).
2. **Exact names:** Must match the workflow: `SUPABASE_URL`, `SUPABASE_ANON_KEY` *or* `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PORTFOLIO_TABLE`, `PORTFOLIO_CASH_USD`, `SENDGRID_API_KEY`, `EMAIL_TO`, `EMAIL_FROM` (case-sensitive).
3. **Environment secrets:** If you stored them under an **Environment** (e.g. `production`), add `environment: production` to the job in `main.yml`, or move secrets to **repository** Actions secrets.
4. **Same repo:** Secrets apply to this repo only; confirm the workflow run is on the branch/repo where you added them (not a fork without secrets).
5. **Re-run** after adding secrets; old failed runs do not retroactively get new secrets until the next run.

### Dependencies

- `requirements.txt` (under `Code/`) — dev/API (includes FastAPI, uvicorn, pytest, etc.).
- `Stock/requirements-prod.txt` — minimal set for `daily_summary.py` only (**no FastAPI**; `main.py` treats FastAPI as optional).

---

## Legacy scaffold

Older scaffold notes (`src/`, pytest) may still apply to other folders; prefer the sections above for `Stock/`.
