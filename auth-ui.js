import { supabase, signOut, onAuthStateChanged } from "./auth.js";

const authArea = document.getElementById("auth-area");

// 현재 페이지(경로+쿼리)를 returnTo로 실어 통합 인증 페이지로 보낸다.
// 항상 같은 origin의 pathname+search에서만 만들어지므로 외부 URL이 섞일 수 없다.
function buildAuthPageUrl(mode) {
  const returnTo = window.location.pathname + window.location.search;
  const params = new URLSearchParams({ returnTo });
  if (mode) params.set("mode", mode);
  return `/auth.html?${params.toString()}`;
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
  nameEl.className = "nav-links";
  nameEl.style.fontSize = "14.5px";
  nameEl.style.color = "#201f1d";
  nameEl.textContent = name;

  const logoutBtn = document.createElement("button");
  logoutBtn.type = "button";
  logoutBtn.className = "btn btn-secondary";
  logoutBtn.textContent = "로그아웃";
  logoutBtn.addEventListener("click", () => signOut());

  authArea.appendChild(nameEl);
  authArea.appendChild(logoutBtn);
}

async function resolveDisplayName(user) {
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();
  return data?.display_name || user.email.split("@")[0];
}

async function renderForUser(user) {
  if (!user) {
    renderLoggedOut();
    return;
  }
  const name = await resolveDisplayName(user);
  renderLoggedIn(name);
}

export async function refreshAuthUI() {
  const { data: { session } } = await supabase.auth.getSession();
  await renderForUser(session?.user ?? null);
}

supabase.auth.getSession().then(({ data: { session } }) => {
  renderForUser(session?.user ?? null);
});

onAuthStateChanged((_event, session) => {
  renderForUser(session?.user ?? null);
});
