# LucaJournal 게시글 SEO — Cloudflare Pages Function 도입 설계 분석

조사 범위: Cloudflare 배포 설정, `post.html`, `posts.js`, Supabase 설정 파일(`supabase-config.js`, `auth.js`, `supabase/config.toml`).
본 문서는 설계 검토용 분석 보고서이며 코드를 수정하거나 배포하지 않았다 (`git status` — 신규 파일 없음, 기존 파일 무변경, 본 문서 저장 전 기준).

이전 보고서(`SEARCH_CONSOLE_REDIRECT_ANALYSIS.md`, `SITE_IMPROVEMENT_ANALYSIS.md`)에서 지적한 "게시글 메타데이터/본문이 최초 HTML에 없음" 문제(§A)에 대한 구체적 해결 경로 중 하나로 Cloudflare Pages Function 도입 가능성을 검토한다.

---

## 1. 현재 배포 구조

**Fact**
- 저장소 루트에 `package.json`, `wrangler.toml/json/jsonc`, `_redirects`, `_headers`, `_worker.js`가 없다 — 빌드 파이프라인이 없는 순수 정적 파일 배포다.
- 루트에 `/functions` 디렉터리가 없다 (Pages Functions 미사용). `supabase/functions`는 Supabase **Edge Functions**(이메일 발송용 `send-daily-digest`, `send-confirmation-email`)이며 Cloudflare Pages Functions와는 별개 런타임/배포 대상이다.
- 배포 서버 응답 헤더(`server: cloudflare`, `cf-cache-status: DYNAMIC`)로 Cloudflare에 배포 중임을 확인했다. `.html` 확장자 URL과 trailing slash는 308로 확장자 없는 URL로 자동 정규화된다(이전 조사에서 확인, 이번 세션에서 `/post.html?slug=test` → 308 → `/post?slug=test`로 재확인).
- `/post`, `/post?slug=<임의값>` 요청 모두 200으로 `post.html`과 동일한 정적 HTML(스켈레톤 상태)을 반환한다 — slug 유효성과 무관하게 항상 같은 정적 파일이 서빙되고, 실제 게시글 존재 여부 판단은 브라우저에서 `posts.js`의 `fetchPostBySlug()`가 Supabase에 질의한 뒤에야 이뤄진다.

**Hypothesis**
- `.html` 확장자 제거 및 `/post` 정규화는 Cloudflare Pages 플랫폼의 기본 "clean URL" 동작으로 추정된다(이전 보고서와 동일 근거: 저장소에 관련 설정 파일이 없음). Pages Functions를 추가해도 이 정규화 동작 자체는 플랫폼이 계속 담당할 것으로 보이나, 대시보드 확인 전까지 확정할 수 없다.

**Check**
- Cloudflare 대시보드에서 이 프로젝트가 "Pages (정적 자산만)"인지, Functions가 이미 한 번이라도 활성화/배포된 이력이 있는지 확인 필요.
- 프로젝트의 `compatibility_date` / `compatibility_flags` 설정(Functions 런타임 동작에 영향) 확인 필요 — 저장소에 `wrangler.toml`이 없어 로컬 파일로는 확인 불가.

---

## 2. Function 적용 가능 여부

**Fact**
- Cloudflare Pages는 저장소 루트의 `/functions` 디렉터리에 파일 기반 라우팅으로 서버리스 함수(Cloudflare Workers 런타임)를 배포하는 기능을 표준 제공한다. `_worker.js`(Advanced Mode)가 없는 한 `/functions`는 정적 자산보다 우선 매칭된다. 이 프로젝트는 `_worker.js`가 없으므로 `/functions` 디렉터리를 추가하는 방식이 구조적으로 막혀 있지 않다.
- `/functions/post.js`(또는 `/functions/post/index.js`) 형태로 파일을 추가하면 `GET /post` 요청을 정적 `post.html` 대신 Function이 가로챌 수 있다 — Pages Functions의 표준 파일 기반 라우팅 규칙이다.
- Function 런타임(Cloudflare Workers)은 표준 `fetch()`를 전역으로 지원하므로, Supabase에 대한 조회를 **PostgREST HTTP API를 `fetch()`로 직접 호출**하는 방식이면 별도 라이브러리(`@supabase/supabase-js` 등) 설치 없이 구현 가능하다 — "라이브러리 추가 금지" 제약과 부합.
  - 현재 클라이언트 코드(`auth.js`)는 `https://esm.sh/@supabase/supabase-js@2`를 브라우저 ESM import로 불러온다. 이 방식은 브라우저의 네이티브 ESM 로더에 의존하며, Pages Functions는 배포 시 esbuild로 번들링되므로 원격 URL을 런타임에 그대로 import하는 것이 동일하게 동작한다는 보장이 없다(별도 검증 필요, §7). 이 때문에 Function에서는 SDK import보다 REST 직접 호출이 더 안전한 선택지로 판단된다.

