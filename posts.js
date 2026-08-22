import { supabase, isPasswordRecoverySession } from "./auth.js";
import { SUPABASE_URL } from "./supabase-config.js";

// crypto.randomUUID()는 Secure Context(HTTPS 또는 localhost)에서만 제공된다. HTTP+IP 개발 주소
// (예: http://100.115.89.75:8788/)에서는 randomUUID가 없어 예외가 발생하므로, Storage object path에
// 쓰이는 모든 UUID 생성은 이 공용 helper를 거친다. getRandomValues()는 Secure Context와 무관하게
// 항상 제공되며, Math.random()은 예측 가능해 사용하지 않는다.
function generateStorageObjectId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const VALID_AUDIO_KINDS = new Set(["song", "audiobook"]);
function normalizeAudioKind(value) {
  return VALID_AUDIO_KINDS.has(value) ? value : "song";
}

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
    .select("id, slug, title, audio_url, audio_title, audio_artist, audio_kind, published_at")
    .eq("status", "published")
    .not("audio_url", "is", null)
    .neq("audio_kind", "audiobook")
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
    .select("id, author_id, category_id, title, content, status, audio_url, audio_title, audio_artist, audio_kind, categories(code)")
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

// prev: 기준 published_at보다 과거인 글 중 가장 최신 1건. next: 기준 published_at보다 미래인 글 중 가장 과거 1건.
// .single() 대신 .limit(1)을 쓰는 이유: 대상이 0건이어도 에러가 아니라 빈 배열로 응답해야 하기 때문.
export async function fetchAdjacentPosts(categoryCode, publishedAt) {
  try {
    const [prevResult, nextResult] = await Promise.all([
      supabase
        .from("posts")
        .select("slug, title, categories!inner(code)")
        .eq("status", "published")
        .eq("categories.code", categoryCode)
        .lt("published_at", publishedAt)
        .order("published_at", { ascending: false })
        .limit(1),
      supabase
        .from("posts")
        .select("slug, title, categories!inner(code)")
        .eq("status", "published")
        .eq("categories.code", categoryCode)
        .gt("published_at", publishedAt)
        .order("published_at", { ascending: true })
        .limit(1),
    ]);

    if (prevResult.error) console.error(prevResult.error);
    if (nextResult.error) console.error(nextResult.error);

    const prevRow = prevResult.data?.[0];
    const nextRow = nextResult.data?.[0];

    return {
      prev: prevRow ? { slug: prevRow.slug, title: prevRow.title } : null,
      next: nextRow ? { slug: nextRow.slug, title: nextRow.title } : null,
    };
  } catch (err) {
    console.error(err);
    return { prev: null, next: null };
  }
}

export async function fetchPostsByCategoryPaginated(categoryCode, page = 1, pageSize = 12) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from("posts")
    .select("slug, title, published_at, categories!inner(name, code)", { count: "exact" })
    .eq("status", "published")
    .eq("categories.code", categoryCode)
    .order("published_at", { ascending: false })
    .range(from, to);

  if (error) {
    if (error.code !== "PGRST103") {
      console.error(error);
      return { posts: [], total: 0, page };
    }

    // 요청한 page의 offset이 실제 총 개수를 벗어난 경우(PGRST103): count만 조회해 마지막 페이지를
    // 계산하고, 그 페이지로 딱 한 번만 재조회한다. 무한 루프 방지를 위해 이 재조회 결과는 그대로 반환한다.
    const { count: totalCount, error: countError } = await supabase
      .from("posts")
      .select("id, categories!inner(code)", { count: "exact", head: true })
      .eq("status", "published")
      .eq("categories.code", categoryCode);

    if (countError) {
      console.error(countError);
      return { posts: [], total: 0, page: 1 };
    }
    if (!totalCount) {
      return { posts: [], total: 0, page: 1 };
    }

    const lastPage = Math.max(1, Math.ceil(totalCount / pageSize));
    const retryFrom = (lastPage - 1) * pageSize;
    const retryTo = retryFrom + pageSize - 1;

    const { data: retryData, error: retryError } = await supabase
      .from("posts")
      .select("slug, title, published_at, categories!inner(name, code)")
      .eq("status", "published")
      .eq("categories.code", categoryCode)
      .order("published_at", { ascending: false })
      .range(retryFrom, retryTo);

    if (retryError) {
      console.error(retryError);
      return { posts: [], total: totalCount, page: 1 };
    }
    return { posts: retryData ?? [], total: totalCount, page: lastPage };
  }

  return { posts: data ?? [], total: count ?? 0, page };
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

