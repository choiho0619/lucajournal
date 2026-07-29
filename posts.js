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
    titleLink.href = `/post?slug=${encodeURIComponent(post.slug)}`;
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

export async function createPost({ categoryId, title, content, status, audioUrl }) {
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
      audio_url: audioUrl ?? null,
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

const AUDIO_BUCKET = "audio";
const MAX_AUDIO_BYTES = 30 * 1024 * 1024;
const ALLOWED_AUDIO_MIME_TYPES = ["audio/mpeg", "audio/mp3"];

function sanitizeAudioFileName(name) {
  const base = String(name || "").replace(/\.[^/.]+$/, "");
  const cleaned = base.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "audio";
}

export async function uploadPostAudio(file) {
  if (!file) {
    return { error: "파일을 선택해주세요" };
  }

  const hasAllowedMime = ALLOWED_AUDIO_MIME_TYPES.includes(file.type);
  const hasMp3Extension = /\.mp3$/i.test(file.name || "");
  if (!hasAllowedMime || !hasMp3Extension) {
    return { error: "MP3 파일만 업로드할 수 있습니다" };
  }

  if (file.size > MAX_AUDIO_BYTES) {
    return { error: "파일 크기는 30MB를 초과할 수 없습니다" };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "로그인이 필요합니다" };
  }

  // 클라이언트 측 role 체크는 UX 안내용일 뿐이며, 실제 접근 제어는 Storage RLS 정책이 담당한다.
  const role = await fetchMyRole();
  if (role !== "writer" && role !== "admin") {
    return { error: "업로드 권한이 없습니다" };
  }

  const path = `posts/${user.id}/${crypto.randomUUID()}-${sanitizeAudioFileName(file.name)}.mp3`;

  const { error: uploadError } = await supabase.storage
    .from(AUDIO_BUCKET)
    .upload(path, file, { upsert: false, contentType: "audio/mpeg" });

  if (uploadError) {
    console.error(uploadError);
    return { error: "업로드 중 오류가 발생했습니다: " + uploadError.message };
  }

  const { data: publicUrlData } = supabase.storage.from(AUDIO_BUCKET).getPublicUrl(path);
  return { data: { path, publicUrl: publicUrlData.publicUrl } };
}
