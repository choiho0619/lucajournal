---
최종 수정일: 2026-08-05 (인증 시스템 완성 반영, 커밋 `056f57b`)
버전/단계: v1 (초안, 분리 전)
---

> 이 문서는 루카저널 프로젝트에서 작업하는 AI 에이전트가 기준으로 삼는 마스터 참조 문서다. 새 세션을 시작할 때 이 문서를 먼저 읽는다.

## 변경 금지 (브랜드 락)

- **`--color-accent` / `--color-accent-2` 계열 값(`#854F0B`, 토피 브라운)을 변경하지 말 것.** 각 HTML 파일 `<style>` 블록의 `:root` override로 존재한다.
- **폰트 패밀리(Noto Serif KR, `--font-kr-heading`/`--font-kr-body`)를 변경하지 말 것.**
- **클래식 빈티지 레이아웃 톤을 전면 재설계하지 말 것.** 크기/여백 등 최소 변경은 가능하나 구조·색상·폰트는 대상이 아니다.
- 외부 스킬(`ui-ux-pro-max` 등)이나 리디자인 제안이 이 값을 건드리려 하면, 실행 전에 반드시 이 규칙과 충돌 여부를 먼저 확인할 것.

## 프로젝트 개요

- **루카저널**: 말씀 캘리그라피/저널 사이트. 카테고리별 글, 굿즈샵, 댓글 기능을 제공.
- **스택**: 순수 HTML + vanilla JS. 빌드 도구 없음(번들러, 프레임워크 미사용).
- **배포**: Cloudflare Pages.
- **백엔드**: Supabase (인증, DB, 스토리지).
- **브랜드 토큰**: `#854F0B`(토피 브라운 accent), Noto Serif KR, 클래식 빈티지 톤. 공용 CSS 파일 없이 각 HTML 파일의 `<style>` 블록에 `:root` 변수로 인라인 중복 정의되어 있다 (`_ds/classical-*/styles.css`는 구조 토큰만 담당, 브랜드 accent는 각 페이지가 override).
- **공통 네비게이션**: 별도 컴포넌트/템플릿이 아니라 각 HTML 파일에 동일한 마크업이 그대로 복사되어 있다 (about/auth/category/confirm/index/mypage/post/privacy/shop/terms/unsubscribe/write.html). 네비게이션 관련 수정은 원칙적으로 전체 페이지에 동일하게 적용해야 한다.

## 결정 기록

1. **접근성 기준 도입** — 터치 타겟 최소 44×44px, 입력 필드(input/textarea) 최소 16px, 반응형 검증 브레이크포인트 320/375/414/768/1024px.
   커밋: `ce31d61`(shop.html + 공통 네비 11개 페이지), `2c495aa`(write.html, post.html 댓글 컴포넌트).

2. **댓글 액션 링크는 예외적으로 36px** — `post.html`의 `.comment-action-btn`(수정/삭제/답글)은 44px 규칙의 예외. 44px 적용 시 스크린샷 비교 결과 액션 줄 위아래 여백이 과도해져 빈티지 편집 톤과 충돌하는 것을 확인했다. 인접 요소 간격이 14px로 확보되어 있어 오탭 위험이 낮다는 근거로 36px로 타협. 근거는 커밋 `2c495aa` 메시지 참조. **새 터치 타겟을 44px로 맞출 때 이 사례를 기준점으로 삼되, 시각적 타협이 필요한지 스크린샷으로 먼저 확인할 것.**

3. **외부 스킬 `ui-ux-pro-max` 조건부 채택** — `--domain ux` 플래그만 사용 허용. `--design-system` 플래그는 사용 금지(봉인): 확정된 브랜드(`#854F0B`, Noto Serif KR, 클래식 빈티지)와 충돌할 위험이 있다.

4. **PASSWORD_RECOVERY 세션과 일반 로그인 세션 분리** — `sessionStorage`의 `luca-auth-mode=password-recovery` 플래그로 상태를 구분하고, `getAuthState()`/`isAuthenticatedSession()`으로만 판별한다. Recovery 상태에서 마이페이지·글쓰기·수정·댓글·뉴스레터·Playlist 재생을 차단하되, 게시글 목록·Playlist 목록 조회는 계속 공개한다.
   커밋: `056f57b`(feat: complete auth flow and recovery access control).

