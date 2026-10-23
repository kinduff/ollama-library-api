const decode = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();

const badges = (html, color) =>
  [...html.matchAll(new RegExp(`rounded-md bg-${color}[^>]*>([^<]+)<`, "g"))].map((m) => decode(m[1]));

const toNumber = (label) => {
  const m = label.replace(/,/g, "").match(/^([\d.]+)\s*([KMB])?$/i);
  if (!m) return null;
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || "").toUpperCase()] || 1;
  return Math.round(parseFloat(m[1]) * mult);
};

export function parseLibrary(html) {
  const models = [];
  for (const [, card] of html.matchAll(/<li[^>]*>\s*<a href="\/library\/[^"]+"([\s\S]*?)<\/li>/g)) {
    const name = card.match(/title="([^"]+)"/)?.[1];
    if (!name) continue;
    const pulls = card.match(/<span\s*>([^<]+)<\/span>\s*<span[^>]*>&nbsp;Pulls/)?.[1]?.trim() ?? null;
    const tags = card.match(/<span\s*>([^<]+)<\/span>\s*<span[^>]*>&nbsp;Tags/)?.[1]?.trim() ?? null;
    const updated = card.match(/title="([^"]+UTC)"/)?.[1] ?? null;
    const updatedLabel = card.match(/Updated&nbsp;<\/span>\s*<span\s*>([^<]+)</)?.[1]?.trim() ?? null;
    models.push({
      name: decode(name),
      url: `https://ollama.com/library/${decode(name)}`,
      description: decode(card.match(/<p class="max-w-lg[^"]*">([\s\S]*?)<\/p>/)?.[1] ?? ""),
      capabilities: badges(card, "indigo-50"),
      sizes: badges(card, "\\[#ddf4ff\\]"),
      cloud: badges(card, "cyan-50").includes("cloud"),
      pulls: pulls && toNumber(pulls),
      pulls_label: pulls,
      tags: tags && toNumber(tags),
      updated_at: updated ? new Date(updated).toISOString() : null,
      updated_label: updatedLabel,
    });
  }
  return models;
}

// "3.3GB", "274MB" in decimal bytes; null for anything else ("Low Usage" on cloud tags).
const toBytes = (label) => {
  const m = label?.match(/^([\d.]+)\s*(KB|MB|GB|TB)$/i);
  if (!m) return null;
  return Math.round(parseFloat(m[1]) * { KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12 }[m[2].toUpperCase()]);
};

// "256K" tokens as Ollama counts them (K = 1024).
const toTokens = (label) => {
  const m = label?.match(/^([\d.]+)\s*([KM])?$/i);
  if (!m) return null;
  return Math.round(parseFloat(m[1]) * ({ K: 1024, M: 1024 * 1024 }[(m[2] || "").toUpperCase()] || 1));
};

// Every tag on https://ollama.com/library/<name>/tags. Each row reads
// "<name>:<tag> [latest] <digest> • 3.3GB - 4.0GB • 256K context window • Text, Image input • 2 weeks ago".
// A range is the default download (what `ollama pull` gets) and a larger variant (MLX).
export function parseTags(html, name) {
  const tags = [];
  const seen = new Set();
  for (const [, model, tag, row] of html.matchAll(/<a href="\/library\/([^":]+):([^"]+)" class="md:hidden[^"]*">([\s\S]*?)<\/a>/g)) {
    if (decode(model) !== name || seen.has(tag)) continue;
    seen.add(tag);
    const parts = decode(row.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").split("•").map((s) => s.trim());
    const [size, larger] = (parts[1] ?? "").split(" - ").map((s) => s.trim());
    const context = parts.find((p) => p.endsWith("context window"))?.replace(/\s*context window$/, "");
    const inputIndex = parts.findIndex((p) => p.endsWith(" input"));
    const input = inputIndex < 0 ? [] : parts[inputIndex].replace(/\s*input$/, "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    tags.push({
      tag,
      digest: parts[0].match(/([0-9a-f]{12})$/)?.[1] ?? null,
      size_bytes: toBytes(size),
      size_bytes_max: toBytes(larger ?? size),
      context: toTokens(context),
      input,
      cloud: tag === "cloud" || tag.endsWith("-cloud"),
      // The row repeats "<input> • <updated>" for narrow screens: the last part is the date either way.
      updated_label: parts.length > 2 ? parts[parts.length - 1] || null : null,
    });
  }
  return tags;
}
