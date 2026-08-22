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

// category.html의 PAGE_SIZE(클라이언트 페이지네이션)와 반드시 같은 값을 유지해야 한다.
// 서버가 다른 페이지 크기로 목록을 그리면 클라이언트 하이드레이션 후 페이지 번호가 어긋난다.
const PAGE_SIZE = 12;

// Cloudflare Workers 런타임은 로컬 타임존이 없어 항상 UTC로 동작한다. 사이트 사용자는
// 한국(KST, UTC+9) 기준으로 날짜를 보므로 여기서만 명시적으로 9시간을 더해 맞춘다.
function formatDateKST(dateStr) {
  const kst = new Date(new Date(dateStr).getTime() + 9 * 60 * 60 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd}`;
}

// category.html의 getRequestedPage()와 동일한 규칙: 값이 없거나 숫자가 아니거나 1 미만이면 1.
function getRequestedPage(url) {
  const raw = url.searchParams.get("page");
  const n = Number(raw);
  if (!raw || !Number.isInteger(n) || n < 1) return 1;
  return n;
}

// posts.js의 fetchPostsByCategoryPaginated()와 동일한 필터·정렬을 REST 쿼리로 재현한다.
// Range/Range-Unit + Prefer: count=exact 조합은 supabase-js의 .range()+{count:'exact'}가
// 내부적으로 보내는 것과 동일한 헤더이며, 응답도 동일하게 offset 초과 시 416(PGRST103)이 된다.
async function fetchCategoryPostsPage(categoryCode, page, env) {
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const endpoint = new URL("/rest/v1/posts", env.SUPABASE_URL);
  endpoint.searchParams.set("select", "slug,title,published_at,categories!inner(name,code)");
  endpoint.searchParams.set("status", "eq.published");
  endpoint.searchParams.set("categories.code", `eq.${categoryCode}`);
  endpoint.searchParams.set("order", "published_at.desc");

  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      "Range-Unit": "items",
      Range: `${from}-${to}`,
      Prefer: "count=exact",
    },
  });

  if (response.status === 416) {
    return { outOfRange: true };
  }
  if (!response.ok) {
    throw new Error(`Supabase request failed with status ${response.status}`);
  }

  const posts = await response.json();
  const total = Number((response.headers.get("content-range") || "").split("/")[1]) || 0;
  return { outOfRange: false, posts: Array.isArray(posts) ? posts : [], total };
}

// PGRST103(요청한 page가 실제 총 개수를 벗어남) 발생 시 count만 조회(HEAD, Range 없음)해
// 마지막 페이지를 계산하고 그 페이지로 한 번만 재조회한다 — posts.js의 서버(클라이언트) 복구
// 로직과 동일한 결과를 내도록 맞춘 것으로, 서버가 그리는 페이지와 클라이언트가 정착하는
// 페이지가 어긋나지 않게 한다.
async function fetchCategoryPostCount(categoryCode, env) {
  const endpoint = new URL("/rest/v1/posts", env.SUPABASE_URL);
  endpoint.searchParams.set("select", "id,categories!inner(code)");
  endpoint.searchParams.set("status", "eq.published");
  endpoint.searchParams.set("categories.code", `eq.${categoryCode}`);

  const response = await fetch(endpoint, {
    method: "HEAD",
    headers: {
      Accept: "application/json",
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      Prefer: "count=exact",
    },
  });

  if (!response.ok) return 0;
  const total = Number((response.headers.get("content-range") || "").split("/")[1]);
  return Number.isFinite(total) ? total : 0;
}

async function resolveCategoryPosts(categoryCode, requestedPage, env) {
  const first = await fetchCategoryPostsPage(categoryCode, requestedPage, env);
  if (!first.outOfRange) {
    return first.posts;
  }

  const total = await fetchCategoryPostCount(categoryCode, env);
  if (!total) {
    return [];
  }

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const retry = await fetchCategoryPostsPage(categoryCode, lastPage, env);
  return retry.outOfRange ? [] : retry.posts;
}

function buildPostRowHtml(post) {
  const tag = post.categories?.code || post.categories?.name || "";
  const href = `/post?slug=${escapeHtml(encodeURIComponent(post.slug ?? ""))}`;
  const title = escapeHtml(post.title ?? "");
  const date = escapeHtml(formatDateKST(post.published_at));
  return `<div class="post-row"><div><span class="post-tag">${escapeHtml(tag)}</span><a class="post-title" href="${href}">${title}</a></div><span class="post-date">${date}</span></div>`;
}

// 정적 스켈레톤(#category-posts-list 내부)을 서버 렌더 결과로 통째 교체한다. 클라이언트의
// renderRecentPosts()도 컨테이너를 innerHTML=""로 지운 뒤 다시 그리므로 중복 표시가 생기지 않는다.
function injectCategoryPostList(html, posts) {
  const pattern = /<div id="category-posts-list">[\s\S]*?<\/div>(\s*<nav id="category-pagination")/;
  if (!pattern.test(html)) return html;
  const listHtml = posts.map(buildPostRowHtml).join("");
  return html.replace(pattern, `<div id="category-posts-list">${listHtml}</div>$1`);
}

async function fetchStaticCategory(request, env) {
  const assetUrl = new URL(request.url);
  assetUrl.pathname = "/category";
  assetUrl.search = "";
  return env.ASSETS.fetch(assetUrl);
}

export async function onRequestGet({ request, env }) {
  const staticResponse = await fetchStaticCategory(request, env);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!VALID_CATEGORY_CODES.has(code)) {
    return staticResponse;
  }

  const canonicalUrl = `${SITE_URL}/category?code=${encodeURIComponent(code)}`;
  let html = injectMetadata(await staticResponse.clone().text(), canonicalUrl);

  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    try {
      const posts = await resolveCategoryPosts(code, getRequestedPage(url), env);
      html = injectCategoryPostList(html, posts);
    } catch {
      // 목록 주입 실패는 canonical/OG 메타데이터 응답 자체를 막지 않는다 — 조용히 건너뛴다.
    }
  }

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
