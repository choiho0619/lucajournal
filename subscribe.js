import { supabase, signInWithGoogle, getAuthState, onAuthStateChanged } from "./auth.js";
import { formatDate } from "./posts.js?v=20260823";
import { buildAuthPageUrl } from "./auth-ui.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function subscribeEmail(email) {
  if (!EMAIL_REGEX.test(email)) {
    return { error: "올바른 이메일 형식이 아닙니다" };
  }

  const { error } = await supabase
    .from("subscriptions")
    .insert({ email, channel: "email" });

  if (error) {
    if (error.code === "23505") {
      return { error: "이미 구독 중인 이메일입니다" };
    }
    return { error: error.message };
  }

  return { message: "구독 신청이 접수되었습니다" };
}

export async function confirmSubscription(token) {
  if (!token) {
    return { error: "유효하지 않은 토큰입니다" };
  }

  const { data, error } = await supabase.rpc("confirm_subscription", { p_token: token });

  if (error || !data || data.length === 0) {
    return { error: "유효하지 않거나 만료된 확인 링크입니다" };
  }

  return { email: data[0].email };
}

export function initSubscribeWidget(mountId) {
  const mount = document.getElementById(mountId);
  if (!mount) return;

  const inlineForm = document.createElement("div");
  inlineForm.style.display = "flex";
  inlineForm.style.gap = "8px";
  inlineForm.style.alignItems = "center";

  const emailInput = document.createElement("input");
  emailInput.type = "email";
  emailInput.placeholder = "이메일 주소";
  emailInput.style.padding = "8px 10px";
  emailInput.style.border = "1px solid var(--color-divider)";
  emailInput.style.borderRadius = "var(--radius-md)";
  emailInput.style.fontFamily = "inherit";
  emailInput.style.fontSize = "14px";
  emailInput.style.flex = "1 1 auto";
  emailInput.style.minWidth = "0";

  const submitBtn = document.createElement("button");
  submitBtn.type = "button";
  submitBtn.className = "btn btn-primary";
  submitBtn.textContent = "구독하기";
  submitBtn.style.flex = "0 0 auto";

  inlineForm.appendChild(emailInput);
  inlineForm.appendChild(submitBtn);

  const message = document.createElement("p");
  message.style.fontSize = "13px";
  message.style.margin = "8px 0 0";
  message.hidden = true;

  mount.appendChild(inlineForm);
  mount.appendChild(message);

  submitBtn.addEventListener("click", async () => {
    message.hidden = true;
    const result = await subscribeEmail(emailInput.value.trim());

    if (result.error) {
      message.textContent = result.error;
      message.style.color = "#b3261e";
      message.hidden = false;
      return;
    }

    inlineForm.hidden = true;
    message.textContent = "구독 신청이 접수되었습니다. 확인 이메일을 보내드릴 예정입니다.";
    message.style.color = "";
    message.hidden = false;
    localStorage.setItem("lj_subscribed", "1");
  });
}

