import { parseLibrary } from "./parse.js";
import landing from "./landing.html";
import llms from "./llms.txt";
import openapi from "./openapi.json";
import ogImage from "./og.png";

const SOURCE = "https://ollama.com/library?sort=newest";
const TTL = 3600;

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

  const res = await fetch(SOURCE, { headers: { "user-agent": "ollama-library-api (+https://ollama.kinduff.com)" } });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  const models = parseLibrary(await res.text());
  if (!models.length) throw new Error("upstream returned no models");

  const data = { source: SOURCE, fetched_at: new Date().toISOString(), count: models.length, models };
  ctx.waitUntil(cache.put(key, json(data)));
  return data;
}

export default {
  async fetch(request, env, ctx) {
    const { pathname, searchParams } = new URL(request.url);

    if (pathname === "/") {
      return new Response(landing, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    if (pathname === "/openapi.json") return json(openapi);

    if (pathname === "/og.png") {
      return new Response(ogImage, { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
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

      const name = decodeURIComponent(pathname.slice("/api/models/".length));
      if (name) {
        const model = data.models.find((m) => m.name === name);
        return model ? json(model) : json({ error: "model not found" }, 404);
      }

      let models = data.models;
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
