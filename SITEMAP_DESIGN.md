# LucaJournal 게시글 sitemap 자동 생성 — 설계 분석

조사 범위: `sitemap.xml`, `functions/` 디렉터리, Supabase `posts`/`categories` 테이블(REST API 조회), 현재 Cloudflare Pages 배포 구조.
본 문서는 설계 검토용 분석 보고서이며 코드를 수정하거나 배포하지 않았다.

`functions/post.js`(게시글 메타데이터 SSR)가 이미 배포되어 정상 동작 중임을 이전 세션에서 확인했다. 이번 분석은 그와 동일한 패턴(Pages Function + Supabase REST + `env.ASSETS` fallback)을 sitemap에도 적용할 수 있는지를 검토한다.

---

## 1. 추천 방식

**Fact**
- 현재 `sitemap.xml`(로컬/배포 동일, 772바이트, `Content-Type: application/xml`)은 손으로 작성된 정적 파일이며 정적 페이지 6개(`/`, `/about`, `/category?code=DAILY|PERSPECTIVE|HERITAGE|APOLOGETICS|NOTICE`)만 포함한다. 게시글 URL은 0건.
- `functions/` 디렉터리에는 현재 `post.js` 1개만 존재한다. `_worker.js`는 없다(이전 조사에서 확인) — Pages Functions가 정적 자산보다 우선 매칭되는 구조가 이미 실제로 검증됨(`/post`가 `post.js`에 의해 가로채짐).
- Supabase `posts` 테이블에 anon key로 조회 시 `status=eq.draft` 필터를 걸어도 결과가 0건으로 돌아온다(RLS가 비공개 글을 anon 접근에서 원천 차단) — 실측 확인. 즉 anon key + `status=eq.published` 조건이면 안전하게 공개 게시글만 조회된다.
- 현재 published 게시글은 65건(Supabase REST `Content-Range` 헤더로 확인), 평균 slug 길이는 20자 내외.

**추천**: `functions/post.js`와 동일한 패턴으로 `functions/sitemap.xml.js`를 추가해 `GET /sitemap.xml` 요청을 가로채고, 정적 페이지 URL 목록(하드코딩) + Supabase REST로 조회한 공개 게시글 URL을 합쳐 XML을 동적 생성한다. 실패 시 기존 정적 `sitemap.xml`을 그대로 반환하는 fallback을 둔다(§6).

**Hypothesis**
- Cloudflare Pages Functions는 파일명에 확장자를 포함해 그대로 라우팅에 매핑하는 것으로 알려져 있어(`functions/sitemap.xml.js` → `/sitemap.xml`), `post.js`(확장자 없는 `/post` 매핑)와 마찬가지로 동작할 것으로 예상되나, 이 프로젝트에서 확장자 포함 경로의 Functions 매핑이 실제로 성립하는지는 배포 전 별도 확인이 필요하다(§8).

**Check**
- `functions/sitemap.xml.js`라는 파일명이 Cloudflare Pages 빌드에서 문제없이 인식되는지(마침표가 포함된 파일명 처리) 실제 프리뷰 배포로 확인 필요.

---

## 2. 수정 예상 파일

| 구분 | 파일 | 비고 |
|---|---|---|
| 신규 | `functions/sitemap.xml.js` | `/sitemap.xml` 요청을 가로채 동적 XML 생성 |
| 미변경(fallback 원본) | `sitemap.xml` | 삭제/수정하지 않고 그대로 유지 — Function 오류 시 `env.ASSETS.fetch()`로 이 파일을 그대로 반환하는 fallback 대상으로 계속 사용 |
| 미변경 | `robots.txt` | `Sitemap: https://lucajournal.com/sitemap.xml` 선언은 URL 형태가 그대로이므로 변경 불필요 |
| 미변경 | `functions/post.js` | 참고용 패턴 재사용 대상, 직접 수정 없음 |
| 참조 | `posts.js`, `supabase-config.js` | 필드명/URL 확인용 참조, 변경 없음 |

---

## 3. 필요한 게시글 필드

**Fact (Supabase REST 실측 응답 기준)**
`posts` 테이블 컬럼: `id, category_id, author_id, title, slug, content, excerpt, thumbnail_url, status, source, published_at, created_at, updated_at`.

sitemap 생성에는 이 중 최소 2개 필드만 필요하다.

| 필드 | 용도 |
|---|---|
| `slug` | URL 생성: `https://lucajournal.com/post?slug=<slug>` |
| `updated_at` (또는 `published_at`) | `<lastmod>` |

**정렬 기준**: `published_at desc` — `functions/post.js`가 참조하는 `posts.js`의 기존 조회 패턴(`fetchRecentPosts`, `fetchPostsByCategory`)과 동일한 기준을 따르는 것이 일관적이다. sitemap 자체의 URL 순서는 검색엔진 색인에 실질적 영향은 없지만, 최신 글이 상단에 오면 사람이 diff/점검하기 쉽다.