**판정: 적용 가능성 — 가능성 높음.** 구조적 장애물(예: `_worker.js`로 인한 Functions 비활성 등)은 발견되지 않았다. 다만 실제 배포 전 Cloudflare 대시보드/CLI로 Functions 활성 여부와 런타임 호환성을 확인해야 확정할 수 있다(§8).

**Check**
- `wrangler pages dev`(또는 대시보드)로 실제 이 프로젝트에서 `/functions` 배포가 인식되는지 확인.
- esm.sh 등 원격 ESM import가 Pages Functions 빌드에서 허용되는지, 혹은 REST 직접 호출만 가능한지 실제 빌드 로그로 확인.

---

## 3. 수정 대상 파일 (도입 시 예상)

| 구분 | 파일 | 성격 |
|---|---|---|
| 신규 | `functions/post.js` (예시 경로) | `/post` GET 요청을 가로채 메타데이터(및 선택적으로 본문)를 서버에서 주입 |
| 참조(읽기 전용 템플릿) | `post.html` | Function이 이 파일의 HTML을 문자열 템플릿으로 읽어와 `<title>`/OG/canonical/(선택)본문 부분만 치환 — 정적 배포용 `post.html` 자체는 그대로 유지 가능 |
| 참조 | `posts.js` | `fetchPostBySlug`의 select 컬럼 목록·조건을 Function 쪽 REST 쿼리에서 동일하게 재현하기 위한 참조 |
| 참조 | `supabase-config.js`, `auth.js` | 현재 anon key/URL이 정의된 위치 확인용 — Function에서는 이 값을 환경변수로 별도 주입하는 편을 권장(§4) |
| 미변경 | `write.html`, `category.html`, `index.html`, 댓글/인증 관련 코드 전체 | 요구사항상 "기존 URL과 작성 기능을 변경하지 말 것" — Function은 GET `/post` 렌더링에만 관여하고 글쓰기/댓글/인증 흐름은 그대로 클라이언트 JS가 담당 |

**Hypothesis**
- `post.html`을 Function 안에서 "템플릿으로 재사용"하는 구체적 방법은 두 가지가 있을 수 있다: (a) 빌드 시점에 `post.html` 내용을 문자열로 임베드, (b) Function이 런타임에 자기 자신의 정적 자산(`env.ASSETS.fetch()`)을 통해 `post.html` 원본을 가져와 문자열 치환. Pages Functions는 `env.ASSETS` 바인딩으로 정적 자산에 접근할 수 있는 것으로 알려져 있으나, 이 프로젝트에서 별도 설정 없이 기본 제공되는지는 Check 대상이다.

**Check**
- `env.ASSETS.fetch(request)` 바인딩이 이 Pages 프로젝트에서 별도 설정 없이 사용 가능한지 Cloudflare 문서/대시보드로 확인.

---

## 4. 필요한 환경변수

**Fact (현재 상태)**
- 현재 Supabase 접속 정보는 환경변수가 아니라 `supabase-config.js`에 하드코딩된 JS 상수 2개(URL, anon/publishable key)로 관리된다. `.env` 계열 파일은 저장소에 없다(이전 조사에서 확인).
- anon key는 Supabase의 "publishable key"(`sb_publishable_...` 접두어) 체계로, 클라이언트에 공개되는 것이 설계상 정상인 키다. 값 자체는 본 문서에 기록하지 않는다.

