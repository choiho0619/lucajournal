# LucaJournal SEO / 렌더링 / URL 구조 분석

조사 범위: `/Users/hoya-macmini/lucajournal` 저장소 전체(정적 HTML, 빌드 도구 없음) + `https://lucajournal.com` 실제 응답.
본 문서는 분석 전용이며 코드/설정을 변경하지 않았다 (`git status` 상 신규 파일 없음, 기존 파일 무변경 — 본 문서 저장 전 기준).

이전 조사(`SEARCH_CONSOLE_REDIRECT_ANALYSIS.md`) 이후 `d3b13a7`(sitemap/canonical 확장자 정리), `40b16e5`(category.html의 잘못된 동적 canonical 제거) 커밋이 반영된 **현재 상태** 기준이다.

---

## 1. Fact

### 콘텐츠 렌더링
- `index.html`의 "최근 글" 목록은 최초 HTML에 없다. `<div id="recent-posts-list">`에는 skeleton placeholder만 있고, 실제 목록은 `posts.js`의 `fetchRecentPosts()`(Supabase 쿼리)가 `DOMContentLoaded` 이후 완료돼야 `renderRecentPosts()`로 채워진다. (`index.html:257-261`, `index.html:274-281`)
- `category.html`의 카테고리명/설명/게시글 목록도 전량 client-side: `DOMContentLoaded` 핸들러에서 Supabase `categories`/`posts` 테이블을 fetch한 뒤 DOM에 주입한다. 최초 HTML에는 빈 컨테이너와 skeleton만 존재. (`category.html:233-286`)
- `post.html`의 본문(`#post-content`)도 최초 HTML에는 skeleton만 있고, `fetchPostBySlug(slug)` 완료 후 `renderPost()`가 `container.innerHTML`을 채운다. (`post.html:226-233`, `post.html:725-748`)
- 위 세 페이지 모두 `supabase-config.js`의 공개 anon key로 브라우저에서 직접 Supabase에 질의한다 — 서버 렌더링/사전 렌더링 단계가 없다(빌드 스크립트, `package.json`, 프레임워크 부재 확인됨).

### 메타데이터 / canonical
- `post.html`은 모든 게시글(slug)에 대해 동일한 `<title>`, `og:title`, `og:description`, `og:url`(`https://lucajournal.com/post.html`)을 사용한다. `document.title`을 개별 게시글에 맞게 바꾸는 코드가 없다(`post.html`, `posts.js` 전체에서 `document.title` 참조 0건).
- `post.html`에는 `<link rel="canonical">` 자체가 없다(로컬 파일 grep 결과 0건).
- `category.html`에도 현재 `<link rel="canonical">`가 없다. 이전에 있던 동적 canonical(`id="canonical-url"`, JS로 href 주입)은 `href` 속성이 없는 상태로 배포되어 있어 `40b16e5` 커밋에서 완전히 제거되었다.
- `about.html`, `index.html`은 정적 `<link rel="canonical">`을 갖고 있으며 실제 배포 URL과 일치함을 확인했다 (`curl` 재검증: `/about` → `href="https://lucajournal.com/about"`, `/` → `href="https://lucajournal.com/"`).

### sitemap
- `sitemap.xml`(로컬/배포 동일, 6개 URL)에는 정적 페이지(`/`, `/about`, `/category?code=*` 5종)만 있고 **게시글 URL은 하나도 없다**. `post.html?slug=...` 패턴 자체가 sitemap 생성 대상에 포함되어 있지 않다.
- sitemap을 만드는 빌드 스크립트/생성 코드가 없다 — 손으로 작성한 정적 파일이며, 게시글이 Supabase에 추가돼도 sitemap은 자동 갱신되지 않는다.

