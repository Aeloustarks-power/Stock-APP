# Code

## Stock portfolio API (`Stock/`)

FastAPI app in `Stock/main.py`. Endpoints include `POST /api/analyze-portfolio`, which returns JSON with `ai_summary`, `policy_report`, and optional `ai_error`.

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

Local run (from repo root or any cwd; load `.env` from `Stock/` if present):

```bash
cd Code
source .venv/bin/activate
pip install -r requirements-prod.txt
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

Requires `SENDGRID_API_KEY`, `EMAIL_TO`, `EMAIL_FROM`. On failure the sender prints a short message to **stderr** and exits non-zero.

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
| `EMAIL_TO` | yes |
| `EMAIL_FROM` | yes (verified sender in SendGrid) |
| `GEMINI_API_KEY` | no |

Workflow file: `.github/workflows/daily_summary.yml`. It runs on a daily UTC schedule (after US market close; see comments in the file), supports **Run workflow** manually, installs `Code/requirements-prod.txt`, and skips sending if a **per-day cache marker** already exists (no duplicate email for the same New York calendar date).

### Dependencies

- `requirements.txt` — dev/API (includes FastAPI, uvicorn, pytest, etc.).
- `requirements-prod.txt` — minimal set for `Stock/daily_summary.py` only (**no FastAPI**; `main.py` treats FastAPI as optional).

---

## Legacy scaffold

Older scaffold notes (`src/`, pytest) may still apply to other folders; prefer the sections above for `Stock/`.
