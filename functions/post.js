const SITE_URL = "https://lucajournal.com";
const DEFAULT_IMAGE_URL = `${SITE_URL}/assets/og-default.png`;
const MAX_SLUG_LENGTH = 200;
const DESCRIPTION_LENGTH = 160;

function isValidSlug(slug) {
  return (
    typeof slug === "string" &&
    slug.length > 0 &&
    slug.length <= MAX_SLUG_LENGTH &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  );
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function decodeHtmlEntities(value) {
  const namedEntities = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi,
    (entity, decimal, hexadecimal, named) => {
      if (decimal) {
        const codePoint = Number.parseInt(decimal, 10);
        return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity;
      }
      if (hexadecimal) {
        const codePoint = Number.parseInt(hexadecimal, 16);
        return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity;
      }
      return namedEntities[named.toLowerCase()] ?? entity;
    },
  );
}

function createDescription(content) {
  const plainText = decodeHtmlEntities(String(content ?? "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

  if (plainText.length <= DESCRIPTION_LENGTH) {
    return plainText;
  }

  return `${Array.from(plainText).slice(0, DESCRIPTION_LENGTH - 1).join("").trimEnd()}…`;
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

function serializeJsonLd(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => {
    const escapes = {
      "<": "\\u003c",
      ">": "\\u003e",
      "&": "\\u0026",
      "\u2028": "\\u2028",
      "\u2029": "\\u2029",
    };
    return escapes[character];
  });
}

function injectMetadata(html, post, canonicalUrl) {
  const title = String(post.title ?? "").trim();
  const description = createDescription(post.content) || title;
  const authorName = String(post.profiles?.display_name ?? "").trim();
  const escapedTitle = escapeHtml(`${title} | 루카저널`);

  let result = html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, `<title>${escapedTitle}</title>`);
  result = replaceMeta(result, "name", "description", description);
  result = replaceCanonical(result, canonicalUrl);
  result = replaceMeta(result, "property", "og:type", "article");
  result = replaceMeta(result, "property", "og:title", title);
  result = replaceMeta(result, "property", "og:description", description);
  result = replaceMeta(result, "property", "og:url", canonicalUrl);
  result = replaceMeta(result, "property", "og:image", DEFAULT_IMAGE_URL);
  result = replaceMeta(result, "name", "twitter:card", "summary_large_image");
  result = replaceMeta(result, "name", "twitter:title", title);
  result = replaceMeta(result, "name", "twitter:description", description);
  result = replaceMeta(result, "name", "twitter:image", DEFAULT_IMAGE_URL);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    image: [DEFAULT_IMAGE_URL],
    datePublished: post.published_at,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": canonicalUrl,
    },
    publisher: {
      "@type": "Organization",
      name: "루카저널",
      url: SITE_URL,
    },
  };

  if (authorName) {
    jsonLd.author = {
      "@type": "Person",
      name: authorName,
    };
  }

  const jsonLdTag = `<script type="application/ld+json">${serializeJsonLd(jsonLd)}</script>`;
  return result.replace("</head>", `${jsonLdTag}\n</head>`);
}

async function fetchStaticPost(request, env) {
  const assetUrl = new URL(request.url);
  assetUrl.pathname = "/post";
  assetUrl.search = "";
  return env.ASSETS.fetch(assetUrl);
}

async function fetchPost(slug, env) {
  const endpoint = new URL("/rest/v1/posts", env.SUPABASE_URL);
  endpoint.searchParams.set(
    "select",
    "slug,title,content,published_at,categories(name,code),profiles(display_name)",
  );
  endpoint.searchParams.set("slug", `eq.${slug}`);
  endpoint.searchParams.set("status", "eq.published");
  endpoint.searchParams.set("limit", "1");

  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase request failed with status ${response.status}`);
  }

  const posts = await response.json();
  return Array.isArray(posts) ? posts[0] ?? null : null;
}

export async function onRequestGet({ request, env }) {
  const staticResponse = await fetchStaticPost(request, env);
  const slug = new URL(request.url).searchParams.get("slug");

  if (!isValidSlug(slug) || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return staticResponse;
  }

  try {
    const post = await fetchPost(slug, env);
    if (!post) {
      return staticResponse;
    }

    const canonicalUrl = `${SITE_URL}/post?slug=${encodeURIComponent(slug)}`;
    const html = injectMetadata(await staticResponse.clone().text(), post, canonicalUrl);
    const headers = new Headers(staticResponse.headers);
    headers.set("content-type", "text/html; charset=UTF-8");
    headers.delete("content-length");
    headers.delete("etag");

    return new Response(html, {
      status: staticResponse.status,
      statusText: staticResponse.statusText,
      headers,
    });
  } catch {
    return staticResponse;
  }
}
