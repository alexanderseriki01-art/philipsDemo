# Phillips Consulting TMS — demo API

Temporary backend for the TMS admin console. It runs on the colat server in its
own directory as its own Docker stack, sharing nothing with the colat API on the
same host.

Deliberately dependency-free: no Composer, no framework, no database. Deploying
is copying the directory and starting two containers. Endpoints get added as the
demo needs them.

## Where it lives

| | |
| --- | --- |
| Base URL | `https://api.colat.ng/tms` |
| Server | `173.208.144.68`, SSH on port **10041**, user `administrator` |
| Directory | `/opt/philips-tms-api` (docker apps live in `/opt` on this host) |
| Containers | `phillips-tms-api` (php:8.3-fpm-alpine), `phillips-tms-nginx` |
| Bound to | `127.0.0.1:8090` — not public; the host nginx proxies it |

The host nginx (`/etc/nginx/sites-available/colat`) proxies `/tms/` to
`127.0.0.1:8090` from inside the `api.colat.ng` server block. nginx matches the
longest prefix, so `/tms/...` reaches this API and every other path still reaches
the colat FastAPI on `127.0.0.1:8000`.

Two things follow from that setup:

- The `proxy_pass` ends in a slash, so nginx strips `/tms` before the request
  arrives — `APP_PATH_PREFIX` in `.env` must stay **empty**.
- TLS is terminated upstream by the provider's Traefik on the hypervisor, which
  forwards plain HTTP to this guest. Every server block listens on `:80` only.
  Borrowing `api.colat.ng` is what gives the demo API working HTTPS without a
  DNS or Traefik change — and HTTPS is required, because the frontend is HTTPS
  on Vercel and a plain-http API would be blocked as mixed content.

## Endpoints

Responses use the same envelope as the colat API: `{ success, message, data }`,
or `{ success, message, errors }` on failure.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/health` | — | Liveness check; lists registered routes |
| `POST` | `/api/v1/admin/auth/login` | — | Exchange credentials for a token |
| `GET` | `/api/v1/admin/auth/me` | Bearer | The signed-in administrator |
| `POST` | `/api/v1/admin/auth/refresh` | Bearer | Rotate to a fresh token |
| `POST` | `/api/v1/admin/auth/logout` | Bearer | Revoke the current token |
| `POST` | `/api/v1/admin/auth/forgot-password` | — | Stub; password reset is not wired up |
| `POST` | `/api/v1/admin/participants/invite` | Bearer | Email a participant invitation |

### Sign in

```bash
curl -X POST https://api.colat.ng/tms/api/v1/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"tunde.okafor@phillipsconsulting.net","password":"passphrase"}'
```

```json
{
  "success": true,
  "message": "Signed in successfully.",
  "data": {
    "token": "TGhb0noaNHQcfvEyMqMTaSjC3pKOYBxEtl7sEIi19uo",
    "token_type": "Bearer",
    "expires_in": 28800,
    "expires_at": "2026-08-21T17:08:27+00:00",
    "admin": {
      "id": "adm_001",
      "name": "Tunde Okafor",
      "email": "tunde.okafor@phillipsconsulting.net",
      "role": "Programme Administrator",
      "initials": "TO",
      "permissions": ["participants", "trainings", "…"]
    }
  }
}
```

### Authenticated calls

```bash
curl https://api.colat.ng/tms/api/v1/admin/auth/me \
  -H 'Authorization: Bearer <token>'
```

Failure shapes: `401` for bad credentials or an expired token, `422` with a
per-field `errors` object for validation, `429` with a `Retry-After` header when
the login throttle trips, `405` for a wrong verb on a known path.

## Sending invitations

`POST /api/v1/admin/participants/invite` sends a real email through Resend. It
requires the `participants` permission, so a Finance Officer gets a `403`.

```bash
curl -X POST https://api.colat.ng/tms/api/v1/admin/participants/invite \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Tobi Balogun","email":"tobi@gtbank.com","organisation":"GTBank",
       "programme":"Advanced Leadership","message":"Hi Tobi,\n\nSee you in April."}'
