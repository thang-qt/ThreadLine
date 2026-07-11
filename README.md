# Threadline

Threadline is a static-first, local-preference reader for community news sources. It currently combines Hacker News and Lobsters, with source metadata and feed contracts organized so additional sources can be added later. The app is a React single-page app with routes for `/` (feed), `/story/:source/:id` (discussion), and `/settings` (preferences).

Preferences are stored only in `localStorage`. The storage key remains `hnster.preferences.v1` intentionally for compatibility with older builds.

## Development

This repository uses pnpm and includes a Nix development shell:

```bash
nix develop                 # supplies Node 22 and pnpm
pnpm install
pnpm dev
```

The Vite server mirrors the Cloudflare API surface in development:

- `/api/feed` fetches and normalizes the combined front page.
- `/api/lobsters/*` proxies Lobsters JSON discussion/feed endpoints for CORS-safe comment loading.

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Feed architecture

The browser first requests a same-origin aggregated feed:

```text
GET /api/feed?hn=top&lobsters=hottest
```

The Cloudflare Pages Function fetches Hacker News and Lobsters HTML front pages, parses the visible story metadata, and returns a normalized `FeedResult`. If scraping fails or returns suspiciously few stories, it falls back to the public APIs:

- Hacker News Firebase item API
- Lobsters JSON feed API

Partial failures return the successful source plus a per-source error so the UI can still render available stories.

For purely static hosts without the feed aggregation function, the browser falls back to public feed APIs directly. Hacker News can work in that mode, but Lobsters discussions still require a CORS-safe proxy (`VITE_API_PROXY_URL`) unless the app is deployed with the included Cloudflare Pages Function.

## Lobsters proxy and deployment

Lobsters does not reliably permit browser cross-origin requests for discussions. The client therefore calls a proxy base, not Lobsters directly:

- Default: same-origin `/api/lobsters`, implemented by `functions/api/lobsters/[[path]].ts` on Cloudflare Pages.
- External: set `VITE_API_PROXY_URL` at **build time** to a full proxy base, for example `https://reader-proxy.example.workers.dev/api/lobsters`. Do not include a trailing feed path.

The proxy only forwards safe endpoint forms:

- `hottest.json`
- `newest.json`
- `s/<id>.json`

## Optional environment variables

- `VITE_FEED_API_URL`: full URL for an external compatible `/api/feed` endpoint.
- `VITE_API_PROXY_URL`: full URL for an external compatible `/api/lobsters` endpoint.

Leave both unset on Cloudflare Pages when using the included same-origin functions.

## Cloudflare Pages

Use build command `pnpm build` and output directory `dist`. The repo includes `public/_redirects`, copied into `dist`, to serve `index.html` for non-asset routes so direct visits to `/settings` and `/story/...` work. Cloudflare Pages Functions under `/api/*` are handled separately from this static SPA fallback.
