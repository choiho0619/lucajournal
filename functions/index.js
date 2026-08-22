// index.html의 fetchRecentPosts() 기본값(posts.js)과 반드시 같은 값을 유지해야 한다.
const RECENT_POSTS_LIMIT = 10;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Cloudflare Workers 런타임은 로컬 타임존이 없어 항상 UTC로 동작한다. 사이트 사용자는
// 한국(KST, UTC+9) 기준으로 날짜를 보므로 여기서만 명시적으로 9시간을 더해 맞춘다.
function formatDateKST(dateStr) {
  const kst = new Date(new Date(dateStr).getTime() + 9 * 60 * 60 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd}`;
}

async function fetchStaticIndex(request, env) {
  const assetUrl = new URL(request.url);
  assetUrl.pathname = "/";
  assetUrl.search = "";
  return env.ASSETS.fetch(assetUrl);
}

async function fetchRecentPublishedPosts(env) {
  const endpoint = new URL("/rest/v1/posts", env.SUPABASE_URL);
  endpoint.searchParams.set("select", "slug,title,published_at,categories(name,code)");
  endpoint.searchParams.set("status", "eq.published");
  endpoint.searchParams.set("order", "published_at.desc");
  endpoint.searchParams.set("limit", String(RECENT_POSTS_LIMIT));

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
  return Array.isArray(posts) ? posts : [];
}

function buildPostRowHtml(post) {
  const tag = post.categories?.code || post.categories?.name || "";
  const href = `/post?slug=${escapeHtml(encodeURIComponent(post.slug ?? ""))}`;
  const title = escapeHtml(post.title ?? "");
  const date = escapeHtml(formatDateKST(post.published_at));
  return `<div class="post-row"><div><span class="post-tag">${escapeHtml(tag)}</span><a class="post-title" href="${href}">${title}</a></div><span class="post-date">${date}</span></div>`;
}

// 정적 스켈레톤(#recent-posts-list 내부)을 서버 렌더 결과로 통째 교체한다. 클라이언트의
// renderRecentPosts()도 컨테이너를 innerHTML=""로 지운 뒤 다시 그리므로 중복 표시가 생기지 않는다.
function injectRecentPostsList(html, posts) {
  const pattern = /<div id="recent-posts-list">[\s\S]*?<\/div>(\s*<\/section>)/;
  if (!pattern.test(html)) return html;
  const listHtml = posts.map(buildPostRowHtml).join("");
  return html.replace(pattern, `<div id="recent-posts-list">${listHtml}</div>$1`);
}

export async function onRequestGet({ request, env }) {
  const staticResponse = await fetchStaticIndex(request, env);

  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return staticResponse;
  }

  try {
    const posts = await fetchRecentPublishedPosts(env);
    const html = injectRecentPostsList(await staticResponse.clone().text(), posts);
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