### URL 구조 / 내부 링크
- 배포 서버는 `.html` 확장자 URL과 trailing slash를 308로 확장자 없는 URL로 정규화한다 (이전 조사에서 확인, 이번에도 `/category.html?code=DAILY` → 308 → `/category?code=DAILY` 재확인됨).
- 그런데 **저장소 내 모든 페이지의 내부 링크(네비게이션, 로고, "다른 카테고리", "목록으로" 등)는 여전히 `.html` 확장자를 사용**한다. 예: `<a class="brand" href="index.html">`, `<li><a href="category.html?code=DAILY">`, `<a href="about.html">`가 11개 HTML 파일 전부에 동일하게 존재. `post.html:752`의 "목록으로" 링크도 `category.html?code=...`로 생성됨.
- 즉 sitemap/canonical은 확장자 없는 URL(`/about`, `/category?code=X`)을 정규 URL로 선언하지만, 사이트 자체의 모든 내부 이동은 여전히 리디렉션을 유발하는 `.html` URL을 클릭하게 된다.
- `https://www.lucajournal.com/`, `https://www.lucajournal.com/about`은 non-www로 리디렉션되지 않고 그대로 200을 반환한다 (재확인됨). www/non-www 통합 규칙이 없다.

### 메뉴/푸터 일관성
- 11개 HTML 파일(`index`, `post`, `category`, `about`, `privacy`, `terms`, `shop`, `mypage`, `confirm`, `write`, `unsubscribe`) 전부에서 `nav-links` 목록과 `footer.site-footer` 블록이 **완전히 동일**함을 확인했다(문자열 비교). 페이지마다 메뉴/푸터가 다른 문제는 없다.

### 구조화 데이터 / 접근성
- 저장소 전체에서 `application/ld+json`(구조화 데이터)이 **하나도 없다**. Article, BreadcrumbList 등 스키마 마크업 없음.
- 모든 페이지에 `<html lang="ko">`, `<meta name="viewport" content="width=device-width, initial-scale=1">`가 있다 — 기본 모바일/언어 설정은 정상.
- 모바일 네비게이션 토글에는 `aria-label`, `aria-expanded`, `aria-controls`가 정상 부여되어 있다.
- 저장소 내 `<img>` 태그는 없고, 이미지는 JS로 생성된다. `shop.html`이 만드는 상품 이미지(`shop-products.js`)는 `img.alt = p.name`으로 alt를 채운다 — 확인된 범위에서 이미지 접근성 문제는 없음.
- 색 대비, 키보드 포커스 스타일, 스크린리더 랜드마크(`<main>`은 존재, `<nav>`도 존재) 등은 자동 도구 없이 육안 코드 검토만으로는 확정 판단이 어려워 Hypothesis로 분류함(§9).

---

## 2. 문제점

| # | 문제 |
|---|---|
| A | 게시글 상세 페이지가 검색엔진 기준으로 사실상 "빈 페이지"에 가깝다: 본문이 초기 HTML에 없고, 모든 게시글이 동일한 title/description/OG를 공유하며, canonical 태그가 아예 없고, sitemap에도 게시글 URL이 없다. |
| B | 내부 링크가 여전히 `.html` 확장자 URL을 가리켜, 방금 정리한 sitemap/canonical(확장자 없는 URL)과 실제 클릭 경로가 불일치한다 — 모든 내부 이동이 308 리디렉션을 한 번씩 더 거친다. |
| C | `category.html`에 canonical 태그가 전혀 없다. sitemap에는 `/category?code=*`가 정규 URL로 등록돼 있지만 페이지 자신은 이를 선언하지 않는다. |
| D | index/category 페이지의 핵심 콘텐츠(최근 글, 카테고리 목록)가 client-side Supabase fetch로만 채워져, 초기 HTML만 보는 크롤러/미리보기 봇에는 콘텐츠가 보이지 않는다. |
| E | `www.lucajournal.com`이 non-www로 통합되지 않고 별도로 200 응답 — 동일 콘텐츠가 두 호스트에서 서빙되는 잠재적 중복. |
| F | 구조화 데이터(JSON-LD)가 전무하다 — 검색 결과의 리치 스니펫(기사, 저자, 게시일 등) 기회를 활용하지 못함. |
| G(가설) | 색 대비/포커스 스타일/스크린리더 랜드마크 세부사항은 코드 리뷰만으로 확정할 수 없어 별도 접근성 감사가 필요할 수 있음. |

---

## 3. 영향도

