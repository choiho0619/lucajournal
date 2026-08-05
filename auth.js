import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: "google",
    // 로그인을 시작한 origin + 현재 경로 + 쿼리로 복귀시켜, 로컬(localhost)과 운영(lucajournal.com)
    // 양쪽 모두 로그인 시작 화면(예: /write?edit=1, /auth.html?returnTo=...)으로 돌아오게 한다.
    options: { redirectTo: window.location.origin + window.location.pathname + window.location.search },
  });
}

export function signOut() {
  return supabase.auth.signOut();
}

export function onAuthStateChanged(callback) {
  return supabase.auth.onAuthStateChange(callback);
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
    return "비밀번호가 너무 짧습니다. 6자 이상 입력해 주세요.";
  }
  if (message.includes("rate limit") || message.includes("too many requests")) {
    return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  }

  return context === "signup"
    ? "회원가입을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요."
    : "로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}