export async function createPost({ categoryId, title, content, status, audioUrl, audioTitle, audioArtist, audioKind }) {
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
    excerpt: stripImageTokens(content).slice(0, 80),
    slug: generateSlug(new Date()),
    status,
    published_at: status === "published" ? new Date().toISOString() : null,
    audio_url: audioUrl ?? null,
    audio_title: audioTitle ?? null,
    audio_artist: audioArtist ?? null,
    audio_kind: normalizeAudioKind(audioKind),
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

export async function updatePost({ id, categoryId, title, content, audioUrl, audioTitle, audioArtist, audioKind }) {
  if (!title?.trim() || !content?.trim()) {
    return { error: "제목과 본문을 입력해주세요" };
  }
  if (isPasswordRecoverySession()) return { error: "비밀번호 재설정을 먼저 완료해 주세요." };

  const updatePayload = {
    category_id: categoryId,
    title,
    content,
    excerpt: stripImageTokens(content).slice(0, 80),
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
  updatePayload.audio_kind = normalizeAudioKind(audioKind);

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

  const path = `posts/${user.id}/${generateStorageObjectId()}-${sanitizeAudioFileName(file.name)}.mp3`;

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

// 게시글 삭제: DB 행 삭제가 먼저 성공해야 Storage 정리를 시도한다. Storage 정리 실패(오디오·이미지
// 어느 쪽이든)는 게시글 삭제 자체를 실패로 되돌리지 않으며, 각각 cleanupError/imageCleanupError로
// 별도 보고한다. content는 삭제 대상 게시글의 본문(호출부가 이미 보유한 값을 그대로 전달) — 별도
// DB 재조회 없이 여기서 유효 이미지 object path를 추출해 정리한다.
export async function deletePost(id, audioUrl, content) {
  if (isPasswordRecoverySession()) {
    return { error: "비밀번호 재설정을 먼저 완료해 주세요.", cleanupError: null, imageCleanupError: null };
  }
  const { error } = await supabase.from("posts").delete().eq("id", id);
  if (error) {
    return { error: error.message };
  }

  const audioCleanup = audioUrl ? await deletePostAudio(audioUrl) : { error: null };

  const imagePaths = [...extractValidImageObjectPaths(content)];
  const imageCleanup = imagePaths.length > 0 ? await deletePostImages(imagePaths) : { failures: [] };
  const imageCleanupError =
    imageCleanup.failures.length > 0
      ? imageCleanup.failures.map((f) => `${f.path}: ${f.error}`).join("; ")
      : null;

  return { error: null, cleanupError: audioCleanup.error, imageCleanupError };
}

// ── 본문 이미지 (Stage 1: Storage helper만. write.html/post.html/functions/post.js에는 아직 연결하지 않음) ──
//
// audio_url과 달리 이미지는 posts.content 안에 전체 public URL이 아니라 object path만
// 토큰으로 저장하는 것을 전제로 한다([[image:posts/{userId}/{uuid}-{name}.{ext}|caption]], 아직 미구현).
// 그래서 삭제 helper(deletePostImage)는 URL이 아니라 object path를 그대로 받아 검증한다 —
// 오디오처럼 URL을 파싱해 path를 역산하는 단계가 필요 없다.
const IMAGE_BUCKET = "images";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// 입력으로 허용하는 확장자(jpg/jpeg 둘 다 허용)와, 저장 시 실제로 사용할 정규화된 확장자(jpeg → jpg)를 분리한다.
// 오디오가 원본 파일명 확장자와 무관하게 항상 .mp3로 저장하는 것과 같은 원칙 — 저장되는 경로의 확장자 종류를
// 최소화해 이후 검증 정규식(IMAGE_OBJECT_PATH_PATTERN)을 단순하고 예측 가능하게 유지한다.
const ALLOWED_IMAGE_UPLOAD_EXTENSIONS_BY_MIME = {
  "image/jpeg": new Set(["jpg", "jpeg"]),
  "image/png": new Set(["png"]),
  "image/webp": new Set(["webp"]),
};
const CANONICAL_IMAGE_EXTENSION_BY_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function getFileExtension(name) {
  const match = /\.([a-zA-Z0-9]+)$/.exec(String(name || ""));
  return match ? match[1].toLowerCase() : "";
}

function sanitizeImageFileName(name) {
  const base = String(name || "").replace(/\.[^/.]+$/, "");
  const cleaned = base.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "image";
}

// MIME과 확장자를 모두 검사해 확장자만 위장한 파일을 걸러낸다(오디오의 hasAllowedMime && hasMp3Extension과 동일 원칙).
// 통과 시 저장에 사용할 정규화된 확장자(jpg/png/webp)를 함께 반환한다.
export function validatePostImageFile(file) {
  if (!file) {
    return { error: "파일을 선택해주세요" };
  }

  const allowedExtensions = ALLOWED_IMAGE_UPLOAD_EXTENSIONS_BY_MIME[file.type];
  const extension = getFileExtension(file.name);
  if (!allowedExtensions || !allowedExtensions.has(extension)) {
    return { error: "JPG, PNG, WEBP 이미지 파일만 업로드할 수 있습니다" };
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return { error: "파일 크기는 5MB를 초과할 수 없습니다" };
  }

  return { error: null, extension: CANONICAL_IMAGE_EXTENSION_BY_MIME[file.type] };
}

// posts/{userId}/... 하위만 허용하는 안전한 object path를 만든다. userId는 호출부가 auth.getUser()로
// 확인한 실제 로그인 사용자 id만 넘겨야 하며, 이 함수 자체는 그 값을 신뢰한다(신뢰 경계는 uploadPostImage).
function buildPostImageObjectPath(userId, originalFileName, extension) {
  return `posts/${userId}/${generateStorageObjectId()}-${sanitizeImageFileName(originalFileName)}.${extension}`;
}

// 삭제·렌더링 양쪽에서 재사용하는 object path 검증. 다음을 모두 만족해야 통과한다:
// ① posts/ 로 시작 ② 정확히 3개 세그먼트(posts/{userId}/{filename}) ③ userId가 UUID 형식
// ④ filename이 {uuid}-{정리된 이름}.{jpg|png|webp} 형식 ⑤ "..", "\\", 선행 "/", 연속 "//" 없음(경로 이탈 차단).
// 다른 bucket을 가리킬 방법 자체가 없다 — 이 함수는 IMAGE_BUCKET 전용이며 항상 IMAGE_BUCKET에서만 remove()를 호출한다.
const IMAGE_OBJECT_PATH_PATTERN =
  /^posts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9_-]+\.(jpg|png|webp)$/i;

export function validatePostImageObjectPath(objectPath) {
  if (typeof objectPath !== "string" || objectPath.length === 0) {
    return { error: "이미지 경로가 없습니다" };
  }

  if (objectPath.includes("..") || objectPath.includes("\\") || objectPath.startsWith("/") || objectPath.includes("//")) {
    return { error: "허용되지 않은 이미지 경로입니다" };
  }

  if (!IMAGE_OBJECT_PATH_PATTERN.test(objectPath)) {
    return { error: "예상되는 이미지 경로 형식이 아닙니다" };
  }

  return { error: null, path: objectPath };
}

// 파일 선택 즉시가 아니라 게시글 저장 시점에 호출되는 것을 전제로 한 helper (Stage 1은 이 함수를
// 어디서도 호출하지 않는다 — write.html 연결은 이후 Stage에서 진행).
// role 사전 확인은 오디오와 동일하게 UX 안내용일 뿐이며, 실제 접근 제어는 Storage RLS가 담당한다.
export async function uploadPostImage(file) {
  if (isPasswordRecoverySession()) return { error: "비밀번호 재설정을 먼저 완료해 주세요." };

  const validation = validatePostImageFile(file);
  if (validation.error) {
    return { error: validation.error };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "로그인이 필요합니다" };
  }

  const role = await fetchMyRole();
  if (role !== "writer" && role !== "admin") {
    return { error: "업로드 권한이 없습니다" };
  }

  const path = buildPostImageObjectPath(user.id, file.name, validation.extension);

  const { error: uploadError } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type });

  if (uploadError) {
    console.error(uploadError);
    return { error: "업로드 중 오류가 발생했습니다: " + uploadError.message };
  }

  return { data: { path } };
}