| # | 영향도 | 설명 |
|---|---|---|
| A | **높음** | 저널 사이트의 핵심 콘텐츠(게시글)가 검색엔진에 개별 URL로 색인되기 어렵고, 색인되더라도 모든 게시글이 동일한 제목/설명으로 노출되어 클릭률과 신뢰도에 직접 타격. GSC "리디렉션 포함 페이지" 경고의 재발 소지는 낮지만, "중복 메타데이터"/"콘텐츠 없음" 계열 경고로 이어질 가능성 높음. |
| B | **중간~높음** | 지난 세션에 sitemap/canonical을 정리한 취지(리디렉션 없는 정규 URL 정착)를 내부 링크 구조가 스스로 무력화한다. 크롤 예산 낭비, 페이지 이동마다 불필요한 왕복(사용자 체감 지연은 미미하나 SEO 신호상 비일관). |
| C | **중간** | canonical 부재 시 Google이 쿼리스트링 URL(`/category?code=DAILY`)의 정규 URL을 자체 추정해야 하며, 파라미터가 다른 5개 URL이 서로의 중복으로 잘못 판단될 위험이 있음. |
| D | **중간** | Google은 JS를 실행하는 2차 색인(렌더링) 단계를 거치므로 완전히 색인 불가는 아니나, 렌더링 큐 지연·실패 시 콘텐츠 누락 위험이 있고, JS를 실행하지 않는 카카오톡/트위터 등 링크 미리보기 봇에는 내용이 전혀 안 보임. |
| E | **낮음~중간** | 현재 GSC 경고가 리디렉션 계열이라 직접 원인은 아니지만, 중복 콘텐츠로 인해 정규 URL 판단이 흐트러질 수 있음. |
| F | **낮음** | 색인 자체에는 영향이 적으나 검색 결과 노출 품질(리치 리절트) 기회 손실. |
| G | **불명** | 검증되지 않음 — Lighthouse/axe 등 전용 도구로 별도 확인 필요. |

---

## 4. 수정 대상 파일

| 문제 | 관련 파일 |
|---|---|
| A (게시글 메타/canonical/sitemap) | `post.html`, `posts.js`, `sitemap.xml`(게시글 URL 추가 방식 자체를 재설계해야 함 — 현재는 생성 스크립트가 없음) |
| B (내부 링크 .html 통일) | `index.html`, `post.html`, `category.html`, `about.html`, `privacy.html`, `terms.html`, `shop.html`, `mypage.html`, `confirm.html`, `write.html`, `unsubscribe.html`, `posts.js`(`titleLink.href` 생성부), `category.html`(다른 카테고리 링크 생성부) |
| C (category canonical) | `category.html` |
| D (client-side 렌더링) | `index.html`, `category.html`, `post.html`, `posts.js` — 근본 해결은 사전 렌더링/SSR 도입 수준의 구조 변경이 필요, 현재 저장소엔 빌드 파이프라인이 없음 |
| E (www/non-www) | 저장소 밖(Cloudflare Pages 커스텀 도메인/리디렉션 설정) — 저장소 파일로는 해결 불가 |
| F (구조화 데이터) | `post.html`, `index.html`, `category.html`, `about.html` |

---

## 5. 최소 수정안

> 실행하지 않음. 후속 작업을 위한 권장안만 기록.

