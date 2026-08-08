import { supabase, signOut, getAuthState, onAuthStateChanged } from "./auth.js";

const authArea = document.getElementById("auth-area");
const isPasswordResetPage = /^\/auth(?:\.html)?$/.test(window.location.pathname)
  && new URLSearchParams(window.location.search).get("mode") === "reset";
const isMyPage = /^\/mypage(?:\.html)?\/?$/.test(window.location.pathname);

// 현재 페이지(경로+쿼리)를 returnTo로 실어 통합 인증 페이지로 보낸다.
// 항상 같은 origin의 pathname+search에서만 만들어지므로 외부 URL이 섞일 수 없다.
export function buildAuthPageUrl(mode) {
  const returnTo = window.location.pathname + window.location.search;
  const params = new URLSearchParams({ returnTo });
  if (mode) params.set("mode", mode);
  return `/auth?${params.toString()}`;
}

function renderLoggedOut() {
  authArea.innerHTML = "";
  const loginLink = document.createElement("a");
  loginLink.className = "btn btn-secondary";
  loginLink.textContent = "로그인";
  loginLink.href = buildAuthPageUrl();

  const signupLink = document.createElement("a");
  signupLink.className = "btn btn-secondary";
  signupLink.textContent = "회원가입";
  signupLink.href = buildAuthPageUrl("signup");

  authArea.append(loginLink, signupLink);
}

function renderLoggedIn(name) {
  authArea.innerHTML = "";

  const nameEl = document.createElement("a");
  nameEl.href = "/mypage";
  nameEl.className = "auth-user-name";
  nameEl.style.fontSize = "14.5px";
  nameEl.style.color = "#201f1d";
  nameEl.textContent = name;
  nameEl.title = name;

  const logoutBtn = document.createElement("a");
  logoutBtn.href = "#";
  logoutBtn.setAttribute("role", "button");
  logoutBtn.className = "btn btn-secondary auth-logout-button";
  logoutBtn.textContent = "로그아웃";
  logoutBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    const { error } = await signOut();
    if (!error && isMyPage) window.location.href = "/";
  });

  authArea.appendChild(nameEl);
  authArea.appendChild(logoutBtn);
}

function renderPasswordRecovery() {
  authArea.innerHTML = "";
  const status = document.createElement("span");
  status.className = "nav-links";
  status.style.fontSize = "13px";
  status.textContent = "비밀번호 재설정 중";
  authArea.appendChild(status);
}

async function resolveDisplayName(user) {
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();
  return data?.display_name || user.email.split("@")[0];
}

let renderRequestId = 0;

async function renderForSession(session) {
  const requestId = ++renderRequestId;
  const authState = getAuthState(session);
  if (authState === "password-recovery") {
    renderPasswordRecovery();
    return;
  }
  if (isPasswordResetPage) {
    authArea.innerHTML = "";
    return;
  }
  if (authState === "signed-out") {
    renderLoggedOut();
    return;
  }
  const name = await resolveDisplayName(session.user);
  if (requestId !== renderRequestId || getAuthState(session) !== "authenticated") return;
  renderLoggedIn(name);
}

export async function refreshAuthUI() {
  const { data: { session } } = await supabase.auth.getSession();
  await renderForSession(session);
}

supabase.auth.getSession().then(({ data: { session } }) => {
  renderForSession(session);
});

onAuthStateChanged((_event, session) => {
  renderForSession(session);
});
