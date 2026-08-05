import { supabase, isPasswordRecoverySession } from "./auth.js";
import { SUPABASE_URL } from "./supabase-config.js";

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

export async function fetchPlayablePosts() {
  const { data, error } = await supabase
    .from("posts")
    .select("id, slug, title, audio_url, audio_title, audio_artist, published_at")
    .eq("status", "published")
    .not("audio_url", "is", null)
    .order("published_at", { ascending: false });

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
    .select("id, author_id, slug, title, content, published_at, audio_url, audio_title, audio_artist, categories(name, code), profiles(display_name)")
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
    .select("id, author_id, category_id, title, content, status, audio_url, audio_title, audio_artist, categories(code)")
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
  if (isPasswordRecoverySession()) return null;
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

export async function createPost({ categoryId, title, content, status, audioUrl, audioTitle, audioArtist }) {
  if (!title?.trim() || !content?.trim()) {
    return { error: "제목과 본문을 입력해주세요" };
  }

  if (isPasswordRecoverySession()) return { error: "비밀번호 재설정을 먼저 완료해 주세요." };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "로그인이 필요합니다" };
  }

  const insertPayload = {
    category_id: categoryId,
    author_id: user.id,
    title,
    content,
    excerpt: content.slice(0, 80),
    slug: generateSlug(new Date()),
    status,
    published_at: status === "published" ? new Date().toISOString() : null,
    audio_url: audioUrl ?? null,
    audio_title: audioTitle ?? null,
    audio_artist: audioArtist ?? null,
  };
  console.log("[진단] posts.insert 실제 payload:", insertPayload);

  const { data, error } = await supabase
    .from("posts")
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }
  console.log("[진단] insert 결과 data.audio_url:", data?.audio_url);
  return { data };
}

export async function updatePost({ id, categoryId, title, content, audioUrl, audioTitle, audioArtist }) {
  if (!title?.trim() || !content?.trim()) {
    return { error: "제목과 본문을 입력해주세요" };
  }
  if (isPasswordRecoverySession()) return { error: "비밀번호 재설정을 먼저 완료해 주세요." };

  const updatePayload = {
    category_id: categoryId,
    title,
    content,
    excerpt: content.slice(0, 80),
  };
  // audioUrl/audioTitle/audioArtist: undefined면 기존 값 유지(키 자체를 보내지 않음), null이면 제거, 문자열이면 교체
  if (audioUrl !== undefined) {
    updatePayload.audio_url = audioUrl;
  }
  if (audioTitle !== undefined) {
    updatePayload.audio_title = audioTitle;
  }
  if (audioArtist !== undefined) {
    updatePayload.audio_artist = audioArtist;
  }

  const { data, error } = await supabase
    .from("posts")
    .update(updatePayload)
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
  if (isPasswordRecoverySession()) return { error: "비밀번호 재설정을 먼저 완료해 주세요." };

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

// Supabase public URL(https://{project}.supabase.co/storage/v1/object/public/{bucket}/{path})에서
// 이 프로젝트/이 bucket의 object path만 안전하게 추출한다. URL 객체와 고정 prefix로 검증하며,
// 다른 프로젝트·다른 bucket을 가리키는 URL이거나 예상 경로 형식(posts/{userId}/{filename}.mp3)이
// 아니면 삭제를 실행하지 않고 오류를 반환한다.
const AUDIO_PUBLIC_URL_PREFIX = `/storage/v1/object/public/${AUDIO_BUCKET}/`;
const AUDIO_OBJECT_PATH_PATTERN = /^posts\/[^/]+\/[^/]+\.mp3$/i;

function resolveAudioObjectPath(audioUrl) {
  let parsed;
  try {
    parsed = new URL(audioUrl);
  } catch {
    return { error: "잘못된 오디오 URL 형식입니다" };
  }

  if (parsed.origin !== new URL(SUPABASE_URL).origin) {
    return { error: "허용되지 않은 저장소 URL입니다" };
  }

  if (!parsed.pathname.startsWith(AUDIO_PUBLIC_URL_PREFIX)) {
    return { error: "허용되지 않은 저장소 경로입니다" };
  }

  let objectPath;
  try {
    objectPath = decodeURIComponent(parsed.pathname.slice(AUDIO_PUBLIC_URL_PREFIX.length));
  } catch {
    return { error: "잘못된 오디오 경로 인코딩입니다" };
  }

  if (!AUDIO_OBJECT_PATH_PATTERN.test(objectPath)) {
    return { error: "예상되는 오디오 경로 형식이 아닙니다" };
  }

  return { path: objectPath };
}

// audioUrl이 없으면 아무 작업 없이 성공 처리한다. Storage DELETE 정책이 없거나 권한이 없으면
// Supabase가 반환하는 오류 메시지를 그대로 전달한다 (호출부에서 사용자 경고/로그로 활용).
export async function deletePostAudio(audioUrl) {
  if (isPasswordRecoverySession()) return { error: "비밀번호 재설정을 먼저 완료해 주세요." };
  if (!audioUrl) {
    return { error: null };
  }

  const resolved = resolveAudioObjectPath(audioUrl);
  if (resolved.error) {
    return { error: resolved.error };
  }

  const { error } = await supabase.storage.from(AUDIO_BUCKET).remove([resolved.path]);
  if (error) {
    console.error("[Storage] 오디오 파일 삭제 실패:", error.message);
    return { error: error.message };
  }

  return { error: null };
}

// 게시글 삭제: DB 행 삭제가 먼저 성공해야 Storage 정리를 시도한다. Storage 정리 실패는
// 게시글 삭제 자체를 실패로 되돌리지 않으며, cleanupError로 별도 보고한다.
export async function deletePost(id, audioUrl) {
  if (isPasswordRecoverySession()) {
    return { error: "비밀번호 재설정을 먼저 완료해 주세요.", cleanupError: null };
  }
  const { error } = await supabase.from("posts").delete().eq("id", id);
  if (error) {
    return { error: error.message };
  }

  if (!audioUrl) {
    return { error: null, cleanupError: null };
  }

  const cleanup = await deletePostAudio(audioUrl);
  return { error: null, cleanupError: cleanup.error };
}
