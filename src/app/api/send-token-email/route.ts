import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();
  const { repName, repEmail, password, scheduleUrl } = body;

  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  const webhookSecret = process.env.N8N_WEBHOOK_SECRET;

  if (!webhookUrl)
    return NextResponse.json(
      { error: "N8N_WEBHOOK_URL not configured" },
      { status: 500 },
    );
  if (!repEmail)
    return NextResponse.json({ error: "No email" }, { status: 400 });

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (webhookSecret) headers["X-Webhook-Secret"] = webhookSecret;

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        email_type: "schedule_link",
        to_email: repEmail,
        to_name: repName,
        schedule_url: scheduleUrl,
        password,
        source: "hsl_hearing_system",
        sent_at: new Date().toISOString(),
      }),
    });

    if (response.ok) return NextResponse.json({ success: true });
    return NextResponse.json(
      { error: `HTTP ${response.status}` },
      { status: 500 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown" },
      { status: 500 },
    );
  }
}