// object path만 받는다(URL 아님) — content 토큰에 URL 전체가 아니라 path를 저장하기로 한 결정과 대응된다.
// 검증되지 않은 path는 절대 remove()에 전달하지 않는다.
export async function deletePostImage(objectPath) {
  if (isPasswordRecoverySession()) return { error: "비밀번호 재설정을 먼저 완료해 주세요." };
  if (!objectPath) {
    return { error: null };
  }

  const resolved = validatePostImageObjectPath(objectPath);
  if (resolved.error) {
    return { error: resolved.error };
  }

  const { error } = await supabase.storage.from(IMAGE_BUCKET).remove([resolved.path]);
  if (error) {
    console.error("[Storage] 이미지 파일 삭제 실패:", error.message);
    return { error: error.message };
  }

  return { error: null };
}

// 여러 이미지를 best-effort로 삭제한다(호출부는 실패해도 이미 성공한 DB 저장/삭제를 되돌리지 않는다).
// 항목마다 기존 deletePostImage()를 그대로 재사용해 검증을 우회하지 않는다. 지금 규모(글 1편당
// 이미지가 소수)에서는 Storage remove batch API 대신 단건 삭제 반복으로 충분하다고 판단해
// 새 bucket API 호출을 추가하지 않았다 — 향후 규모가 커지면 이 함수 내부만 batch로 바꾸면 된다.
export async function deletePostImages(paths) {
  const failures = [];
  for (const path of paths) {
    const cleanup = await deletePostImage(path);
    if (cleanup.error) {
      failures.push({ path, error: cleanup.error });
    }
  }
  return { failures };
}

