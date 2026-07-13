import { supabase, signInWithGoogle, signOut, onAuthStateChanged } from "./auth.js";

const authArea = document.getElementById("auth-area");

function renderLoggedOut() {
  authArea.innerHTML = "";
  const loginBtn = document.createElement("button");
  loginBtn.type = "button";
  loginBtn.className = "btn btn-secondary";
  loginBtn.textContent = "로그인";
  loginBtn.addEventListener("click", () => signInWithGoogle());
  authArea.appendChild(loginBtn);
}

function renderLoggedIn(name) {
  authArea.innerHTML = "";

  const nameEl = document.createElement("span");
  nameEl.className = "nav-links";
  nameEl.style.fontSize = "14.5px";
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

supabase.auth.getSession().then(({ data: { session } }) => {
  renderForUser(session?.user ?? null);
});

onAuthStateChanged((_event, session) => {
  renderForUser(session?.user ?? null);
});
