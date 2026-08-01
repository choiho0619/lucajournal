# LucaJournal Search Console 리디렉션 분석

## 1. 조사 범위

- 조사 대상: `/Users/hoya-macmini/lucajournal` 저장소 전체 (정적 HTML 사이트, 빌드 도구/프레임워크 없음)
- 배포 도메인: `https://lucajournal.com` (Cloudflare, `server: cloudflare` 응답 헤더로 확인)
- 이 문서는 **분석 전용**이며 코드/설정 변경을 포함하지 않는다. 작업 중 파일 수정 없음 (`git status` — clean, 변경 없음).
- SOUL.md / MASTER.md / ROADMAP.md / CHANGELOG.md는 저장소에 존재하지 않아 별도 대조 불가. (`git ls-files` 기준 44개 추적 파일 확인, 해당 문서 없음)

## 2. 프로젝트의 sitemap 생성 방식

- **직접 작성된 정적 파일**이다. 빌드 스크립트, 프레임워크 플러그인, API/서버 함수, 외부 서비스 어느 것도 사용하지 않는다.
- `package.json`, `next.config.*`, `wrangler.toml/json/jsonc`, `_redirects`, `_headers`, `netlify.toml`, `firebase.json`, `vercel.json`, `_worker.js` 등을 저장소 루트에서 검색했으나 **하나도 존재하지 않음**을 확인했다.
- `sitemap.xml`은 최초 커밋(`94dd68e` "파비콘·OG·SEO 메타태그 반영, robots.txt/sitemap.xml 추가", 2026-07-14) 이후 한 번도 수정되지 않았고, 그 이후 저장소에는 `post.html`, `mypage.html`, `write.html` 등 신규 페이지가 추가되었지만 sitemap.xml에는 반영되지 않았다.
- 게시글 상세 페이지(`post.html?slug=...`)는 `posts.js:52`에서 클라이언트 JS로 링크만 생성되며, sitemap.xml에는 **포함되어 있지 않다**.

## 3. 배포된 sitemap 내용 요약

로컬 `sitemap.xml`과 `https://lucajournal.com/sitemap.xml` 실제 응답 내용은 **완전히 동일**함을 확인했다 (HTTP 200).

전체 URL 6개, 분류:

| 분류 | URL | 개수 |
|---|---|---|
| 홈페이지 | `https://lucajournal.com/` | 1 |
| 기타 정적 페이지 | `https://lucajournal.com/about.html` | 1 |
| 카테고리/목록 페이지 | `https://lucajournal.com/category.html?code={DAILY,PERSPECTIVE,HERITAGE,APOLOGETICS,NOTICE}` | 5 |
| 게시글 상세 페이지 | (없음, sitemap 미포함) | 0 |
| 로그인/인증 페이지 | (없음, sitemap 미포함 — `robots.txt`로도 차단) | 0 |

모든 URL이 `https://`, non-www, `index.html` 미포함, trailing slash는 홈페이지에만 존재. 중복 URL 없음.

## 4. URL 리디렉션 검사 결과

curl 명령: `curl -s -D - -o /dev/null "<URL>"` (필요 시 `-I`/`-IL` 병행)

| sitemap URL | 최초 상태코드 | Location | 최종 URL | 최종 상태코드 | sitemap URL = 최종 URL |
|---|---|---|---|---|---|
| `https://lucajournal.com/` | 200 | — | `https://lucajournal.com/` | 200 | 일치 |
| `https://lucajournal.com/about.html` | **308** | `/about` | `https://lucajournal.com/about` | 200 | **불일치** |
| `https://lucajournal.com/category.html?code=DAILY` | **308** | `/category?code=DAILY` | `https://lucajournal.com/category?code=DAILY` | 200 | **불일치** |
| `https://lucajournal.com/category.html?code=PERSPECTIVE` | **308** | `/category?code=PERSPECTIVE` | 〃 | 200 | **불일치** |
| `https://lucajournal.com/category.html?code=HERITAGE` | **308** | `/category?code=HERITAGE` | 〃 | 200 | **불일치** |
| `https://lucajournal.com/category.html?code=APOLOGETICS` | **308** | `/category?code=APOLOGETICS` | 〃 | 200 | **불일치** |
| `https://lucajournal.com/category.html?code=NOTICE` | **308** | `/category?code=NOTICE` | 〃 | 200 | **불일치** |

