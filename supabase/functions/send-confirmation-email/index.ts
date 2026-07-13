const RESEND_API_URL = "https://api.resend.com/emails";

function buildEmailHtml(confirmToken: string): string {
  const confirmUrl = `https://lucajournal.com/confirm.html?token=${encodeURIComponent(confirmToken)}`;

  return `
    <div style="font-family: 'Noto Serif KR', serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
      <p style="font-size: 16px; line-height: 1.7; color: #201f1d;">
        루카저널 구독을 신청해주셔서 감사합니다.<br>
        아래 버튼을 눌러 구독을 확인해주세요.
      </p>
      <p style="margin: 28px 0;">
        <a href="${confirmUrl}"
           style="display:inline-block;padding:12px 24px;background:#854F0B;color:#ffffff;
                  border-radius:8px;text-decoration:none;font-size:14px;">
          구독 확인하기
        </a>
      </p>
      <p style="font-size: 13px; color: #6b6b6b;">
        버튼이 동작하지 않으면 아래 링크를 브라우저에 붙여넣어 주세요.<br>
        ${confirmUrl}
      </p>
    </div>
  `;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log("수신 헤더 키 목록", Array.from(req.headers.keys()));

  const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
  const providedSecret = req.headers.get("x-webhook-secret");

  if (!webhookSecret || providedSecret !== webhookSecret) {
    console.log("webhook secret 검증 실패", {
      headerPresent: providedSecret !== null,
      headerLength: providedSecret?.length ?? 0,
      headerTrimmedLength: providedSecret?.trim().length ?? 0,
      envPresent: webhookSecret !== undefined,
      envLength: webhookSecret?.length ?? 0,
      envTrimmedLength: webhookSecret?.trim().length ?? 0,
    });

    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { email, confirm_token } = await req.json();

    if (!email || !confirm_token) {
      return new Response(
        JSON.stringify({ success: false, error: "email과 confirm_token이 필요합니다" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "RESEND_API_KEY가 설정되지 않았습니다" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const resendResponse = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "루카저널 <subscribe@lucajournal.com>",
        to: email,
        subject: "[루카저널] 구독을 확인해주세요",
        html: buildEmailHtml(confirm_token),
      }),
    });

    if (!resendResponse.ok) {
      const errorBody = await resendResponse.text();
      return new Response(
        JSON.stringify({ success: false, error: `Resend API 오류: ${errorBody}` }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ success: true }), {
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