**설계 권장 (실행 안 함, 제안만)**
| 변수명(예시) | 용도 | 비고 |
|---|---|---|
| `SUPABASE_URL` | PostgREST 엔드포인트 베이스 URL | 현재 `supabase-config.js`의 값과 동일한 것을 Cloudflare Pages 프로젝트의 환경변수로 등록 |
| `SUPABASE_ANON_KEY` | PostgREST 요청 `apikey`/`Authorization` 헤더용 | 이미 공개돼도 무방한 publishable key이지만, 코드 중복(클라이언트/Function 이원화)을 피하려면 환경변수로 일원 관리 권장 |

**Hypothesis**
- anon key가 공개 전제 키이므로 굳이 환경변수로 옮기지 않고 `supabase-config.js`의 값을 Function에서도 재사용(같은 리터럴을 복붙)하는 것도 기능적으로는 가능하다. 다만 값이 두 곳에 흩어지면 키 로테이션 시 누락 위험이 있어 환경변수 일원화가 더 안전한 설계로 판단된다 — 최종 선택은 사용자 결정 사항.

**Check**
- Cloudflare Pages 프로젝트 설정(대시보드 → Settings → Environment variables)에 이미 등록된 변수가 있는지 확인(로컬 저장소로는 확인 불가).

---

## 5. 요청 처리 흐름 (제안, 미구현)

```
Googlebot/사용자 브라우저
   │  GET /post?slug=xxxx
   ▼
Cloudflare Pages
   │  1) /functions/post.js 존재 → 정적 post.html보다 우선 매칭 (Fact: Pages Functions 라우팅 규칙)
   ▼
functions/post.js (Workers 런타임)
   │  2) URL에서 slug 파라미터 파싱
   │  3) fetch()로 Supabase PostgREST 호출
   │     GET {SUPABASE_URL}/rest/v1/posts
   │       ?select=title,content,published_at,categories(name,code),profiles(display_name)
   │       &slug=eq.<slug>&status=eq.published
   │     헤더: apikey, Authorization: Bearer <anon key>
   │  4-a) 게시글 없음/조회 실패 → env.ASSETS.fetch(request)로 기존 정적 post.html을 그대로 반환
   │       (기존 "글을 찾을 수 없습니다" 클라이언트 흐름 그대로 유지 — 동작 변경 없음)
   │  4-b) 게시글 있음 → env.ASSETS.fetch()로 원본 post.html 텍스트를 가져와
   │       <title>, meta description/OG, <link rel="canonical"> 자리표시자를 문자열 치환
   │       (선택) #post-content 스켈레톤 자리에 서버 렌더링 본문 삽입
   │  5) 치환된 HTML을 text/html로 응답 (기존 <script type="module"> 블록은 그대로 두어
   │     브라우저에서 posts.js가 재조회 후 동일 데이터로 하이드레이션하도록 유지)
   ▼
클라이언트에는 최초 응답부터 실제 title/description/OG/canonical(및 선택적으로 본문)이 포함됨
```

**Hypothesis**
- 위 흐름은 표준 Cloudflare Pages Functions 패턴에 기반한 설계 제안이며, 이 저장소에서 실제로 동작함이 검증된 것은 아니다(§8 참고).
- 기존 `post.html`의 클라이언트 스크립트가 `DOMContentLoaded` 시 `#post-content`를 항상 새로 렌더링하므로(§7 위험 참고), 서버가 본문까지 채워 넣더라도 클라이언트 JS가 즉시 덮어쓴다 — 메타데이터(§6)만 서버 렌더링하는 범위에서는 이 문제가 없다.

---

## 6. 1단계 최소 구현안 — 메타데이터만 서버 렌더링

**범위**
- `<title>`, `<meta name="description">`, `og:title`, `og:description`, `og:url`, `<link rel="canonical">` 6개 태그만 slug 조회 결과로 치환.
- `#post-content`(본문 스켈레톤)와 하단 `<script>` 블록은 기존 그대로 유지 — 클라이언트 렌더링/댓글/인증/수정 기능은 전혀 손대지 않는다. 요구사항의 "기존 URL과 작성 기능을 변경하지 말 것"을 가장 보수적으로 만족.
- 게시글을 못 찾으면 원본 정적 파일을 그대로 반환해 현재 "글을 찾을 수 없습니다" UX를 유지.