→ **sitemap에 등록된 6개 URL 중 5개(83%)가 실제로 308 리디렉션을 발생시킨다.**

추가로 확인한 참고 URL (sitemap 외):

| URL | 상태코드 | Location |
|---|---|---|
| `http://lucajournal.com` | 301 | `https://lucajournal.com/` |
| `https://www.lucajournal.com/` | 200 (리디렉션 없음, non-www로 합쳐지지 않음) | — |
| `https://lucajournal.com/index.html` | 308 | `/` |
| `https://lucajournal.com/about/` (trailing slash) | 308 | `/about` |
| `http://lucajournal.com/about.html` (http+html 이중 케이스) | 301 → 308 (2단계) | `https://.../about.html` → `https://.../about` |

게시글 상세 URL(예: `post.html?slug=...`)은 sitemap에 없어 이번 리디렉션 표 대상에서 제외했다 (3개 이상 대표 확인 요구사항은 sitemap에 게시글 URL 자체가 없어 적용 불가 — §9 Check 참고).

## 5. canonical 검사 결과

정적 HTML 파일에서 `<link rel="canonical">` 존재 여부를 전수 검색했다 (`grep -n canonical *.html`).

| 파일 | canonical 존재 | canonical 값 | sitemap URL과 일치 | 리디렉션 이후 최종 URL과 일치 |
|---|---|---|---|---|
| `index.html` | 있음 | `https://lucajournal.com/` | 일치 | 일치 |
| `about.html` | 있음 | `https://lucajournal.com/about.html` | 일치 | **불일치** (`/about`과 다름) |
| `category.html` | **없음** | — | 해당 없음 | 해당 없음 |
| `privacy.html` | 있음 | `https://lucajournal.com/privacy.html` | sitemap 미포함 | 해당 URL도 308 대상으로 추정(§9 Check) |
| `terms.html` | 있음 | `https://lucajournal.com/terms.html` | sitemap 미포함 | 좌동 |
| `shop.html` | 있음 | `https://lucajournal.com/shop.html` | sitemap 미포함 | 좌동 |
| `post.html`, `mypage.html`, `confirm.html`, `write.html`, `unsubscribe.html` | 없음 | — | — | — |

`https://lucajournal.com/about`(리디렉션 최종 도착 페이지)를 curl로 다시 받아보면, 실제 서빙되는 HTML의 canonical 태그도 여전히 `https://lucajournal.com/about.html`을 가리킨다 — 즉 **canonical이 "그 자체가 리디렉션되는 URL"을 자기참조하고 있다.**

## 6. robots.txt 검사 결과

로컬 파일과 배포된 `https://lucajournal.com/robots.txt` 응답이 **완전히 동일**함을 확인했다 (HTTP 200).

```
User-agent: *
Allow: /
Disallow: /write.html
Disallow: /confirm.html

Sitemap: https://lucajournal.com/sitemap.xml
```

- Sitemap 선언 URL은 정확하며 200으로 정상 응답한다.
- `Disallow` 대상(`write.html`, `confirm.html`)은 실제로 sitemap에도 포함되어 있지 않고, 두 파일 모두 `<meta name="robots" content="noindex, nofollow">`를 갖고 있어 robots.txt와 meta 태그가 일관됨을 확인했다.
- `mypage.html`, `unsubscribe.html`도 noindex,nofollow를 갖지만 robots.txt Disallow 목록에는 없음 (meta 태그만으로 크롤링 차단, 기능상 문제는 아니나 참고사항).
- robots.txt 자체에는 리디렉션 관련 오류를 유발할 소지가 없음.

