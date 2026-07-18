# OmniRoute vanity health — estate note (2026-07-18)

## Live probes

| URL | Result |
|-----|--------|
| `https://omniroute.online/health` | **200 text/html** (~111KB marketing SPA) — NOT API |
| `https://omniroute.online/v1/models` | same SPA HTML |
| `https://omniroute-gw-production.up.railway.app/health` | **500** Internal Server Error (SQLite driver / instrumentation) |
| DNS `omniroute.online` | Cloudflare anycast (`104.21.*`, `172.67.*`) |

## Disposition

1. **CF / DNS (domains lane / V-WALL without CF token):** apex currently fronts the SPA. Route `/health` + `/v1/*` to Railway `omniroute-gw`, or move SPA to `www`/`app` and point apex at the gateway.
2. **Railway runtime (sibling free-compute):** do **not** re-fight Docker/better-sqlite3 here. Amplify sibling fix; consume when `/health` returns JSON 200 (or auth-gated 401 on `/v1/models`).
3. **Steadywrk:** consume private Railway URL + `REQUIRE_API_KEY`; do not treat vanity HTML 200 as healthy.

## Coord

Amplify OmniRoute free-compute moat — no second router. No n8n reset. No `RAILWAY_*` into keystore.