```

`message` is the administrator's own words. It is rendered verbatim into the
email above the activation button, with blank lines kept as paragraphs. Newlines
in `name` and `email` are stripped before they can reach the mail headers.

### The sending domain

Resend only accepts a `from` address on a domain **verified in the account that
owns the API key**. An unverified domain returns `403` and nothing is delivered.

`phillipsconsulting.net` is **not** verified on the available Resend accounts;
`colat.ng` and `inspirtag.com` are. Mail therefore goes out as:

```
"Phillips Consulting" <training@colat.ng>
reply-to: training@phillipsconsulting.net
```

Recipients see the Phillips Consulting name and replies reach Phillips, but the
underlying address is not a Phillips one. To send from a genuine
`@phillipsconsulting.net` address: add that domain in Resend, publish the DNS
records it returns, then change one line.

```
MAIL_FROM=training@phillipsconsulting.net
```

`.env` must be readable by uid 82 (`sudo chown 82:82 .env`), or the key is
invisible to php-fpm and every send fails with "RESEND_API_KEY is not set".

## Accounts

Seeded in [`config/admins.php`](config/admins.php). Each entry takes either a
bcrypt `password_hash` (preferred) or a plaintext `password` (demo convenience).
Generate a hash with:

```bash
php bin/hash-password.php 'the-password'
```

Then set `password_hash` and delete that account's `password` line.

## Deploying

```bash
./deploy.sh                                     # uses the defaults above
TMS_SSH_HOST=user@host TMS_SSH_PORT=22 ./deploy.sh
```

The script syncs the directory (never overwriting the server's `.env` or issued
tokens), re-applies storage ownership, brings the containers up, and polls
`/api/health` until it answers. It uses `rsync` when present and falls back to
tar over ssh otherwise (Git Bash on Windows ships `ssh` but not `rsync`).

**`storage/` must be owned by uid 82.** php-fpm runs as uid 82 in the alpine
image; if it cannot write there, sign-in returns a `500` while validation errors
still return `422` — a confusing combination worth recognising. Extracting the
archive resets directory modes, so the deploy script re-applies this every time:

```bash
sudo chown -R 82:82 /opt/philips-tms-api/storage
```

One-time nginx wiring, already applied: the contents of
[`deploy/host-nginx-snippet.conf`](deploy/host-nginx-snippet.conf) sit inside the
`api.colat.ng` server block in `/etc/nginx/sites-available/colat`, above its
catch-all `location /`. A backup of the pre-change file is at
`/etc/nginx/sites-available/colat.bak-tms`. To re-apply:

```bash
sudo nginx -t && sudo systemctl reload nginx
curl https://api.colat.ng/tms/api/health
```

## How it works

| Path | Role |
| --- | --- |
| `public/index.php` | Front controller; every route is declared here |
| `src/bootstrap.php` | PSR-4 autoloader, `.env`, JSON error handling |
| `src/Http/` | `Request`, `Response`, `Router` |
| `src/Auth/` | `AdminRepository`, `TokenGuard`, `LoginThrottle` |
| `src/Support/` | `Env`, `JsonStore` (atomic flat-file storage) |
| `storage/` | Runtime state: live tokens and throttle counters |

Tokens are 32 random bytes, returned once and stored only as a SHA-256, so the
storage directory cannot yield usable sessions. They expire after 8 hours
(`AUTH_TOKEN_TTL`), refresh rotates them (the old one dies immediately), and
logout revokes. Login allows 10 failed attempts per email+IP per 15 minutes, and
a wrong email costs the same time as a wrong password so the endpoint does not
confirm which addresses exist.

## Adding an endpoint

1. Add a method to a controller in `src/Controllers/`.
2. Register it in `public/index.php`.
3. `./deploy.sh`.

There is no build step and no cache to clear.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `500` on login, `422` still works | `storage/` not writable by uid 82 |
| Container marked `unhealthy` | Probe must use `127.0.0.1`, not `localhost` (which resolves to `::1` first) |
| Every route `404`s | `APP_PATH_PREFIX` set while nginx already strips `/tms` |
| `429` with `Retry-After` | Login throttle; clear `storage/throttle/*.json` |

Container logs carry the real reason for a `500` — `APP_DEBUG` is off, so the
response body deliberately says nothing useful:

```bash
docker logs phillips-tms-api --tail 40
```