## 7. Cloudflare 및 프로젝트 리디렉션 설정

- 저장소 내에 `_redirects`, `_headers`, `wrangler.toml/json/jsonc`, `_worker.js` 등 **Cloudflare Pages 관련 설정 파일이 전혀 없다.**
- 그럼에도 `.html` 확장자가 붙은 URL(`/about.html`, `/category.html?...`, `/index.html`)에 접근하면 예외 없이 308 리디렉션이 발생하고, trailing slash가 붙은 URL(`/about/`)도 308로 정규화된다.
- 이 패턴(확장자 제거 + trailing slash 제거, 308 Permanent Redirect, 응답 헤더에 `_redirects` 특유의 커스텀 헤더 없이 순수 `server: cloudflare` + `cf-cache-status: DYNAMIC`만 존재)은 저장소 코드가 아니라 **Cloudflare Pages 플랫폼이 기본 제공하는 "clean URL(html 확장자 자동 정규화)" 동작과 일치하는 정황**이다.
- `http://` → `https://`(301) 리디렉션 역시 저장소에 설정 파일이 없으므로 Cloudflare 커스텀 도메인의 "Always Use HTTPS" 류 플랫폼 설정으로 추정된다.
- `www.lucajournal.com`이 non-www로 리디렉션되지 않고 그대로 200을 반환하는 것도, Cloudflare Pages 커스텀 도메인에 www/non-www가 각각 별도로 연결되어 있고 리디렉션 규칙이 없기 때문으로 추정된다.
- 위 내용은 **저장소 파일로는 최종 확인이 불가능**하며, Cloudflare Pages 대시보드(Custom domains, Build & deployments 설정, 혹은 프로젝트가 "Pages"가 아니라 "Workers + Static Assets"라면 `html_handling` 설정)에서 직접 확인이 필요하다 (§10 Check).
- `supabase/config.toml`, `auth.js`에도 `redirect` 관련 항목이 있으나 이는 Supabase Auth 로그인 콜백 URL(`redirectTo: window.location.origin`) 용도로, sitemap/GSC 리디렉션 이슈와는 **무관함**을 확인했다.

## 8. Fact

- sitemap.xml에는 URL 6개가 있으며 로컬 파일과 배포 파일 내용이 동일하다. (§3)
- sitemap URL 중 5개(`about.html`, `category.html?code=*` 5종)가 실제로 308 리디렉션을 일으키며, 최종 도착 URL은 확장자가 제거된 형태(`/about`, `/category?code=*`)다. (§4)
- 리디렉션 최종 도착 페이지의 HTML 콘텐츠는 리디렉션 전 URL로 접근했을 때(follow 후)와 MD5 동일 — 같은 파일이 서빙되는 것이며 콘텐츠 이슈는 아니다.
- `about.html`의 `<link rel="canonical">`은 sitemap에 등록된 URL과는 일치하지만, 그 URL 자체가 308로 리디렉션되는 URL이라 canonical이 "리디렉션되는 URL"을 자기참조한다. (§5)
- `category.html`에는 canonical 태그가 아예 없다. (§5)
- robots.txt는 로컬/배포 동일, sitemap 선언 정상, 크롤링 차단 설정과 noindex 메타 태그가 일관됨. (§6)
- 저장소에 Cloudflare Pages 관련 설정 파일(`_redirects`, `_headers`, `wrangler.*`)이 전혀 없다 — 즉 이 프로젝트의 리디렉션 로직은 저장소 코드에서 나오는 것이 아니다. (§7)
- `http://`→`https://`, `.html` 확장자 제거, trailing slash 제거가 모두 308/301로 발생하며 저장소 설정 없이 벌어진다는 점에서 플랫폼 기본 동작으로 보인다. (§7)
- 게시글 상세 페이지(`post.html?slug=...`)는 현재 sitemap에 포함되어 있지 않다. (§2, §3)

