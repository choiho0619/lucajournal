import { supabase } from "./auth.js";

export async function fetchRecentPosts(limit = 10) {
  const { data, error } = await supabase
    .from("posts")
    .select("slug, title, published_at, categories(name, code)")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error(error);
    return [];
  }
  return data ?? [];
}

export function formatDate(dateStr) {
  const d = new Date(dateStr);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd}`;
}

export function renderRecentPosts(posts, containerId = "recent-posts-list", emptyMessage = "아직 등록된 글이 없습니다") {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = "";

  if (!posts || posts.length === 0) {
    const empty = document.createElement("p");
    empty.className = "axis-body";
    empty.textContent = emptyMessage;
    container.appendChild(empty);
    return;
  }

  for (const post of posts) {
    const row = document.createElement("div");
    row.className = "post-row";

    const left = document.createElement("div");

    const tag = document.createElement("span");
    tag.className = "post-tag";
    tag.textContent = post.categories?.code || post.categories?.name || "";

    const titleLink = document.createElement("a");
    titleLink.className = "post-title";
    titleLink.href = `post.html?slug=${encodeURIComponent(post.slug)}`;
    titleLink.textContent = post.title;

    left.appendChild(tag);
    left.appendChild(titleLink);

    const date = document.createElement("span");
    date.className = "post-date";
    date.textContent = formatDate(post.published_at);

    row.appendChild(left);
    row.appendChild(date);
    container.appendChild(row);
  }
}

export async function fetchPostBySlug(slug) {
  const { data, error } = await supabase
    .from("posts")
    .select("id, author_id, slug, title, content, published_at, categories(name, code), profiles(display_name)")
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (error) {
    return null;
  }
  return data;
}

export async function fetchPostById(id) {
  const { data, error } = await supabase
    .from("posts")
    .select("id, author_id, category_id, title, content, status, categories(code)")
    .eq("id", id)
    .single();

  if (error) {
    return null;
  }
  return data;
}

export async function fetchPostsByCategory(categoryCode, limit = 20) {
  const { data, error } = await supabase
    .from("posts")
    .select("slug, title, published_at, categories!inner(name, code)")
    .eq("status", "published")
    .eq("categories.code", categoryCode)
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error(error);
    return [];
  }
  return data ?? [];
}

export async function fetchMyRole() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return data?.role ?? null;
}

export async function fetchActiveCategories() {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, code, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error(error);
    return [];
  }
  return data ?? [];
}

export function generateSlug(dateObj) {
  const d = dateObj instanceof Date ? dateObj : new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");

  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let random = "";
  for (let i = 0; i < 6; i++) {
    random += chars[Math.floor(Math.random() * chars.length)];
  }

  return `${yyyy}-${mm}-${dd}-${random}`;
}

export async function createPost({ categoryId, title, content, status }) {
  if (!title?.trim() || !content?.trim()) {
    return { error: "제목과 본문을 입력해주세요" };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "로그인이 필요합니다" };
  }

  const { data, error } = await supabase
    .from("posts")
    .insert({
      category_id: categoryId,
      author_id: user.id,
      title,
      content,
      excerpt: content.slice(0, 80),
      slug: generateSlug(new Date()),
      status,
      published_at: status === "published" ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }
  return { data };
}

export async function updatePost({ id, categoryId, title, content }) {
  if (!title?.trim() || !content?.trim()) {
    return { error: "제목과 본문을 입력해주세요" };
  }

  const { data, error } = await supabase
    .from("posts")
    .update({
      category_id: categoryId,
      title,
      content,
      excerpt: content.slice(0, 80),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }
  return { data };
}
