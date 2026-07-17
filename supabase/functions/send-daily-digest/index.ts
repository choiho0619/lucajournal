import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_URL = "https://api.resend.com/emails";
const SITE_URL = "https://lucajournal.com";

type DigestPost = {
  slug: string;
  title: string;
  excerpt: string | null;
  published_at: string;
  categories: { name: string; code: string } | null;
};

function buildEmailHtml(posts: DigestPost[], confirmToken: string): string {
  const unsubscribeUrl = `${SITE_URL}/unsubscribe.html?token=${encodeURIComponent(confirmToken)}`;

  const postsHtml = posts
    .map((post) => {
      const postUrl = `${SITE_URL}/post.html?slug=${encodeURIComponent(post.slug)}`;
      const categoryName = post.categories?.name ?? "";
      const excerptHtml = post.excerpt
        ? `<p style="margin:4px 0 0;font-size:14px;line-height:1.6;color:#6b6b6b;">${post.excerpt}</p>`
        : "";

      return `
        <li style="margin:0 0 20px;">
          <span style="font-size:12.5px;color:#854F0B;font-weight:600;">[${categoryName}]</span>
          <a href="${postUrl}" style="display:block;font-size:16px;font-weight:600;color:#201f1d;text-decoration:none;margin-top:2px;">
            ${post.title}
          </a>
          ${excerptHtml}
        </li>
      `;
    })
    .join("");

  return `
    <div style="font-family: 'Noto Serif KR', serif; max-width: 600px; margin: 0 auto; padding: 32px 24px;">
      <p style="font-size: 16px; line-height: 1.7; color: #201f1d;">
        오늘 루카저널에 새로 올라온 글을 전해드립니다.
      </p>
      <ul style="list-style:none;padding:0;margin:24px 0;">
        ${postsHtml}
      </ul>
      <p style="font-size: 12px; color: #999999; margin-top: 40px;">
        더 이상 메일을 받고 싶지 않으시면
        <a href="${unsubscribeUrl}" style="color:#999999;">수신거부</a>
        를 눌러주세요.
      </p>
    </div>
  `;
}

Deno.serve(async (req: Request) => {
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
  const providedSecret = req.headers.get("x-webhook-secret");

  if (!webhookSecret || providedSecret !== webhookSecret) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    return new Response(
      JSON.stringify({ success: false, error: "RESEND_API_KEY가 설정되지 않았습니다" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return new Response(
      JSON.stringify({ success: false, error: "Supabase 환경변수가 설정되지 않았습니다" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: posts, error: postsError } = await supabase
      .from("posts")
      .select("slug, title, excerpt, published_at, categories(name, code)")
      .eq("status", "published")
      .gte("published_at", since)
      .order("published_at", { ascending: false });

    if (postsError) {
      return new Response(JSON.stringify({ success: false, error: postsError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!posts || posts.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no posts" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: subscribers, error: subsError } = await supabase
      .from("subscriptions")
      .select("email, confirm_token")
      .eq("is_confirmed", true)
      .eq("channel", "email");

    if (subsError) {
      return new Response(JSON.stringify({ success: false, error: subsError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!subscribers || subscribers.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no subscribers" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const subject = `오늘의 루카저널 — 새 글 ${posts.length}편`;

    let sent = 0;
    let failed = 0;

    for (const subscriber of subscribers) {
      try {
        const resendResponse = await fetch(RESEND_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "루카저널 <subscribe@lucajournal.com>",
            to: subscriber.email,
            subject,
            html: buildEmailHtml(posts as DigestPost[], subscriber.confirm_token),
          }),
        });

        if (resendResponse.ok) {
          sent += 1;
        } else {
          failed += 1;
        }
      } catch {
        failed += 1;
      }
    }

    return new Response(JSON.stringify({ sent, failed }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "알 수 없는 오류" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