## 9. Hypothesis

- 308 리디렉션(.html 확장자 제거, trailing slash 정규화)이 **Cloudflare Pages의 기본 "clean URL" 플랫폼 동작**에서 비롯된다는 것 — 저장소에 관련 설정이 없다는 정황 증거는 있으나, Cloudflare 대시보드를 직접 열람하지 못해 확정할 수 없다.
- `privacy.html`, `terms.html`, `shop.html`도 canonical은 있지만 sitemap에는 없는 페이지들인데, `about.html`/`category.html`과 동일한 정적 HTML 구조이므로 마찬가지로 `.html` 접근 시 308 리디렉션이 발생할 가능성이 높다 — 그러나 sitemap에 없으므로 이번 GSC "리디렉션 포함 페이지" 경고와는 직접 관련이 없을 수 있다 (curl로 직접 검증하지 않음).
- `www.lucajournal.com`이 non-www로 합쳐지지 않고 별도로 200을 반환하는 것은 중복 콘텐츠(듀플리케이트) 이슈를 유발할 수 있으나, GSC의 "리디렉션 포함 페이지" 카테고리와는 다른 이슈(오히려 "정규 URL 미지정" 계열)일 가능성이 있다.
- GSC가 실제로 플래그한 URL 목록이 이번에 확인한 5개(`about.html`, `category.html?code=*`)와 정확히 일치하는지는 Search Console 화면을 직접 보지 못했으므로 가정일 뿐이다.

## 10. Check (사용자가 Search Console / Cloudflare에서 추가 확인)

- **Search Console → 색인 생성 → 페이지 → "리디렉션이 포함된 페이지"** 항목을 열어 실제로 플래그된 URL 목록이 `about.html`, `category.html?code=*` 5종과 일치하는지 대조.
- **Search Console → URL 검사 도구**에서 `https://lucajournal.com/about.html`을 직접 검사해 Google이 인식한 "사용자 지정 canonical" 및 "Google이 선택한 canonical" 값을 확인 (curl로는 Google이 최종적으로 어떤 canonical을 채택했는지까지는 알 수 없음).
- **Cloudflare 대시보드 → Pages 프로젝트 → Custom domains** 에서 `lucajournal.com`, `www.lucajournal.com`이 각각 어떻게 연결되어 있는지, 그리고 `.html` 확장자/trailing slash 정규화가 프로젝트 설정인지 플랫폼 기본값인지 확인.
- 이 프로젝트가 "Pages (Static)"인지 "Workers + Static Assets"인지 확인 — 후자라면 `wrangler.toml`의 `[assets] html_handling` 설정(예: `none`)으로 .html 리디렉션을 끌 수 있는 옵션이 존재.
- Bulk Redirects, Page Rules, Transform Rules 등 Cloudflare Zone 레벨(=Pages 프로젝트 밖) 리디렉션 규칙이 별도로 걸려 있는지 확인 (프로젝트 저장소에서는 확인 불가).
- `privacy.html`, `terms.html`, `shop.html`이 sitemap 미포함임에도 GSC "검색결과에서 제외됨" 다른 카테고리로 잡혀 있는지 여부 (이번 조사 범위 밖이지만 함께 정리하면 유용).
- 게시글 상세 페이지 URL 구조(`post.html?slug=...`)를 향후 sitemap에 포함할지 여부는 별도 결정 필요.

## 11. 원인 후보 및 확신도

