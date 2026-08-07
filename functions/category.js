const SITE_URL = "https://lucajournal.com";
const VALID_CATEGORY_CODES = new Set([
  "DAILY",
  "PERSPECTIVE",
  "HERITAGE",
  "APOLOGETICS",
  "CULTURE",
  "NOTICE",
]);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function replaceMeta(html, attribute, key, content) {
  const tag = `<meta ${attribute}="${key}" content="${escapeHtml(content)}">`;
  const pattern = new RegExp(`<meta\\s+${attribute}="${key}"[^>]*>`, "i");
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace("</head>", `${tag}\n</head>`);
}

function replaceCanonical(html, canonicalUrl) {
  const tag = `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`;
  const pattern = /<link\s+rel="canonical"[^>]*>/i;
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace("</head>", `${tag}\n</head>`);
}

function injectMetadata(html, canonicalUrl) {
  let result = replaceCanonical(html, canonicalUrl);
  result = replaceMeta(result, "property", "og:url", canonicalUrl);
  return result;
}

async function fetchStaticCategory(request, env) {
  const assetUrl = new URL(request.url);
  assetUrl.pathname = "/category";
  assetUrl.search = "";
  return env.ASSETS.fetch(assetUrl);
}

export async function onRequestGet({ request, env }) {
  const staticResponse = await fetchStaticCategory(request, env);
  const code = new URL(request.url).searchParams.get("code");

  if (!VALID_CATEGORY_CODES.has(code)) {
    return staticResponse;
  }

  const canonicalUrl = `${SITE_URL}/category?code=${encodeURIComponent(code)}`;
  const html = injectMetadata(await staticResponse.clone().text(), canonicalUrl);
  const headers = new Headers(staticResponse.headers);
  headers.set("content-type", "text/html; charset=UTF-8");
  headers.delete("content-length");
  headers.delete("etag");

  return new Response(html, {
    status: staticResponse.status,
    statusText: staticResponse.statusText,
    headers,
  });
}
