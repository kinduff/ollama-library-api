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