| 순위 | 원인 후보 | 등급 |
|---|---|---|
| 1 | sitemap.xml에 `.html`/쿼리 포함 URL이 등록되어 있는데, 실서버가 해당 URL을 확장자 제거형 URL로 308 리디렉션함 (5/6 URL 해당) | **확정** |
| 2 | `about.html`의 canonical 태그가 리디렉션되는 자기 자신(.html) URL을 가리켜, 리디렉션 이후에도 canonical이 정정되지 않음 | **확정** |
| 3 | 위 308 리디렉션의 발생 원인이 Cloudflare Pages 플랫폼 기본 "clean URL" 동작이라는 것 (저장소에 관련 설정 파일 부재로 추정) | **가능성 높음** |
| 4 | `category.html`에 canonical 태그가 없어, 리디렉션 이후 최종 URL(`/category?code=*`)의 정규 URL을 Google이 스스로 추정해야 하는 상태 | **가능성 높음** |
| 5 | `www` 서브도메인이 non-www로 통합되지 않아 중복 URL로 인식될 가능성 | **가능성 있음** (GSC "리디렉션" 카테고리와 직접 연관은 불확실) |
| 6 | `privacy.html`/`terms.html`/`shop.html`도 동일 리디렉션을 겪지만 sitemap 밖이라 이번 경고와 무관 | **근거 부족** (직접 curl 검증 안 함) |

## 12. 가장 가능성 높은 원인

sitemap.xml에 등록된 6개 URL 중 5개(`about.html`, `category.html?code=DAILY|PERSPECTIVE|HERITAGE|APOLOGETICS|NOTICE`)가 **실제 배포 환경에서 308 Permanent Redirect로 확장자 없는 URL(`/about`, `/category?code=...`)로 리디렉션되고 있으며**, 리디렉션 전 URL의 canonical 태그(`about.html`)마저 리디렉션되는 그 URL 자신을 가리키고 있다.

Google 크롤러는 sitemap URL에 접근할 때 리디렉션을 만나면 즉시 "리디렉션이 포함된 페이지"로 분류하고, 최종 도착 URL과 sitemap/canonical에 기재된 URL이 다르면 신뢰도를 낮춰 색인에서 제외하는 경향이 있다. 이번 조사에서 확인된 curl 결과(§4, §5)가 이 경고의 직접적 원인일 가능성이 가장 높다.

이 308 리디렉션 자체는 프로젝트 코드에 원인이 없고(§7 Fact) Cloudflare Pages 플랫폼 동작으로 추정되므로, 근본 대응은 "sitemap과 canonical을 실제 서빙되는 최종 URL(확장자 없는 형태)로 통일"하는 방향이 유력해 보인다 — 단, 최종 결론은 §10 Check 항목(Cloudflare 대시보드 확인) 완료 후 확정 권장.

## 13. 최소 수정 권장안

> 본 작업에서는 실행하지 않음. 후속 조치를 위한 권장안만 기록.

1. `sitemap.xml`의 URL을 실제로 308 없이 200을 반환하는 최종 형태로 교체: `https://lucajournal.com/about`, `https://lucajournal.com/category?code=DAILY` 등 (확장자 제거형).
2. `about.html`의 `<link rel="canonical">` 값을 `https://lucajournal.com/about.html` → `https://lucajournal.com/about`로 수정.
3. `category.html`에 `<link rel="canonical" href="https://lucajournal.com/category?code=...">` 형태의 canonical 태그 신규 추가 (현재 없음, 단 쿼리 파라미터별로 동적 처리 필요 여부는 별도 검토).
4. (선택) Cloudflare 대시보드 확인 결과에 따라, `.html` 확장자 자체를 canonical 형식으로 유지하고 싶다면 반대로 플랫폼의 clean URL 리디렉션을 끄는 방향도 대안이 될 수 있음 — 이 경우 sitemap/canonical은 현재 상태를 유지.

## 14. 수정 시 예상 영향

- 위 수정안은 sitemap.xml과 HTML `<head>` 내 메타 태그 수정에 그치며, 서버 라우팅/리디렉션 로직 자체를 바꾸지 않으므로 사용자 접근 경로나 페이지 콘텐츠에는 영향이 없다.
- 기존에 `/about.html`, `/category.html?code=*` 링크로 유입되던 트래픽(외부 백링크, 북마크 등)은 계속 308 리디렉션을 통해 정상 도달하므로 깨지지 않는다.
- canonical/sitemap 변경 후에도 실제 서빙되는 HTML 파일(`about.html`, `category.html`)의 파일명·경로는 그대로 유지되므로 코드 구조 변경이 필요 없다.
- Search Console 재크롤링까지 통상 수일~수주가 소요될 수 있어 즉각적인 경고 해제는 기대하기 어렵다.

