# Deploying ELSA

ELSA is one Docker image: the React app and the FastAPI backend in one container, plus
PostgreSQL. It needs HTTPS (session cookies are `Secure`) and a long-running server (Gemini Live
uses WebSockets), so static hosts such as Vercel or Netlify can't run it.

## Option A: Render (managed, about 15 minutes)

1. Push the repo to GitHub.
2. In Render, choose **New → Blueprint** and pick the repo. `render.yaml` creates:
   - `elsa`: the Docker web service in Singapore, health-checked on `/api/ready`;
   - `elsa-db`: PostgreSQL.
3. Render asks for:
   - `GEMINI_API_KEYS`: the billed key(s);
   - `ADMIN_BOOTSTRAP_USERNAME` and `ADMIN_BOOTSTRAP_PASSWORD`: the first console admin (12+
     characters with upper case, lower case and a digit).
   `ENTRY_LINK_SECRET` and `HOST_API_KEY` are generated for you.
4. When the deploy is live, open `https://<service>.onrender.com/admin` and sign in. Then **delete
   the two `ADMIN_BOOTSTRAP_*` variables** in the dashboard. They are only read when no admin
   exists, but there's no reason to keep a password there.
5. Give Buddy's World's server team `ENTRY_LINK_SECRET` (Environment → reveal) and
   `HOST_API_KEY`, with [`HOST-INTEGRATION.md`](HOST-INTEGRATION.md).
6. Optional: add a custom domain in Render. HTTPS is automatic.

Check Render's current PostgreSQL plans for built-in backups. You can also download a JSON backup
any time from the console (Settings).

## Option B: Docker Compose on a server

On any Linux VM with Docker (a small one, say 2 vCPU and 2 GB RAM, is a reasonable start for the pilot):

```bash
git clone https://github.com/sobbify/ai-tutor.git && cd ai-tutor
cp docker.env.example .env
# Edit .env: POSTGRES_PASSWORD, GEMINI_API_KEYS, HOST_API_KEY, ENTRY_LINK_SECRET
# (32+ random characters each; e.g. `openssl rand -base64 36`), and for the first start
# ADMIN_BOOTSTRAP_USERNAME / ADMIN_BOOTSTRAP_PASSWORD.
docker compose up -d --build
docker compose logs -f app        # wait for "startup", then Ctrl+C
```

Then remove the `ADMIN_BOOTSTRAP_*` lines from `.env` (or create admins with
`docker compose exec app python -m ai_tutor create-admin <name>` instead).

**HTTPS:** put a reverse proxy in front of port 8000. With Caddy, which gets certificates
automatically, the whole config is:

```
elsa.example.org {
    reverse_proxy 127.0.0.1:8000
}
```

WebSockets pass through Caddy as is. With nginx, add `proxy_set_header Upgrade $http_upgrade;`
and `proxy_set_header Connection "upgrade";`, and keep `X-Forwarded-Proto` so ELSA knows it's
on HTTPS.

**Backups** (PostgreSQL, daily, kept for 14 days):

```bash
# /etc/cron.d/elsa-backup
15 2 * * * root cd /opt/ai-tutor && docker compose exec -T db pg_dump -U tutor tutor | gzip > /var/backups/elsa-$(date +\%F).sql.gz && find /var/backups -name 'elsa-*.sql.gz' -mtime +14 -delete
```

Restore: `gunzip -c elsa-2026-12-01.sql.gz | docker compose exec -T db psql -U tutor tutor`.

**Updates:** `git pull && docker compose up -d --build`. Database migrations run on start.

On Windows, `scripts\docker-check.ps1` builds, starts and smoke-tests the stack locally.

## Settings that matter in production

| Variable | Why |
|---|---|
| `ENVIRONMENT=production` | Secure cookies, HSTS, no API docs; refuses SQLite and unsigned links. |
| `DATABASE_URL` | PostgreSQL. `postgres://…` and `?sslmode=require` URLs are accepted. |
| `ENTRY_LINK_SECRET` | 32+ characters, shared with Buddy's World's server. Required. |
| `GEMINI_API_KEYS` | Billed key(s), comma-separated. Without a working key, replies show "try again". |
| `HOST_API_KEY` | Turns on the reminders feed for Buddy's World. |
| `EMBED_ORIGINS` | Only if Buddy's World shows ELSA in an `<iframe>`. |
| `SCHOOL_TIMEZONE` | Streaks, school days and reminder times (default `Asia/Kolkata`). |

Run **one** app container. Rate limits and the realtime sockets live in memory.

## Go-live checklist

- [ ] `GET /api/ready` → `{"ok": true, "database": "ok", "database_kind": "postgresql", …}`.
- [ ] A signed link from `python -m ai_tutor make-link <uid> <name>` opens the app; the same link
      edited by hand shows "This link has expired".
- [ ] One full practice in Chrome on an Android phone: microphone prompt, a reply, feedback,
      summary.
- [ ] Console: you can sign in, see the learner, download a backup. Bootstrap variables removed.
- [ ] Buddy's World generates links on its server (not in the app) and opens them in a WebView
      with microphone permission.
- [ ] Backups run, and a restore has been tried once.
- [ ] Sign-offs from the PRD: academic (scripts), legal (DPDP wording), privacy (group names).