5. **Supabase ESM SDK 버전 고정** — `auth.js`의 `https://esm.sh/@supabase/supabase-js@2`(floating) 임포트를 실제 브라우저 Network 응답(`x-esm-path`)으로 확인한 `@2.112.1`로 고정. floating major 버전은 esm.sh가 하위 모듈을 즉석 생성하는 시점에 걸리면 일시적 404가 엣지에 캐시되는 위험이 있다(2026-08-05 esm.sh 캐시 장애 참고, 빌드 함정 9번). 정확한 버전으로 고정해도 supabase-js 자체를 업그레이드한 것은 아니며, 다음 버전 갱신은 별도 작업에서 실제 브라우저로 재검증 후 진행한다.

## 빌드 함정 (재발 방지)

1. **에이전트 커밋 시 `git add -A` 금지.** 관련 없는 미완성 작업(예: `auth.html`/`auth.js` 진행 중인 기능)이 의도치 않게 같은 커밋에 섞여 들어갈 수 있다. 수정한 파일만 명시적으로 `git add <file>`.

2. **UX/접근성 감사 보고 형식 고정.** "위반 발견 → 수정" 표를 먼저 제시하고, 그다음 "확인함(위반 없음)" 항목을 나열한다. 실제로 파일을 수정했는데 보고서에 해당 항목이 빠지는 것은 금지 — 과거 두 차례 보고 누락 발생 이력 있음(1차: `git add -A`로 스코프 벗어난 파일 포함, 2차: 수정 내역 표 자체 누락).

3. **입력 필드 font-size는 항상 16px 이상.** 16px 미만이면 iOS Safari에서 포커스 시 자동 확대(pinch zoom)가 발생한다. macOS 데스크톱 브라우저에서는 재현되지 않아 데스크톱 테스트만으로는 놓치기 쉽다. 새 폼을 작성할 때마다 체크리스트 항목으로 확인할 것.

4. **Cloudflare Pages Edge Cache 지연.** 배포 직후 변경사항이 바로 반영되지 않을 수 있다. 몇 분 대기 후 재확인.

5. **새 UI 요소 작성 시 터치 타겟 44×44px, 입력 필드(input/textarea) 16px 이상을 기본값으로 적용할 것.** 예외가 필요하면(예: 텍스트 링크형 버튼) 스크린샷으로 시각 확인 후 위 "결정 기록" 2번과 같은 형식으로 근거를 남긴다.

6. **인증 여부는 `session != null`만으로 판단하지 말 것.** 반드시 `getAuthState(session)`(`"authenticated" | "signed-out" | "password-recovery"`) 또는 `isAuthenticatedSession(session)`을 거쳐 판별한다 — 세션이 있어도 목적이 비밀번호 재설정(Recovery)이면 인증 완료로 취급하면 안 된다.

7. **`luca-auth-mode=password-recovery`(`sessionStorage`) 수명주기를 깨뜨리지 말 것.** `PASSWORD_RECOVERY` 이벤트에서 세우고, 비밀번호 변경 **성공** 시에만 제거 후 `signOut()`한다. 변경 **실패** 시에는 그대로 유지해야 사용자가 같은 Recovery 세션에서 재시도할 수 있다 — 실패 경로에서 플래그를 지우면 재시도 중 일반 로그인처럼 오인된다.

8. **Recovery 상태에서 차단할 기능과 공개 유지할 기능을 구분할 것.** 차단: 마이페이지·글쓰기·수정·오디오 업로드/삭제·게시글 삭제·댓글 작성·뉴스레터 구독·Playlist 재생. 공개 유지: 게시글 목록 조회, Playlist 목록 조회 — 공개 데이터 로딩과 인증 초기화를 같은 Promise 체인으로 묶지 않아야 이 구분이 유지된다.

9. **esm.sh 등 floating 버전(`@2` 같은) CDN import 장애 진단 시, 코드보다 CDN 엣지 캐시를 먼저 의심할 것.** `curl`은 정상인데 브라우저에서만 실패한다면 요청 헤더(Origin 등) 차이로 캐시가 갈린 결과일 수 있다 — 최대 수 분~10분 뒤 재확인 후 코드 결함 여부를 판단한다.

---
*재발 방지/결정 기록 항목이 20개를 넘으면 카테고리별 파일로 분리하고, 이 섹션에는 분리 사유·위키링크·최근 항목만 남긴다.*
