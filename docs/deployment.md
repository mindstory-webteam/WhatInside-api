# Production deployment

Target: one Linux VM (2 vCPU / 2–4 GB RAM is plenty to start) with Docker Engine + Compose, and a DNS `A` record such as `api.example.com` pointing at it.

## 1. Configure

```bash
git clone <your repo> whatinside && cd whatinside
cp deploy/.env.prod.example deploy/.env.prod
python3 -c "import secrets; print(secrets.token_urlsafe(64))"   # → DJANGO_SECRET_KEY
python3 -c "import secrets; print(secrets.token_urlsafe(32))"   # → POSTGRES_PASSWORD
$EDITOR deploy/.env.prod     # API_DOMAIN, DJANGO_ALLOWED_HOSTS, CSRF_TRUSTED_ORIGINS, SMTP …
chmod 600 deploy/.env.prod
```

`config.settings.prod` refuses to start with a short or placeholder secret key, forces HTTPS redirects, HSTS, secure cookies, and JSON-only responses. `ALLOWED_HOSTS` has no default in production.

## 2. HTTPS certificate (first time only)

Nginx needs a certificate before it can start its HTTPS server. Issue one with certbot in standalone mode before starting nginx:

```bash
export API_DOMAIN=api.example.com
docker compose -f docker-compose.prod.yml --env-file deploy/.env.prod run --rm -p 80:80 --entrypoint certbot \
  certbot certonly --standalone -d "$API_DOMAIN" --agree-tos -m you@example.com --non-interactive
```

The `certbot` service then renews automatically every 12 hours via the webroot (`/.well-known/acme-challenge/`). Reload nginx after renewals (e.g. a weekly cron: `docker compose -f docker-compose.prod.yml exec nginx nginx -s reload`).

## 3. Start

```bash
docker compose -f docker-compose.prod.yml --env-file deploy/.env.prod up -d --build
docker compose -f docker-compose.prod.yml --env-file deploy/.env.prod exec api python manage.py createsuperuser
curl https://$API_DOMAIN/health/        # {"status": "ok"}
```

The API container runs migrations on start, then Gunicorn (`GUNICORN_WORKERS`, default 3). PostgreSQL and Redis are not exposed to the host. Celery beat triggers `dispatch_due_notifications` every 5 minutes (`NOTIFICATION_DISPATCH_SECONDS`).

Deployment check: `docker compose ... exec api python manage.py check --deploy`.

## 4. Updates

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file deploy/.env.prod up -d --build
```

## 5. Backups and restore

```bash
deploy/scripts/backup.sh                       # writes deploy/backups/whatinside-YYYYMMDD-HHMMSS.dump, keeps 14
deploy/scripts/restore.sh deploy/backups/whatinside-20261012-020000.dump   # asks for confirmation, stops API during restore
```

Schedule backups with cron (`0 2 * * * cd /srv/whatinside && deploy/scripts/backup.sh`) and copy `deploy/backups/` off the server (object storage, another host). Test a restore regularly on a staging machine.

## 6. Running without Docker

- Python 3.12+, `pip install -r backend/requirements.txt`, `apt install tesseract-ocr` (optional)
- `DJANGO_SETTINGS_MODULE=config.settings.prod` plus the variables from `deploy/.env.prod.example`
- `python manage.py migrate && python manage.py collectstatic`
- systemd units for `gunicorn config.wsgi:application --bind 127.0.0.1:8000`, `celery -A config worker`, `celery -A config beat` (or a cron running `python manage.py send_due_notifications`)
- Nginx config from `deploy/nginx/templates/default.conf.template` (replace `${API_DOMAIN}`, point `upstream` at `127.0.0.1:8000`)

## Security checklist

- [ ] Secrets only in `deploy/.env.prod` (mode 600) or your platform's secret store; never in git
- [ ] `DJANGO_DEBUG` unset/false; `DJANGO_ALLOWED_HOSTS` = API domain only
- [ ] HTTPS working, HTTP redirects to HTTPS, HSTS header present
- [ ] PostgreSQL/Redis not published to the internet
- [ ] SMTP configured so password resets are delivered
- [ ] Backups scheduled, copied off-site, restore tested
- [ ] `python manage.py check --deploy` clean
- [ ] Mobile production build uses the `https://` API URL