**필요 Supabase 조회 (Fact, `posts.js:69-79` 기준)**
- 테이블: `posts` (조인: `categories(name, code)`, `profiles(display_name)`)
- 조건: `slug = eq.<slug>` AND `status = eq.published`
- 필드: `id, author_id, slug, title, content, published_at, categories(name, code), profiles(display_name)` — 메타데이터 전용이면 `content`는 요약(예: 앞 100자)만 필요, `id/author_id`는 불필요.

**장점**
- 변경 범위가 좁아 회귀 위험이 가장 낮다.
- 검색엔진/링크 미리보기 봇이 최초 응답만으로 정확한 title/description/OG/canonical을 얻는다 — SEO 문제(§A)의 핵심을 해결.
- 기존 댓글/좋아요/수정/삭제/글쓰기 흐름은 100% 클라이언트 JS 그대로 유지.

---

## 7. 본문까지 서버 렌더링할 경우 추가 범위

**추가 작업**
- `post.html`의 `#post-content` 스켈레톤 자리를 `renderPost()`와 동등한 HTML(제목 `<h1>`, 메타 `<p>`, 본문 단락 `<p>`들)로 서버에서 직접 생성해 삽입해야 한다.
- `posts.js`의 `renderPost()`가 하는 단락 분리 로직(`content.split(/\n{2,}/)`, 줄바꿈 → `<br>`)을 Function 쪽에서도 동일하게 재현해야 서버 렌더링 결과와 클라이언트 재렌더링 결과가 시각적으로 일치한다(로직 중복 — 유지보수 부담 증가).

**위험(추가)**
- 현재 `post.html`의 클라이언트 스크립트는 `DOMContentLoaded` 시 무조건 `container.innerHTML = ""` 후 새로 렌더링한다(`post.html:271-272`) — 서버가 본문을 채워 넣어도 브라우저 로드 후 곧바로 지워지고 동일 내용으로 다시 그려진다. 기능적 오류는 아니지만 ①불필요한 재렌더링/레이아웃 이동(깜빡임) ②서버 렌더링의 SEO 효과 외에 사용자 체감 이득은 없음(Googlebot/미리보기 봇에게만 의미) ③서버·클라이언트 렌더링 결과가 어긋나면(예: 이스케이프 방식 차이) 짧게라도 다른 내용이 노출될 수 있음.
- 댓글 섹션은 인증 상태에 따라 폼이 달라지므로(로그인 여부, 작성자/관리자 권한) 서버 렌더링 대상에서 제외하는 것이 안전 — 본 설계에서도 댓글은 계속 클라이언트 전용으로 유지 권장.

**판단**
- 요구사항의 "메타데이터만 서버 렌더링하는 최소 구현"(§6)이 SEO 목표 대비 위험/복잡도가 가장 낮다. 본문까지 서버 렌더링은 클라이언트 재렌더링 로직과의 중복·불일치 관리 비용이 커서 2단계 이후 별도 검토를 권장.

---

## 8. 예상 위험

### 보안
- **Fact**: 게시글 제목/본문은 `write.html`을 통해 `writer`/`admin` 역할 사용자가 작성한다(불특정 익명 UGC는 아님). 그러나 값이 최종적으로 HTML `<title>`/`<meta>`/본문 영역에 **문자열 치환**으로 삽입되므로, 제목이나 본문에 `</title>`, `<script>`, `"` 등이 포함되면 이스케이프 없이 삽입 시 HTML 삽입/변조(저장형 XSS 유사) 위험이 있다.
  - **최소 구현안(§6) 범위**: `<title>`, `<meta content="...">`, `<link href="...">`에 들어가는 값에 대해 최소한 `&`, `<`, `>`, `"`, `'` 5개 문자를 HTML 엔티티로 이스케이프하는 처리가 필수.
  - **본문까지 렌더링(§7) 범위**: 본문 텍스트를 `<p>` 태그로 감쌀 때도 동일하게 이스케이프해야 하며, 현재 클라이언트 `renderPost()`는 `document.createTextNode()`를 사용해 자동으로 이스케이프되므로(Fact, `post.html:301`) Function 쪽 문자열 치환 구현도 이와 동등한 안전성을 확보해야 한다.