// 렌더링 전용 helper(선택 사용). object path와 public URL의 책임을 분리하기 위해 별도로 둔다 —
// 삭제 경로는 이 함수를 거치지 않고 object path를 직접 검증한다.
export function getPostImagePublicUrl(objectPath) {
  const resolved = validatePostImageObjectPath(objectPath);
  if (resolved.error) {
    return { error: resolved.error };
  }

  const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(resolved.path);
  return { data: { publicUrl: data.publicUrl } };
}

// ── 본문 이미지 토큰 parser (Stage 2: 확정 토큰만. pending:uuid는 validatePostImageObjectPath를
// 통과하지 못해 자연히 유효 토큰으로 인정되지 않는다 — Stage 3에서 별도 케이스로 처리) ──
//
// 문법: [[image:<objectPath>|<caption>]] (caption 선택). path가 validatePostImageObjectPath()를
// 통과하지 못하면(외부 URL, javascript:, path traversal, pending: 등) 애초에 유효 토큰으로 추출되지 않는다.
const IMAGE_TOKEN_PATTERN = /\[\[image:([^|\]]+)(?:\|([^\]]*))?\]\]/g;

// content 전체에서 유효한(=validatePostImageObjectPath 통과) 이미지 토큰을 등장 순서대로 추출한다.
// 잘못된 토큰(외부 URL·javascript:·pending: 등)은 결과에 포함되지 않는다.
export function extractValidImageTokens(content) {
  const text = String(content ?? "");
  const tokens = [];
  IMAGE_TOKEN_PATTERN.lastIndex = 0;
  let match;
  while ((match = IMAGE_TOKEN_PATTERN.exec(text)) !== null) {
    const [raw, rawPath, rawCaption] = match;
    const resolved = validatePostImageObjectPath(rawPath);
    if (resolved.error) continue;
    tokens.push({ raw, path: resolved.path, caption: rawCaption ? rawCaption.trim() : "" });
  }
  return tokens;
}

// Stage 3/4 수명주기 diff(저장 전/후 비교, 게시글 삭제 정리)에서 재사용할 중복 제거 집합.
// 동일 이미지가 본문 여러 곳에 쓰여도 Set이므로 한 번만 포함된다.
export function extractValidImageObjectPaths(content) {
  return new Set(extractValidImageTokens(content).map((token) => token.path));
}

// 문단(paragraph) 하나가 "이미지 토큰 하나로만 이루어진 독립 블록"인지 판정한다.
// 문단을 trim한 결과가 유효한 이미지 토큰 정확히 1개와 100% 일치할 때만 {path, caption}을 반환하고,
// 그 외(문장 중간에 섞임, 여러 토큰이 붙어 있음, 유효하지 않은 path 등)에는 null을 반환해
// 호출부가 기존 일반 텍스트 렌더링 경로를 그대로 쓰게 한다(v1: "토큰 한 줄 = 독립 블록" 규칙).
export function parseImageBlockParagraph(paragraph) {
  const trimmed = String(paragraph ?? "").trim();
  const tokens = extractValidImageTokens(trimmed);
  if (tokens.length !== 1 || tokens[0].raw !== trimmed) return null;
  return { path: tokens[0].path, caption: tokens[0].caption };
}