**Hypothesis**
- `updated_at`이 `lastmod`로 더 정확하다(글 수정 시 갱신될 것으로 기대되는 필드). 다만 `updatePost()`(`posts.js:184-205`)의 `.update()` 호출에 `updated_at`을 명시적으로 세팅하는 코드가 없어, DB 트리거로 자동 갱신되는지 애플리케이션 코드만으로는 확정할 수 없다. 신규 게시글 3건을 실측한 결과 `published_at`과 `updated_at`이 거의 동일한 값이었다(생성 시점 일치는 당연하며, 수정 시 갱신 여부는 별도 확인 필요).

**Check**
- Supabase 대시보드에서 `posts.updated_at`에 `BEFORE UPDATE` 트리거(자동 갱신)가 걸려 있는지 확인. 없다면 `published_at`을 `lastmod`로 쓰는 편이 더 신뢰할 수 있다.

---

## 4. 공개 게시글 필터

**Fact**
- 쿼리 조건: `status=eq.published` — anon key 사용 시 이미 RLS가 draft를 차단하므로(§1 Fact) 이 필터는 "이중 안전장치" 성격이나, 쿼리 자체의 의도를 명시하기 위해 반드시 포함해야 한다.
- `service_role` 키는 저장소 어디에도 등장하지 않으며(`.env`, `supabase-config.js`, `functions/post.js` 모두 anon/publishable key만 사용), sitemap Function도 동일하게 **anon key만 사용**하면 요구사항("service_role 키 사용 금지")을 자연스럽게 만족한다. `env.SUPABASE_ANON_KEY`는 이미 Cloudflare 프로덕션 환경변수로 등록되어 `post.js`가 사용 중임을 이전 세션에서 확인했다 — sitemap Function도 같은 환경변수를 재사용하면 된다(신규 환경변수 불필요).

**Check 불필요 (이미 실측 확인됨)**: RLS의 draft 차단 동작은 이번 조사에서 직접 curl로 검증된 Fact다.

---

## 5. XML 생성 흐름 (제안, 미구현)

```
GET /sitemap.xml
   │  functions/sitemap.xml.js가 정적 sitemap.xml보다 우선 매칭
   ▼
1) 정적 URL 목록(하드코딩, 예: "/", "/about", "/category?code=DAILY" 등)을
   XML <url> 항목으로 조립 — 기존 sitemap.xml 내용과 동일한 lastmod 정책 유지
   (현재 정적 sitemap.xml에는 카테고리 6개 중 CULTURE가 누락되어 있음 — Fact,
    categories 테이블에는 is_active=true인 CULTURE가 존재. 재구현 시 정적 목록을
    하드코딩할지, categories 테이블에서 is_active=true를 동적 조회할지는 설계 선택.
    동적 조회 쪽이 카테고리 추가/비활성화 시 자동 반영되어 더 견고함)
2) Supabase REST 호출
   GET {SUPABASE_URL}/rest/v1/posts
     ?select=slug,updated_at&status=eq.published&order=published_at.desc
   헤더: apikey, Authorization: Bearer <anon key>
3) 응답 각 행을 <url><loc>https://lucajournal.com/post?slug=<slug 이스케이프></loc>
   <lastmod><updated_at를 YYYY-MM-DD로 절삭></lastmod></url>로 변환
   (slug는 posts 테이블 자체 생성 규칙상 영숫자+하이픈만 가능하므로 XML 이스케이프
    위험은 낮지만, title 등 다른 필드를 절대 sitemap에 노출하지 않는 것으로 위험 원천 차단)
4) 정적 URL + 게시글 URL을 하나의 <urlset>으로 합쳐 문자열 조립
5) Content-Type: application/xml 로 응답
```

**Hypothesis**
- 65건 기준으로 XML 크기는 대략 6개 정적 URL(772바이트 현재) + 게시글 65건 × 약 110바이트(loc+lastmod 태그 포함 추정) ≈ 7~8KB 수준으로, sitemap 표준 제한(50,000 URL / 50MB)에 비하면 매우 작다.

**Check**
- 실제 배포 후 `curl -s https://lucajournal.com/sitemap.xml | wc -c`로 실측 크기 확인 권장(이번 세션에서는 미구현이므로 측정 불가).

---

## 6. fallback 방식

**Fact**
- `functions/post.js`가 이미 이 패턴을 구현해 실제로 정상 동작 중임을 확인했다: `fetchStaticPost()`가 `env.ASSETS.fetch()`로 정적 자산을 먼저 받아두고, Supabase 조회/가공이 실패하면(`catch` 블록) 가공 전 정적 응답을 그대로 반환한다.
- sitemap Function도 동일하게 설계 가능: `env.ASSETS.fetch()`로 **정적 `sitemap.xml` 원본**을 먼저 가져와 두고, Supabase REST 호출이 실패(네트워크 오류, non-2xx, 타임아웃)하면 그 정적 응답을 그대로 반환한다. 즉 "게시글 URL이 없는 예전 sitemap"으로 자동 강등될 뿐, 사이트가 500을 반환하거나 sitemap이 아예 사라지는 상황은 방지된다.

