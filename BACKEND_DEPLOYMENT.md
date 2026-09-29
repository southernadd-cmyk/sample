# Portable sampler backend

The sampler frontend is hosted independently on GitHub Pages. The backend can therefore move between hosts without changing the application architecture.

## Services

- `sampler-api`: Flask + yt-dlp API
- `pot-provider`: bgutil PO-token provider

## Docker

A host that supports Docker Compose can run both services with:

```bash
docker compose up -d --build
```

The public API listens on port 8080. The PO-token provider remains private inside the Docker network.

## Required environment

The API uses:

- `POT_PROVIDER_URL=http://pot-provider:4416`
- `FRONTEND_ORIGINS=https://southernadd-cmyk.github.io`

A host can override `PORT` if required.

## Switching the live frontend

Edit only:

`docs/config.js`

Set:

```js
window.SAMPLER_API_BASE = 'https://YOUR-NEW-BACKEND.example';
```

The rest of the sampler frontend does not need to change.

## Health check

`GET /health`

Expected response:

```json
{"ok": true}
```

## YouTube import

`POST /api/youtube`

JSON body:

```json
{"url":"https://www.youtube.com/watch?v=..."}
```

The API proxies a playable media stream back to the browser and exposes the title through the `X-Track-Title` response header.


## Back4app free container

The Dockerfile is also prepared for a single 256 MB Back4app container.

Instead of keeping the PO-token HTTP server running permanently, it uses the provider's on-demand script mode:

`POT_PROVIDER_SCRIPT_HOME=/opt/bgutil/server`

This keeps idle memory lower. Railway can continue using the separate HTTP provider through `POT_PROVIDER_URL`; the application automatically prefers that when present.