// 회원 전용 뉴스레터 구독 위젯: 이메일 input 없이 auth.uid() 기반 RPC만 사용한다.
// 구독 상태는 항상 DB(get_my_subscription_status 등)를 기준으로 하며 localStorage는 쓰지 않는다.
export function initMemberSubscribeWidget(mountId, options = {}) {
  const mount = document.getElementById(mountId);
  if (!mount) return;

  // variant "hero": index.html Hero 패널 전용 렌더링(로그인 페이지 이동형 버튼, 해지 확인창 등).
  // 기본값(미지정)은 about.html의 기존 렌더링/동작을 그대로 유지한다.
  const variant = options.variant === "hero" ? "hero" : "inline";
  // hero variant: 보조 안내/상태 문구를 버튼 영역과 분리된 별도 영역(grid-area: note)에 그려
  // "제목+버튼(1행) / 설명(2행) / 보조안내(3행)" 레이아웃을 index.html의 정적 마크업만으로 구성한다.
  const noteMount = variant === "hero" && options.noteMountId
    ? document.getElementById(options.noteMountId)
    : null;
  const heroPanelEl = variant === "hero" ? mount.closest(".subscribe-panel") : null;
  // hero variant: 구독 완료 상태에서는 가입 유도 설명문(.subscribe-panel-desc)을 숨겨
  // 상태 배지 + 이메일 + 해지 버튼만 남긴다. index.html은 수정하지 않고 기존 정적 요소를 토글한다.
  const heroDescEl = heroPanelEl ? heroPanelEl.querySelector(".subscribe-panel-desc") : null;
  function setHeroDescVisible(visible) {
    if (heroDescEl) heroDescEl.hidden = !visible;
  }
  // hero variant: index.html의 정적 마크업(제목/설명/버튼)이 상태 판별 전에 먼저 보이는
  // 깜빡임을 막기 위해 .subscribe-panel은 hidden 상태로 시작한다. 4개 상태 렌더 함수가
  // 각자 최종 DOM을 구성한 뒤 이 공통 함수에서 한 번만 hidden을 해제해 표시한다.
  function revealHeroPanel() {
    if (heroPanelEl) heroPanelEl.hidden = false;
  }

  mount.setAttribute("aria-live", "polite");

  let requestId = 0;

  function renderLoading() {
    mount.setAttribute("aria-busy", "true");
    mount.innerHTML = "";
    if (noteMount) noteMount.innerHTML = "";

    if (variant === "hero") {
      // hero variant: 조회가 매우 짧게 끝나 로딩 문구가 깜빡임으로만 보이므로,
      // 조회 완료 전에는 빈 상태로 두고 완료 후 해당 상태를 바로 렌더링한다.
      return;
    }

    const message = document.createElement("p");
    message.className = "sub";
    message.style.margin = "0";
    message.textContent = "뉴스레터 구독 상태를 확인하는 중입니다...";
    mount.appendChild(message);
  }

  function renderLoggedOut() {
    mount.setAttribute("aria-busy", "false");
    mount.innerHTML = "";

    if (variant === "hero") {
      setHeroDescVisible(true);

      const primary = document.createElement("div");
      primary.className = "subscribe-panel-primary";

      const loginLink = document.createElement("a");
      loginLink.className = "btn btn-brand";
      loginLink.href = buildAuthPageUrl();
      loginLink.textContent = "로그인 후 구독하기";
      primary.appendChild(loginLink);

      mount.appendChild(primary);

      if (noteMount) {
        noteMount.innerHTML = "";
        noteMount.textContent = "회원에게 제공되는 무료 구독이며, 언제든지 해지할 수 있습니다.";
      }
      revealHeroPanel();
      return;
    }

    const message = document.createElement("p");
    message.className = "sub";
    message.style.margin = "0 0 10px";
    message.textContent = "로그인 후 뉴스레터를 구독할 수 있습니다.";

    const loginBtn = document.createElement("button");
    loginBtn.type = "button";
    loginBtn.className = "btn btn-primary";
    loginBtn.textContent = "로그인";
    loginBtn.addEventListener("click", () => signInWithGoogle());

    mount.appendChild(message);
    mount.appendChild(loginBtn);
  }

  function renderPasswordRecovery() {
    mount.setAttribute("aria-busy", "false");
    mount.innerHTML = "";
    if (noteMount) noteMount.innerHTML = "";
    setHeroDescVisible(true);
    const message = document.createElement("p");
    message.className = variant === "hero" ? "subscribe-panel-note" : "sub";
    message.style.margin = "0";
    message.textContent = "비밀번호 재설정을 먼저 완료해 주세요.";
    mount.appendChild(message);
    revealHeroPanel();
  }

  function renderUnsubscribed(email, noticeText) {
    mount.setAttribute("aria-busy", "false");
    mount.innerHTML = "";

    if (variant === "hero") {
      setHeroDescVisible(true);

      const primary = document.createElement("div");
      primary.className = "subscribe-panel-primary";

      const subscribeBtn = document.createElement("button");
      subscribeBtn.type = "button";
      subscribeBtn.className = "btn btn-brand";
      subscribeBtn.textContent = "뉴스레터 구독하기";
      primary.appendChild(subscribeBtn);
      mount.appendChild(primary);

      const defaultNote = "회원에게 제공되는 무료 구독이며, 언제든지 해지할 수 있습니다.";
      const setNote = (text, isError) => {
        if (!noteMount) return;
        noteMount.innerHTML = "";
        noteMount.textContent = text;
        noteMount.classList.toggle("is-error", Boolean(isError));
      };
      setNote(defaultNote, false);

      subscribeBtn.addEventListener("click", async () => {
        const myRequestId = ++requestId;
        subscribeBtn.disabled = true;
        subscribeBtn.setAttribute("aria-busy", "true");
        subscribeBtn.textContent = "구독 처리 중...";
        setNote(defaultNote, false);

        let result;
        try {
          result = await supabase.rpc("subscribe_current_user");
        } catch (e) {
          result = { error: e };
        }
        if (myRequestId !== requestId) return;

        const { data, error } = result;
        const resultRow = Array.isArray(data) ? data[0] : data;

        if (error || !resultRow) {
          console.error(error);
          subscribeBtn.disabled = false;
          subscribeBtn.removeAttribute("aria-busy");
          subscribeBtn.textContent = "뉴스레터 구독하기";
          setNote("구독 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.", true);
          return;
        }

        renderSubscribed(email, resultRow.subscribed_at, "뉴스레터 구독이 완료되었습니다.");
      });

      revealHeroPanel();
      return;
    }

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.flexWrap = "wrap";
    row.style.gap = "10px";
    row.style.alignItems = "center";

    const emailText = document.createElement("p");
    emailText.className = "sub";
    emailText.style.margin = "0";
    emailText.style.flex = "1 1 auto";
    emailText.style.minWidth = "0";
    emailText.style.overflowWrap = "anywhere";
    emailText.textContent = email;

    const subscribeBtn = document.createElement("button");
    subscribeBtn.type = "button";
    subscribeBtn.className = "btn btn-primary";
    subscribeBtn.textContent = "뉴스레터 구독하기";
    subscribeBtn.style.flex = "0 0 auto";

    const message = document.createElement("p");
    message.style.fontSize = "13px";
    message.style.margin = "8px 0 0";
    message.style.width = "100%";
    message.hidden = !noticeText;
    if (noticeText) message.textContent = noticeText;

    subscribeBtn.addEventListener("click", async () => {
      const myRequestId = ++requestId;
      subscribeBtn.disabled = true;
      subscribeBtn.textContent = "구독 처리 중...";
      message.hidden = true;

      let result;
      try {
        result = await supabase.rpc("subscribe_current_user");
      } catch (e) {
        result = { error: e };
      }
      if (myRequestId !== requestId) return;

      const { data, error } = result;
      const resultRow = Array.isArray(data) ? data[0] : data;

      if (error || !resultRow) {
        console.error(error);
        subscribeBtn.disabled = false;
        subscribeBtn.textContent = "뉴스레터 구독하기";
        message.textContent = "구독 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
        message.style.color = "#b3261e";
        message.hidden = false;
        return;
      }

      renderSubscribed(email, resultRow.subscribed_at, "뉴스레터 구독이 완료되었습니다.");
    });

    row.appendChild(emailText);
    row.appendChild(subscribeBtn);
    mount.appendChild(row);
    mount.appendChild(message);
  }

  function renderSubscribed(email, subscribedAt, noticeText) {
    mount.setAttribute("aria-busy", "false");
    mount.innerHTML = "";

    if (variant === "hero") {
      setHeroDescVisible(false);

      const primary = document.createElement("div");
      primary.className = "subscribe-panel-primary subscribe-panel-primary--subscribed";

      const status = document.createElement("p");
      status.className = "subscribed-badge";
      status.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 12l5 5L20 6"></path></svg>';
      status.append("매일 정오 뉴스레터 수신 중");
      primary.appendChild(status);

      const unsubscribeBtn = document.createElement("button");
      unsubscribeBtn.type = "button";
      unsubscribeBtn.className = "btn btn-secondary";
      unsubscribeBtn.textContent = "구독 해지";
      primary.appendChild(unsubscribeBtn);
      mount.appendChild(primary);

      const setNote = (text, isError) => {
        if (!noteMount) return;
        noteMount.innerHTML = "";
        noteMount.textContent = text;
        noteMount.classList.toggle("is-error", Boolean(isError));
      };
      // hero variant: 배지가 이미 구독 완료 상태를 나타내므로 noticeText(예: "뉴스레터 구독이
      // 완료되었습니다.")는 표시하지 않고 항상 이메일만 보조 정보로 보여준다.
      setNote(email, false);

      unsubscribeBtn.addEventListener("click", async () => {
        if (!confirm("뉴스레터 구독을 해지하시겠습니까?")) return;

        const myRequestId = ++requestId;
        unsubscribeBtn.disabled = true;
        unsubscribeBtn.setAttribute("aria-busy", "true");
        unsubscribeBtn.textContent = "해지 처리 중...";
        setNote(email, false);

        let result;
        try {
          result = await supabase.rpc("unsubscribe_current_user");
        } catch (e) {
          result = { error: e };
        }
        if (myRequestId !== requestId) return;

        const { data, error } = result;
        const resultRow = Array.isArray(data) ? data[0] : data;

        if (error || !resultRow) {
          console.error(error);
          unsubscribeBtn.disabled = false;
          unsubscribeBtn.removeAttribute("aria-busy");
          unsubscribeBtn.textContent = "구독 해지";
          setNote("해지 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.", true);
          return;
        }

        renderUnsubscribed(email, "뉴스레터 구독이 해지되었습니다.");
      });

      revealHeroPanel();
      return;
    }

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.flexWrap = "wrap";
    row.style.gap = "10px";
    row.style.alignItems = "center";

    const status = document.createElement("p");
    status.className = "subscribed-badge";
    status.style.margin = "0";
    status.textContent = subscribedAt
      ? `뉴스레터 구독 중 · ${email} · ${formatDate(subscribedAt)}부터`
      : `뉴스레터 구독 중 · ${email}`;

    const unsubscribeBtn = document.createElement("button");
    unsubscribeBtn.type = "button";
    unsubscribeBtn.className = "btn btn-secondary";
    unsubscribeBtn.textContent = "구독 해지";
    unsubscribeBtn.style.flex = "0 0 auto";

    const message = document.createElement("p");
    message.style.fontSize = "13px";
    message.style.margin = "8px 0 0";
    message.style.width = "100%";
    message.hidden = !noticeText;
    if (noticeText) message.textContent = noticeText;

    unsubscribeBtn.addEventListener("click", async () => {
      const myRequestId = ++requestId;
      unsubscribeBtn.disabled = true;
      unsubscribeBtn.textContent = "해지 처리 중...";
      message.hidden = true;

      let result;
      try {
        result = await supabase.rpc("unsubscribe_current_user");
      } catch (e) {
        result = { error: e };
      }
      if (myRequestId !== requestId) return;

      const { data, error } = result;
      const resultRow = Array.isArray(data) ? data[0] : data;

      if (error || !resultRow) {
        console.error(error);
        unsubscribeBtn.disabled = false;
        unsubscribeBtn.textContent = "구독 해지";
        message.textContent = "해지 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
        message.style.color = "#b3261e";
        message.hidden = false;
        return;
      }

      renderUnsubscribed(email, "뉴스레터 구독이 해지되었습니다.");
    });

    row.appendChild(status);
    row.appendChild(unsubscribeBtn);
    mount.appendChild(row);
    mount.appendChild(message);
  }

  async function loadStatus(session) {
    const myRequestId = ++requestId;
    renderLoading();

    let result;
    try {
      result = await supabase.rpc("get_my_subscription_status");
    } catch (e) {
      result = { error: e };
    }
    if (myRequestId !== requestId) return;

    const { data, error } = result;
    if (error) {
      console.error(error);
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (row?.is_subscribed) {
      renderSubscribed(session.user.email, row.subscribed_at, null);
    } else {
      renderUnsubscribed(session.user.email, null);
    }
  }

  renderLoading();

  onAuthStateChanged((_event, session) => {
    requestId++;
    const authState = getAuthState(session);
    if (authState === "password-recovery") {
      renderPasswordRecovery();
      return;
    }
    if (authState === "signed-out") {
      renderLoggedOut();
      return;
    }
    loadStatus(session);
  });
}
