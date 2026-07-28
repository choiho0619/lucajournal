const SITE_URL = "https://lucajournal.com";
const CACHE_CONTROL = "public, max-age=3600";
const PAGE_SIZE = 1000;
const MAX_SLUG_LENGTH = 200;

const STATIC_URLS = [
  { loc: `${SITE_URL}/`, lastmod: "2026-07-14" },
  { loc: `${SITE_URL}/about`, lastmod: "2026-07-14" },
  { loc: `${SITE_URL}/category?code=DAILY`, lastmod: "2026-07-14" },
  { loc: `${SITE_URL}/category?code=PERSPECTIVE`, lastmod: "2026-07-14" },
  { loc: `${SITE_URL}/category?code=HERITAGE`, lastmod: "2026-07-14" },
  { loc: `${SITE_URL}/category?code=APOLOGETICS`, lastmod: "2026-07-14" },
  { loc: `${SITE_URL}/category?code=NOTICE`, lastmod: "2026-07-14" },
];

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function isValidSlug(slug) {
  return (
    typeof slug === "string" &&
    slug.length > 0 &&
    slug.length <= MAX_SLUG_LENGTH &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  );
}

function formatLastmod(value) {
  if (typeof value !== "string" || !value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function buildSitemap(posts) {
  const urls = new Map(STATIC_URLS.map(({ loc, lastmod }) => [loc, lastmod]));

  for (const post of posts) {
    if (!isValidSlug(post?.slug)) {
      continue;
    }

    const loc = `${SITE_URL}/post?slug=${encodeURIComponent(post.slug)}`;
    if (!urls.has(loc)) {
      urls.set(loc, formatLastmod(post.updated_at));
    }
  }

  const entries = Array.from(urls, ([loc, lastmod]) => {
    const lastmodElement = lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : "";
    return `  <url><loc>${escapeXml(loc)}</loc>${lastmodElement}</url>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}

async function fetchStaticSitemap(request, env) {
  const assetUrl = new URL(request.url);
  assetUrl.pathname = "/sitemap.xml";
  assetUrl.search = "";
  return env.ASSETS.fetch(assetUrl);
}

async function createFallbackResponse(request, env) {
  const staticResponse = await fetchStaticSitemap(request, env);
  const xml = await staticResponse.text();

  return new Response(xml, {
    status: 200,
    headers: {
      "Cache-Control": CACHE_CONTROL,
      "Content-Type": "application/xml; charset=utf-8",
      "X-Sitemap-Source": "static-fallback",
    },
  });
}

async function fetchPublishedPosts(env) {
  const endpoint = new URL("/rest/v1/posts", env.SUPABASE_URL);
  endpoint.searchParams.set("select", "slug,updated_at");
  endpoint.searchParams.set("status", "eq.published");
  endpoint.searchParams.set("order", "published_at.desc");

  const posts = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        Range: `${offset}-${offset + PAGE_SIZE - 1}`,
        "Range-Unit": "items",
      },
    });

    if (!response.ok) {
      throw new Error(`Supabase request failed with status ${response.status}`);
    }

    const page = await response.json();
    if (!Array.isArray(page)) {
      throw new Error("Supabase response was not an array");
    }

    posts.push(...page);
    if (page.length < PAGE_SIZE) {
      return posts;
    }
  }
}

export async function onRequestGet({ request, env }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return createFallbackResponse(request, env);
  }

  try {
    const posts = await fetchPublishedPosts(env);
    return new Response(buildSitemap(posts), {
      status: 200,
      headers: {
        "Cache-Control": CACHE_CONTROL,
        "Content-Type": "application/xml; charset=utf-8",
        "X-Sitemap-Source": "cloudflare-function",
      },
    });
  } catch {
    return createFallbackResponse(request, env);
  }
}
