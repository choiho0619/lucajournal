import { supabase, signInWithGoogle, onAuthStateChanged } from "./auth.js";
import { formatDate } from "./posts.js";

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
export function initMemberSubscribeWidget(mountId) {
  const mount = document.getElementById(mountId);
  if (!mount) return;

  let requestId = 0;

  function renderLoading() {
    mount.innerHTML = "";
    const message = document.createElement("p");
    message.className = "sub";
    message.style.margin = "0";
    message.textContent = "뉴스레터 구독 상태를 확인하는 중입니다...";
    mount.appendChild(message);
  }

  function renderLoggedOut() {
    mount.innerHTML = "";

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

  function renderUnsubscribed(email, noticeText) {
    mount.innerHTML = "";

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
    mount.innerHTML = "";

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
    if (!session?.user) {
      renderLoggedOut();
      return;
    }
    loadStatus(session);
  });
}