## 15. 수정 후 검증 방법

1. `curl -s -D - -o /dev/null "https://lucajournal.com/about"` 등으로 sitemap에 새로 등록한 URL이 200을 즉시 반환하는지 확인 (리디렉션 없음).
2. 수정된 각 페이지의 `<link rel="canonical">` 값이 sitemap URL 및 실제 응답 URL과 정확히 일치하는지 육안/grep으로 재확인.
3. Search Console → sitemap 재제출 후 "URL 검사" 도구로 개별 URL의 "사용자 지정 canonical"/"Google이 선택한 canonical" 일치 여부 확인.
4. Search Console 색인 생성 리포트에서 "리디렉션이 포함된 페이지" 건수가 시간 경과에 따라 감소하는지 모니터링 (즉시 반영되지 않음에 유의).

## 16. ChatGPT에 전달할 핵심 데이터

- **sitemap 생성 파일**: `/sitemap.xml` (정적 파일, 빌드/생성 코드 없음, 최초 작성 후 미변경)
- **sitemap URL 개수**: 6개
- **리디렉션되는 sitemap URL 목록 (5개, 전부 308)**:
  - `https://lucajournal.com/about.html` → `https://lucajournal.com/about`
  - `https://lucajournal.com/category.html?code=DAILY` → `https://lucajournal.com/category?code=DAILY`
  - `https://lucajournal.com/category.html?code=PERSPECTIVE` → `https://lucajournal.com/category?code=PERSPECTIVE`
  - `https://lucajournal.com/category.html?code=HERITAGE` → `https://lucajournal.com/category?code=HERITAGE`
  - `https://lucajournal.com/category.html?code=APOLOGETICS` → `https://lucajournal.com/category?code=APOLOGETICS`
  - `https://lucajournal.com/category.html?code=NOTICE` → `https://lucajournal.com/category?code=NOTICE`
- **리디렉션 없는 sitemap URL**: `https://lucajournal.com/` (200)
- **사용 중인 대표 도메인**: `https://lucajournal.com` (non-www, https). `www.lucajournal.com`도 200으로 별도 응답하며 non-www로 통합되지 않음(추가 확인 필요).
- **canonical 생성 위치**: 각 정적 HTML 파일 `<head>` 내 하드코딩된 `<link rel="canonical">` (파일: `index.html`, `about.html`, `privacy.html`, `terms.html`, `shop.html`). `category.html`, `post.html` 등은 canonical 태그 없음.
- **리디렉션 관련 설정 파일**: 저장소 내 없음 (`_redirects`/`_headers`/`wrangler.*` 부재) — 리디렉션은 Cloudflare 플랫폼 레벨로 추정, 대시보드 확인 필요.
- **가장 가능성 높은 원인**: sitemap의 `.html`/쿼리 URL이 실서버에서 확장자 제거형 URL로 308 리디렉션되며, canonical(`about.html`)도 그 리디렉션되는 URL을 자기참조 — sitemap/canonical/실제 서빙 URL 3자가 불일치.
- **아직 확인하지 못한 항목**: (1) GSC에 실제 플래그된 URL 목록이 이 5개와 정확히 일치하는지, (2) Cloudflare 대시보드의 clean URL/커스텀 도메인 설정, (3) `privacy.html`/`terms.html`/`shop.html`의 리디렉션 여부(curl 미실행), (4) www/non-www 통합 정책.
- **수정이 필요할 것으로 예상되는 파일**: `sitemap.xml`, `about.html`(canonical), `category.html`(canonical 신규 추가). 서버/리디렉션 설정 변경은 Cloudflare 대시보드 확인 후 별도 판단.
