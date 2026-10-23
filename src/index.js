import { parseLibrary, parseTags } from "./parse.js";
import landing from "./landing.html";
import llms from "./llms.txt";
import openapi from "./openapi.json";
import ogImage from "./og.png";

const SOURCE = "https://ollama.com/library?sort=newest";
const TTL = 3600;
const UA = { "user-agent": "ollama-library-api (+https://ollama.kinduff.com)" };
// Each model's tags (sizes in bytes, context, input), read from its tags page by the cron and kept
// in KV under one key: { [name]: { updated_at, fetched_at, tags } }.
const DETAILS_KEY = "details";
// A model's tags page is read again when the library shows it updated, or after a week.
const REFRESH_MS = 7 * 24 * 3600 * 1000;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": `public, max-age=${TTL}`,
    },
  });

async function getLibrary(ctx) {
  const cache = caches.default;
  const key = new Request("https://cache.internal/library.json");
  const hit = await cache.match(key);
  if (hit) return hit.json();

  const res = await fetch(SOURCE, { headers: UA });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  const models = parseLibrary(await res.text());
  if (!models.length) throw new Error("upstream returned no models");

  const data = { source: SOURCE, fetched_at: new Date().toISOString(), count: models.length, models };
  ctx.waitUntil(cache.put(key, json(data)));
  return data;
}

const getDetails = async (env) => (await env.DETAILS?.get(DETAILS_KEY, { type: "json", cacheTtl: 300 })) ?? {};

// Reads the tags pages of models never read, updated since, or read over a week ago, never-read
// first, at most PAGES_PER_RUN per run: a Worker on the free plan makes 50 subrequests at most.
async function refreshDetails(env, ctx) {
  const library = await getLibrary(ctx);
  const details = (await env.DETAILS.get(DETAILS_KEY, { type: "json" })) ?? {};
  const now = Date.now();
  const due = library.models
    .filter((m) => {
      const d = details[m.name];
      return !d || d.updated_at !== m.updated_at || now - Date.parse(d.fetched_at) > REFRESH_MS;
    })
    .sort((a, b) => Number(Boolean(details[a.name])) - Number(Boolean(details[b.name])))
    .slice(0, Number(env.PAGES_PER_RUN) || 40);

  let read = 0;
  for (const m of due) {
    const res = await fetch(`https://ollama.com/library/${encodeURIComponent(m.name)}/tags`, { headers: UA });
    if (!res.ok) continue;
    const tags = parseTags(await res.text(), m.name);
    if (!tags.length) continue;
    details[m.name] = { updated_at: m.updated_at, fetched_at: new Date().toISOString(), tags };
    read++;
  }
  let dropped = 0;
  const names = new Set(library.models.map((m) => m.name));
  for (const name of Object.keys(details)) {
    if (!names.has(name)) {
      delete details[name];
      dropped++;
    }
  }
  if (read || dropped) await env.DETAILS.put(DETAILS_KEY, JSON.stringify(details));
  return { due: due.length, read, dropped, known: Object.keys(details).length, models: library.models.length };
}

// The download in bytes of each of the model's sizes and `latest`, null until its tags page is read.
function withSizes(model, details) {
  const d = details[model.name];
  if (!d) return { ...model, size_bytes: null };
  const wanted = new Set(["latest", ...model.sizes]);
  const sizes = d.tags.filter((t) => wanted.has(t.tag) && t.size_bytes != null).map((t) => [t.tag, t.size_bytes]);
  return { ...model, size_bytes: Object.fromEntries(sizes) };
}

export default {
  async scheduled(controller, env, ctx) {
    console.log(JSON.stringify(await refreshDetails(env, ctx)));
  },

  async fetch(request, env, ctx) {
    const { pathname, searchParams } = new URL(request.url);

    if (pathname === "/") {
      return new Response(landing, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    if (pathname === "/openapi.json") return json(openapi);

    if (pathname === "/og.png") {
      return new Response(request.method === "HEAD" ? null : ogImage, {
        headers: {
          "content-type": "image/png",
          "content-length": String(ogImage.byteLength),
          "cache-control": "public, max-age=86400",
          "access-control-allow-origin": "*",
          "cross-origin-resource-policy": "cross-origin",
        },
      });
    }

    if (pathname === "/llms.txt") {
      return new Response(llms, { headers: { "content-type": "text/plain; charset=utf-8", "access-control-allow-origin": "*" } });
    }

    if (pathname === "/api/models" || pathname.startsWith("/api/models/")) {
      let data;
      try {
        data = await getLibrary(ctx);
      } catch (e) {
        return json({ error: e.message }, 502);
      }

      const details = await getDetails(env);
      const name = decodeURIComponent(pathname.slice("/api/models/".length));
      if (name) {
        const model = data.models.find((m) => m.name === name);
        if (!model) return json({ error: "model not found" }, 404);
        const d = details[name];
        return json({ ...withSizes(model, details), tag_details: d?.tags ?? null, tags_fetched_at: d?.fetched_at ?? null });
      }

      let models = data.models.map((m) => withSizes(m, details));
      const q = searchParams.get("q")?.toLowerCase();
      const capability = searchParams.get("capability");
      const cloud = searchParams.get("cloud");
      if (q) models = models.filter((m) => m.name.includes(q) || m.description.toLowerCase().includes(q));
      if (capability) models = models.filter((m) => m.capabilities.includes(capability));
      if (cloud) models = models.filter((m) => m.cloud === (cloud === "true"));
      return json({ ...data, count: models.length, models });
    }

    return json({ error: "not found" }, 404);
  },
};