**최소 구현 방향**
- `try { ...Supabase 조회 및 XML 조립... } catch { return env.ASSETS.fetch(정적 sitemap.xml 요청) }` 구조 — `post.js`의 `onRequestGet` 구조를 그대로 따르면 된다.
- Supabase가 응답은 하지만 빈 배열을 반환하는 경우(장애는 아니지만 게시글 0건)에도 정적 URL만으로 유효한 sitemap이 생성되므로 별도 예외 처리가 필요 없다.

---

## 7. 캐시 권장값

**Fact**
- 현재 정적 `sitemap.xml`의 실측 응답 헤더는 `cache-control: public, max-age=0, must-revalidate`(다른 정적 페이지와 동일한 Cloudflare Pages 기본값)이며 `etag`도 부여되어 있다.
- 검색엔진은 sitemap을 실시간으로 폴링하지 않고 주기적으로(통상 시간~일 단위) 재요청하므로, 매 요청마다 Supabase를 조회할 필요가 없다.

**권장(제안, 미적용)**
- Function 응답에 `Cache-Control: public, max-age=3600`(1시간) 수준을 명시적으로 설정하는 것을 권장. 새 글이 발행돼도 최대 1시간 지연으로 sitemap에 반영되는 정도는 sitemap 용도상 충분히 허용 가능한 수준이며, Supabase 요청량을 크게 줄인다.
- 별도 KV/캐시 라이브러리 없이 응답 헤더만으로 Cloudflare 엣지 캐시를 활용할 수 있어 "라이브러리 추가 금지" 제약과 부합한다.
- 65건 규모에서는 캐시 없이도 매 요청 Supabase 1회 조회 정도는 부담이 크지 않으나, 게시글 수가 수백~수천 건으로 늘어나거나 sitemap 크롤링 빈도가 높아질 경우를 대비해 캐시 헤더를 처음부터 넣어두는 편이 안전하다.

**Hypothesis**
- `max-age=3600`은 제안값이며, 실제 발행 빈도(현재 다건 동시 발행 패턴 관찰됨 — 같은 날 여러 slug가 수 초~수십 초 간격으로 발행됨)를 고려하면 더 짧은 캐시(예: 600초)가 적절할 수도 있다. 최종 값은 운영 트래픽/발행 빈도를 보고 조정 권장.

**Check**
- Cloudflare 프로젝트의 Cache Rules/Page Rules가 `/sitemap.xml`에 대해 별도 규칙을 이미 갖고 있는지(있다면 Function의 `Cache-Control` 헤더와 충돌할 수 있음) 대시보드 확인 필요.

---

## 8. 운영 검증 방법 (실행 안 함, 절차만 제시)

1. **배포 직후 상태 확인**: `curl -s -D - https://lucajournal.com/sitemap.xml`로 `HTTP 200`, `content-type: application/xml`(또는 `text/xml`) 확인.
2. **URL 개수/정합성 확인**: 응답 본문의 `<url>` 개수가 "정적 페이지 수 + Supabase published 게시글 수"와 일치하는지 확인 (`grep -c "<loc>"`). 이번 조사 시점 기준 published 65건이므로, 정적 6~7건(카테고리 CULTURE 포함 여부에 따라) + 65건 = 71~72건 내외가 기대값.
3. **비공개 글 미노출 확인**: 임의의 draft 게시글 slug(있다면)가 sitemap 응답에 절대 나타나지 않는지 확인. anon key RLS가 이미 이를 원천 차단하므로 이론상 불가능하나, 배포 후 실측으로 재확인 권장.
4. **fallback 동작 확인**: 정상적인 curl만으로는 Supabase 장애를 재현할 수 없으므로, 프리뷰 배포 환경에서 일시적으로 잘못된 `SUPABASE_URL` 환경변수를 넣어 Function이 예외 상황에서도 200 + 기존 정적 sitemap 내용을 반환하는지 확인(프로덕션 환경변수는 건드리지 않음).
5. **robots.txt 정합성**: `robots.txt`의 `Sitemap:` URL이 여전히 유효한 200 응답을 가리키는지 재확인(URL 형태 자체는 변경되지 않으므로 회귀 위험 낮음).
6. **Search Console**: sitemap 재제출 후 "제출된 URL 수"와 "색인된 URL 수" 추이를 모니터링. 게시글 URL이 처음으로 sitemap에 잡히는 시점부터 색인 진행 상황 관찰.

---

## 요약: Fact / Hypothesis / Check

| 구분 | 핵심 내용 |
|---|---|
| Fact | 정적 sitemap.xml에 게시글 0건·CULTURE 카테고리 누락, anon key로는 draft 게시글 조회 자체가 RLS로 차단됨, `post.js`에 이미 검증된 Function+ASSETS fallback 패턴 존재, published 65건, posts 테이블 필드 목록 |
| Hypothesis | `functions/sitemap.xml.js`라는 확장자 포함 파일명이 그대로 라우팅되는지, `updated_at`이 수정 시 자동 갱신되는지, 캐시 `max-age` 적정값 |
| Check | 확장자 포함 Functions 라우팅의 실제 배포 검증, `updated_at` 트리거 존재 여부, 기존 Cache Rules와의 충돌 여부, 배포 후 URL 개수 실측 |