// excerpt/description 등 미리보기 텍스트에 토큰 원문이 그대로 노출되지 않도록 제거한다.
// 미리보기 용도이므로 path 유효성과 무관하게 "[[image:...]]" 형태 전체를 지운다(그림 문법 자체가
// 사람이 읽는 텍스트가 아니므로, 통과 못한 토큰이라도 그대로 노출되면 안 되는 것은 동일).
export function stripImageTokens(content) {
  return String(content ?? "").replace(IMAGE_TOKEN_PATTERN, "");
}

// ── pending 이미지 토큰 (Stage 3: 작성 중에만 존재, DB에는 절대 저장되지 않는다) ──
//
// 확정 토큰 parser(extractValidImageTokens 등, 위 섹션)와 문법·용도가 다르므로 로직을 섞지 않는다.
// pending 토큰은 렌더링 대상이 아니라 "저장 직전 전량 확정 치환 또는 저장 거부" 판정에만 쓰인다.
// 문법: [[image:pending:<UUID>|<caption>]] (caption 선택). pendingId는 UUID 형식만 유효하다.
const PENDING_IMAGE_TOKEN_PATTERN = /\[\[image:pending:([^|\]]*)(?:\|([^\]]*))?\]\]/g;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// content 안의 pending 토큰을 등장 순서대로 전부 추출한다. pendingId가 UUID 형식이 아니면
// (malformed) 결과에서 제외하지 않고 valid:false로 표시한다 — 저장 직전 방어가 이 malformed 여부까지
// 명시적으로 확인해야 하기 때문에, parser 단계에서 조용히 걸러버리지 않는다.
export function extractPendingImageTokens(content) {
  const text = String(content ?? "");
  const tokens = [];
  PENDING_IMAGE_TOKEN_PATTERN.lastIndex = 0;
  let match;
  while ((match = PENDING_IMAGE_TOKEN_PATTERN.exec(text)) !== null) {
    const [raw, rawPendingId, rawCaption] = match;
    const valid = UUID_PATTERN.test(rawPendingId);
    tokens.push({
      raw,
      pendingId: valid ? rawPendingId.toLowerCase() : null,
      caption: rawCaption ? rawCaption.trim() : "",
      valid,
    });
  }
  return tokens;
}

// 유효한(UUID 형식) pendingId만 중복 제거된 Set으로 반환한다.
export function extractPendingImageIds(content) {
  const ids = new Set();
  for (const token of extractPendingImageTokens(content)) {
    if (token.valid) ids.add(token.pendingId);
  }
  return ids;
}

// content 안에 "[[image:pending:" 형태가 하나라도 남아 있는지 검사한다(malformed 포함). parser 결과만
// 신뢰하지 않고 원시 문자열 자체를 다시 검사하는 저장 직전 최종 방어용 — pending 토큰이 DB에
// 그대로 저장되는 것을 이중으로 막는다.
export function containsPendingImageToken(content) {
  return /\[\[image:pending:/.test(String(content ?? ""));
}

// pendingId → 확정 object path 매핑으로 content 안의 모든 pending 토큰을 확정 토큰으로 치환한다.
// caption은 그대로 보존한다. 매핑에 없는 pendingId(또는 malformed pendingId)의 토큰은 치환하지 않고
// 그대로 남긴다 — 호출부가 치환 전에 매핑 완전성을 이미 확인했다는 전제이며, 이 함수 자체는 방어
// 로직 없는 순수 치환기다(저장 직전 방어는 containsPendingImageToken이 별도로 담당).
export function replacePendingImageTokens(content, pendingIdToObjectPath) {
  return String(content ?? "").replace(PENDING_IMAGE_TOKEN_PATTERN, (raw, rawPendingId, rawCaption) => {
    if (!UUID_PATTERN.test(rawPendingId)) return raw;
    const objectPath = pendingIdToObjectPath.get(rawPendingId.toLowerCase());
    if (!objectPath) return raw;
    const caption = rawCaption ? rawCaption.trim() : "";
    return caption ? `[[image:${objectPath}|${caption}]]` : `[[image:${objectPath}]]`;
  });
}
