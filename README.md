# ollama-library-api

JSON API for every model on https://ollama.com/library?sort=newest. A single Cloudflare Worker scrapes the page, caches the parsed result for an hour, and serves a landing page at `/`. A cron every 5 minutes reads models' tags pages (`/library/<name>/tags`, up to `PAGES_PER_RUN` per run: the free plan allows 50 subrequests) into the `DETAILS` KV namespace: a model is read when new, when the library shows it updated, or after a week. That gives `size_bytes` in the list and `tag_details` for one model.

```
npm i
npm run dev      # http://localhost:8787
npm run deploy   # ollama.kinduff.com
```

Once: `npx wrangler kv namespace create DETAILS` and put its id in `wrangler.toml`. To run the cron locally: `npx wrangler dev --test-scheduled`, then `curl "localhost:8787/__scheduled?cron=*/5+*+*+*+*"` (each call reads up to 40 models).

- `GET /api/models` (`?q=`, `?capability=`, `?cloud=true|false`)
- `GET /api/models/:name` (adds `tag_details`)
- `GET /openapi.json`, `GET /llms.txt`

OG image: edit `og/og.html`, then re-render:

```
chromium --headless --hide-scrollbars --window-size=1200,630 --screenshot=src/og.png "file://$PWD/og/og.html"
```
