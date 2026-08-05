import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.1";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const AUTH_MODE_STORAGE_KEY = "luca-auth-mode";
const AUTH_NOTICE_STORAGE_KEY = "luca-auth-notice";
const PASSWORD_RECOVERY_MODE = "password-recovery";

function readSessionStorage(key) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSessionStorage(key, value) {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    // sessionStorage를 사용할 수 없는 환경에서는 현재 페이지의 Supabase 이벤트만 사용한다.
  }
}

export function markPasswordRecoverySession() {
  writeSessionStorage(AUTH_MODE_STORAGE_KEY, PASSWORD_RECOVERY_MODE);
}

export function clearPasswordRecoverySession() {
  writeSessionStorage(AUTH_MODE_STORAGE_KEY, null);
}

export function isPasswordRecoverySession() {
  return readSessionStorage(AUTH_MODE_STORAGE_KEY) === PASSWORD_RECOVERY_MODE;
}

export function isAuthenticatedSession(session) {
  return Boolean(session?.user) && !isPasswordRecoverySession();
}

export function getAuthState(session) {
  if (isPasswordRecoverySession()) return "password-recovery";
  return session?.user ? "authenticated" : "signed-out";
}

export function redirectPasswordRecoveryToReset() {
  if (!isPasswordRecoverySession()) return false;
  writeSessionStorage(AUTH_NOTICE_STORAGE_KEY, "비밀번호 재설정을 먼저 완료해 주세요.");
  window.location.replace("/auth?mode=reset");
  return true;
}

export function consumeAuthNotice() {
  const notice = readSessionStorage(AUTH_NOTICE_STORAGE_KEY);
  writeSessionStorage(AUTH_NOTICE_STORAGE_KEY, null);
  return notice;
}

export function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: "google",
    // 로그인을 시작한 origin + 현재 경로 + 쿼리로 복귀시켜, 로컬(localhost)과 운영(lucajournal.com)
    // 양쪽 모두 로그인 시작 화면(예: /write?edit=1, /auth.html?returnTo=...)으로 돌아오게 한다.
    options: { redirectTo: window.location.origin + window.location.pathname + window.location.search },
  });
}

export function signOut() {
  clearPasswordRecoverySession();
  return supabase.auth.signOut();
}

export function onAuthStateChanged(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") markPasswordRecoverySession();
    if (event === "SIGNED_OUT") clearPasswordRecoverySession();
    callback(event, session);
  });
}

export function signUpWithEmail({ email, password, nickname }) {
  return supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: nickname },
      emailRedirectTo: `${window.location.origin}/auth.html`,
    },
  });
}

export function signInWithEmail({ email, password }) {
  return supabase.auth.signInWithPassword({ email, password });
}

function getPasswordResetRedirectUrl() {
  return new URL("/auth.html?mode=reset", window.location.origin).href;
}

export function resetPasswordForEmail(email) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: getPasswordResetRedirectUrl(),
  });
}

export function updatePassword(password) {
  return supabase.auth.updateUser({ password });
}

// Supabase 원본 오류 메시지를 사용자용 한국어 문구로 변환한다.
// 계정 존재 여부를 구체적으로 노출하지 않기 위해 실패 사유는 최대한 뭉뚱그린다.
export function describeAuthError(error, context = "login") {
  const message = String(error?.message || "").toLowerCase();

  if (message.includes("invalid login credentials")) {
    return "이메일 또는 비밀번호를 확인해 주세요.";
  }
  if (message.includes("email not confirmed") || message.includes("email_not_confirmed")) {
    return "이메일 확인 후 로그인해 주세요.";
  }
  if (message.includes("password") && (message.includes("short") || message.includes("at least") || message.includes("characters"))) {
    return "비밀번호는 8자 이상이며 영문 대문자, 소문자, 숫자, 특수문자를 각각 포함해야 합니다.";
  }
  if (message.includes("rate limit") || message.includes("too many requests")) {
    return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  }

  if (context === "password-reset-request") {
    return "비밀번호 재설정 메일을 보내지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.";
  }
  if (context === "password-reset-update") {
    // Supabase Auth(GoTrue)는 새 비밀번호가 기존 비밀번호와 같으면 error.code === "same_password"
    // (메시지: "New password should be different from the old password.")를 반환한다.
    if (error?.code === "same_password" || message === "new password should be different from the old password.") {
      return "새 비밀번호는 현재 사용 중인 비밀번호와 달라야 합니다.";
    }
    return "비밀번호를 변경하지 못했습니다. 링크를 다시 확인하거나 재설정 메일을 새로 요청해 주세요.";
  }

  return context === "signup"
    ? "회원가입을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요."
    : "로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}
