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

// posts.js의 IMAGE_OBJECT_PATH_PATTERN/validatePostImageObjectPath/parseImageBlockParagraph와 동일한 규칙이다.
// functions/post.js는 Cloudflare Pages Functions 런타임에서 esm.sh 원격 import(posts.js → auth.js)를
// 피하는 기존 설계를 따르고 있어(§4.9, buildParagraphsHtml의 문단/줄바꿈 분해 규칙도 이미 이렇게
// 별도 구현으로 중복 유지 중) posts.js를 import할 수 없다 — 그래서 이 검증 로직도 부득이하게 중복 구현한다.
const IMAGE_BUCKET_NAME = "images";
const IMAGE_OBJECT_PATH_PATTERN =
  /^posts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9_-]+\.(jpg|png|webp)$/i;

function isValidImageObjectPath(objectPath) {
  if (typeof objectPath !== "string" || objectPath.length === 0) return false;
  if (objectPath.includes("..") || objectPath.includes("\\") || objectPath.startsWith("/") || objectPath.includes("//")) {
    return false;
  }
  return IMAGE_OBJECT_PATH_PATTERN.test(objectPath);
}

// 미리보기(meta description)용 토큰 제거 — path 유효성과 무관하게 "[[image:...]]" 형태 전체를 지운다.
const IMAGE_TOKEN_STRIP_PATTERN = /\[\[image:[^|\]]+(?:\|[^\]]*)?\]\]/g;

// 문단(줄바꿈 2개 이상으로 분리된 블록) 하나가 이미지 토큰 하나로만 이루어져 있을 때만 값을 반환한다.
// post.html renderPost()의 parseImageBlockParagraph()와 동일한 "토큰 한 줄 = 독립 블록" 규칙.
const IMAGE_BLOCK_ONLY_PATTERN = /^\[\[image:([^|\]]+)(?:\|([^\]]*))?\]\]$/;

function parseImageBlockParagraph(paragraph) {
  const trimmed = String(paragraph ?? "").trim();
  const match = IMAGE_BLOCK_ONLY_PATTERN.exec(trimmed);
  if (!match) return null;

  const [, rawPath, rawCaption] = match;
  if (!isValidImageObjectPath(rawPath)) return null;

  return { path: rawPath, caption: rawCaption ? rawCaption.trim() : "" };
}

function buildImageFigureHtml(imageBlock, supabaseUrl) {
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${IMAGE_BUCKET_NAME}/${imageBlock.path}`;
  const altText = escapeHtml(imageBlock.caption || "");
  const figcaptionHtml = imageBlock.caption
    ? `<figcaption class="post-image-caption">${escapeHtml(imageBlock.caption)}</figcaption>`
    : "";
  return `<figure class="post-image-figure"><img class="post-image" src="${escapeHtml(publicUrl)}" alt="${altText}" loading="lazy" decoding="async">${figcaptionHtml}</figure>`;
}

function createDescription(content) {
  const withoutImageTokens = String(content ?? "").replace(IMAGE_TOKEN_STRIP_PATTERN, " ");
  const plainText = decodeHtmlEntities(withoutImageTokens.replace(/<[^>]*>/g, " "))
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
  const dateModified = post.updated_at || post.published_at;
  const articleSection = post.categories?.name;
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
    url: canonicalUrl,
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

  if (dateModified) {
    jsonLd.dateModified = dateModified;
  }

  if (articleSection) {
    jsonLd.articleSection = articleSection;
  }

  if (authorName) {
    jsonLd.author = {
      "@type": "Person",
      name: authorName,
    };
  }

  const jsonLdTag = `<script type="application/ld+json">${serializeJsonLd(jsonLd)}</script>`;
  return result.replace("</head>", `${jsonLdTag}\n</head>`);
}

// posts.content는 HTML이 아닌 순수 텍스트로 저장된다 (문단 구분: 빈 줄, 문단 내 줄바꿈: 단일 개행).
// 실제 저장된 값을 REST로 직접 확인해 검증했다 — post.html의 클라이언트 렌더링(renderPost)과 동일한
// 분해 규칙을 그대로 따른다: \n{2,}으로 문단을 나누고, 문단 내부의 단일 \n은 <br>로 치환한다.
// 문단이 이미지 토큰 하나로만 이루어진 독립 블록이면 figure/img/figcaption을 생성하고,
// 그 외에는 기존 <p>+<br> 규칙을 그대로 적용한다(post.html renderPost()와 동일한 판정 순서).
function buildParagraphsHtml(content, supabaseUrl) {
  const paragraphs = String(content ?? "")
    .split(/\n{2,}/)
    .filter((para) => para.trim() !== "");

  return paragraphs
    .map((para) => {
      const imageBlock = parseImageBlockParagraph(para);
      if (imageBlock) {
        return buildImageFigureHtml(imageBlock, supabaseUrl);
      }
      const escapedLines = para.split("\n").map((line) => escapeHtml(line)).join("<br>");
      return `<p>${escapedLines}</p>`;
    })
    .join("");
}

// Cloudflare Workers 런타임은 로컬 타임존이 없어 Date의 getFullYear 등이 항상 UTC 기준으로 동작한다.
// 사이트 사용자는 한국(KST, UTC+9) 기준으로 날짜를 보므로, 여기서만 명시적으로 9시간을 더해 맞춘다.
function formatDateKST(dateStr) {
  const kst = new Date(new Date(dateStr).getTime() + 9 * 60 * 60 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd}`;
}

function buildPostBodyHtml(post, supabaseUrl) {
  const title = String(post.title ?? "").trim();
  const categoryLabel = post.categories?.code || post.categories?.name || "";
  const author = String(post.profiles?.display_name ?? "").trim();
  const date = formatDateKST(post.published_at);
  const metaText = author ? `${author} · ${date}` : date;

  const parts = [];
  if (categoryLabel) {
    parts.push(`<span class="eyebrow">${escapeHtml(categoryLabel)}</span>`);
  }
  parts.push(`<h1 class="headline" style="font-size:clamp(28px,3.2vw,40px)">${escapeHtml(title)}</h1>`);
  parts.push(`<p class="sub">${escapeHtml(metaText)}</p>`);
  parts.push(`<div class="post-body" style="margin-top:32px">${buildParagraphsHtml(post.content, supabaseUrl)}</div>`);
  return parts.join("");
}

// 정적 스켈레톤(#post-content 내부)을 서버에서 실제 본문 HTML로 통째로 교체한다.
// 클라이언트의 renderPost()도 container.innerHTML = ""로 컨테이너 전체를 지운 뒤 다시 그리므로,
// 여기서 부분 삽입이 아니라 컨테이너 전체를 교체해 두면 클라이언트가 하이드레이션할 때도
// 이 서버 렌더 결과가 그대로 지워지고 동일한 내용으로 다시 채워져 중복 표시가 발생하지 않는다.
function injectPostBody(html, post, supabaseUrl) {
  const pattern = /<div id="post-content">[\s\S]*?<\/div>(\s*<p style="margin-top:40px;" id="back-to-list-para")/;
  if (!pattern.test(html)) return html;
  return html.replace(pattern, `<div id="post-content">${buildPostBodyHtml(post, supabaseUrl)}</div>$1`);
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
    "slug,title,content,published_at,updated_at,audio_title,audio_artist,categories(name,code),profiles(display_name)",
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
    let html = injectMetadata(await staticResponse.clone().text(), post, canonicalUrl);
    html = injectPostBody(html, post, env.SUPABASE_URL);
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
