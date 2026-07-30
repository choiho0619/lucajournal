import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: "google",
    // 로그인을 시작한 origin + 현재 경로로 복귀시켜, 로컬(localhost)과 운영(lucajournal.com)
    // 양쪽 모두 로그인 시작 화면(예: /write)으로 돌아오게 한다.
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
}

export function signOut() {
  return supabase.auth.signOut();
}

export function onAuthStateChanged(callback) {
  return supabase.auth.onAuthStateChange(callback);
}