- **Fact**: anon key는 publishable 키 체계이며 이미 클라이언트 코드에 공개돼 있으므로, Function에서 동일 키를 사용해도 새로운 노출 범위 확대는 아니다. 단, RLS(행 수준 보안) 정책이 `status = 'published'` 게시글만 anon 조회를 허용하는 구조에 의존하므로, Function 쪽 쿼리도 반드시 `status=eq.published` 조건을 포함해야 미공개 초안이 노출되지 않는다(§6에 명시 반영됨).

### 캐시
- **Hypothesis**: Function 응답은 Cloudflare의 기본 정적 자산 캐시 정책과 다르게 동작할 가능성이 높다(동적 콘텐츠이므로 기본적으로 캐시되지 않거나 매 요청 Supabase를 호출할 수 있음) — 트래픽이 늘면 Supabase 요청량 증가. `Cache-Control`/Cloudflare Cache API로 slug별 응답을 일정 시간 캐시하는 전략이 필요할 수 있으나 캐시 무효화 시점(게시글 수정/삭제 시)을 어떻게 다룰지는 별도 설계가 필요.
- **Check**: 이 프로젝트의 Cloudflare 캐시 규칙(Page Rules/Cache Rules)이 동적 응답에 어떤 기본값을 적용하는지 대시보드 확인 필요.

### 기타
- **Hypothesis**: esm.sh 원격 ESM import가 Functions 빌드에서 그대로 동작하지 않을 경우, PostgREST를 `fetch()`로 직접 호출하는 방식(§2, §5에 이미 반영)으로 우회 가능 — 이 경로를 기본안으로 잡아두면 이 위험은 사실상 회피된다.
- **Fact**: 요구사항상 라이브러리 추가가 금지되어 있어, Supabase JS SDK를 Functions용으로 별도 설치하는 선택지는 애초에 배제했다(REST 직접 호출안으로 대체).

---

## 9. 로컬 및 배포 검증 방법 (실행 안 함, 절차만 제시)

1. **로컬**: `wrangler pages dev .`(프로젝트에 Wrangler CLI가 사전 설치되어 있어야 함 — 신규 설치는 "패키지 추가 금지"에 해당하므로 이미 설치돼 있는지 먼저 확인)로 로컬에서 `/functions`가 인식되는지, `GET /post?slug=<실 존재 slug>` 응답의 `<title>`/OG/canonical이 치환되는지 확인.
2. **로컬 REST 호출 검증**: 동일 환경에서 `curl "{SUPABASE_URL}/rest/v1/posts?select=title,slug&slug=eq.<slug>&status=eq.published" -H "apikey: ..." -H "Authorization: Bearer ..."`로 PostgREST 응답 형식을 사전 확인(값은 로컬 터미널에서만 사용, 문서에 기록하지 않음).
3. **스테이징/프리뷰 배포**: Cloudflare Pages의 Preview 배포(브랜치 배포)를 이용해 프로덕션에 영향 없이 `/post?slug=...` 응답을 실제로 확인 — 이번 작업 범위에는 배포 자체가 포함되지 않으므로 사용자가 별도로 진행.
4. **배포 후 확인**: `curl -s https://lucajournal.com/post?slug=<slug>` 후 `<title>`/`og:title`/`canonical`이 요청한 slug의 실제 게시글과 일치하는지, 존재하지 않는 slug에 대해 기존과 동일하게 "글을 찾을 수 없습니다" 흐름이 유지되는지 확인.
5. **Search Console**: URL 검사 도구로 대표 게시글 URL의 "실제 가져오기"(라이브 테스트) 결과에서 렌더링된 HTML에 제목/설명이 즉시 나타나는지 확인.

---

## 요약 표: Fact / Hypothesis / Check

| 구분 | 개수 | 핵심 항목 |
|---|---|---|
| Fact | 다수 | functions 디렉터리 부재, `_worker.js` 부재, `/post` clean URL 200 응답, posts 테이블 스키마, anon key가 publishable 키 체계임 |
| Hypothesis | 다수 | esm.sh 원격 import의 Functions 빌드 호환성, `env.ASSETS` 바인딩 기본 제공 여부, 캐시 기본 동작 |
| Check | 다수 | Cloudflare 대시보드의 Functions 활성 이력·호환성 플래그·캐시 규칙, Wrangler CLI 설치 여부, 환경변수 등록 여부 |