- **B (최소, 저위험)**: 11개 HTML 파일과 `posts.js`/`category.html` 내부에서 `href="index.html"` → `href="/"`, `href="about.html"` → `href="/about"`, `href="category.html?code=X"` → `href="/category?code=X"`, `titleLink.href = \`post.html?slug=...\`` → 확장자 없는 형태(단, `post.html`은 Cloudflare가 자동으로 벗겨줄 확장자가 없는 파일이므로 실제로 `.html`이 필요한지 배포 환경에서 먼저 확인 필요)로 일괄 치환. 순수 문자열 치환이라 리스크가 가장 낮음.
- **C (최소)**: `category.html` `<head>`에 정적 canonical 대신, `post.html`처럼 JS에서 `code` 쿼리값을 읽어 `<link id="canonical-url" rel="canonical">` 요소의 `href`를 안전하게 채우되, 지난번처럼 href 없는 상태로 배포되지 않도록 최초 HTML에도 fallback href(`https://lucajournal.com/category`)를 넣어두는 방식 검토.
- **A (구조적)**: 최소 대응으로는 `post.html`에서 slug 조회 성공 시 `document.title`, `og:title`/`og:description`/`og:url`/canonical `<link>` 요소의 값을 JS로 갱신(현재 없는 코드). 다만 이는 "최초 HTML에 없다"는 근본 문제는 해결하지 못하며(크롤러가 JS 실행 전에 보는 값은 여전히 generic) 근본 해결에는 사전 렌더링/정적 생성 도입이 필요 — 이는 이번 보고서 범위를 넘는 별도 프로젝트로 분리 권장.
- **A (sitemap)**: 게시글을 sitemap에 포함하려면 Supabase의 published 게시글 목록을 읽어 sitemap을 생성하는 별도 스크립트/함수가 필요 — 현재 빌드 파이프라인이 없으므로 신규 구성 요소 추가가 불가피(이번 세션의 "패키지 추가 금지/빌드 설정 변경 금지" 범위를 벗어남, 별도 승인 필요).
- **D**: 완전 해결은 SSR/정적 사전 렌더링 도입 수준. 최소 대응으로는 `noscript` 대체 콘텐츠 제공이나, Googlebot 렌더링 신뢰(현재도 동작은 함)에 기대는 현상 유지 중 택일 필요 — 사용자 의사결정 필요 사항으로 분류.
- **E**: 저장소 파일로 해결 불가. Cloudflare Pages 대시보드에서 www→non-www(또는 반대) 301 리디렉션 규칙 추가 필요(별도 확인/승인 필요).
- **F**: `post.html`에 `Article` JSON-LD(제목, 게시일, 저자, 본문 요약), `index.html`/`about.html`에 `Organization`/`WebSite` JSON-LD 추가 검토.

---

## 6. 우선순위

| 순위 | 문제 | 근거 |
|---|---|---|
| 1 | B — 내부 링크 `.html` 통일 | 가장 저위험·저비용이면서, 지난 세션에 완료한 sitemap/canonical 수정 효과를 지금 당장 갉아먹고 있는 상태를 멈춘다. 순수 링크 문자열 치환. |
| 2 | C — category canonical 복구 | 파일 1개, 범위가 좁고 명확하며 sitemap과의 정합성을 바로 개선. |
| 3 | A — 게시글 메타데이터/canonical/sitemap | 영향도가 가장 크지만 구조적 결정(SSR 도입 여부, sitemap 자동 생성 방식)이 필요해 착수 전 사용자 의사결정이 선행돼야 함. |
| 4 | D — client-side 렌더링 의존 | A와 원인이 겹치며, 별도의 아키텍처 프로젝트로 다뤄야 할 사안. |
| 5 | F — 구조화 데이터 추가 | 색인 자체보다 검색 결과 품질 개선 성격이라 우선순위 낮음. |
| 6 | E — www/non-www 통합 | 저장소 밖(Cloudflare 대시보드) 사안이라 이 프로젝트에서 직접 실행 불가, Check 항목으로 별도 관리. |
| — | G — 접근성 세부사항 | 근거 부족, 전용 감사 도구로 별도 확인 필요. |

---

## 7. 첫 번째 추천 작업

**내부 링크의 `.html` 확장자를 sitemap/canonical과 동일한 확장자 없는 형태로 통일**(문제 B)을 가장 먼저 진행할 것을 권장한다.

이유:
- 순수 링크 문자열 치환으로 로직 변경이 없어 회귀 위험이 가장 낮다.
- 지난 세션에 이미 sitemap.xml과 canonical을 확장자 없는 URL로 정리해 둔 상태이므로, 이번 작업은 그 결정을 사이트 전체에 마저 반영하는 자연스러운 후속 단계다.
- 사이트의 모든 페이지 이동에서 불필요한 308 리디렉션을 즉시 제거해, 크롤 신호와 실제 사용자 경로를 일치시킨다.
- 이후 A(게시글 메타데이터/canonical/sitemap)와 같은 더 큰 구조적 작업에 들어가기 전에, 기반이 되는 URL 체계부터 깨끗하게 정리해두는 것이 순서상 합리적이다.
