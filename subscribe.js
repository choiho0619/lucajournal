import { supabase } from "./auth.js";

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
