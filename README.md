# ollama-library-api

JSON API for every model on https://ollama.com/library?sort=newest. A single Cloudflare Worker scrapes the page, caches the parsed result for an hour, and serves a landing page at `/`.

```
npm i
npm run dev      # http://localhost:8787
npm run deploy   # ollama.kinduff.com
```

- `GET /api/models` (`?q=`, `?capability=`, `?cloud=true|false`)
- `GET /api/models/:name`
- `GET /openapi.json`, `GET /llms.txt`

OG image: edit `og/og.html`, then re-render:

```
chromium --headless --hide-scrollbars --window-size=1200,630 --screenshot=src/og.png "file://$PWD/og/og.html"
```
