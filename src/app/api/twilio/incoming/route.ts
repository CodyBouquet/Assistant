import { NextResponse } from "next/server";
import twilio from "twilio";
import { db } from "@/db";
import { smsMessages } from "@/db/schema";
import { resolveUserByPhone } from "@/lib/twilio";
import { runClaude } from "@/lib/claude";
import { clientKey, webhookLimiter } from "@/lib/ratelimit";
import { logError } from "@/lib/logger";

// Twilio posts application/x-www-form-urlencoded.
async function formToObject(req: Request) {
  const text = await req.text();
  const params = new URLSearchParams(text);
  const obj: Record<string, string> = {};
  params.forEach((v, k) => {
    obj[k] = v;
  });
  return obj;
}

function validate(req: Request, params: Record<string, string>) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.headers.get("x-twilio-signature");
  if (!token || !signature) return false;
  return twilio.validateRequest(token, signature, req.url, params);
}

function twiml(message: string) {
  const escaped = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
}

function silent() {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response/>`,
    { headers: { "Content-Type": "text/xml" } }
  );
}

export async function POST(req: Request) {
  // Rate limit by IP before anything else — protects against flood of
  // unsigned requests hitting the endpoint.
  const rl = webhookLimiter.check(clientKey(req));
  if (!rl.ok) {
    return new NextResponse("rate limited", { status: 429 });
  }

  const obj = await formToObject(req);

  // Always validate signature in production. In dev you can bypass by
  // running a real Twilio test from the console (recommended) rather than
  // disabling the check.
  if (process.env.NODE_ENV === "production" && !validate(req, obj)) {
    return new NextResponse("invalid signature", { status: 403 });
  }

  const from = obj["From"];
  const body = (obj["Body"] ?? "").trim();
  if (!from || !body) return silent();

  // Phone allow-list: strict exact-match against a registered owner phone.
  // An unregistered number gets a silent response — we neither confirm nor
  // deny that the number exists in the system.
  const userId = await resolveUserByPhone(from);
  if (!userId) return silent();

  await db.insert(smsMessages).values({
    userId,
    direction: "in",
    body,
    twilioSid: obj["MessageSid"] ?? null,
  });

  try {
    const { finalText } = await runClaude({
      mode: "reactive",
      ctx: { userId, mode: "reactive" },
      messages: [{ role: "user", content: body }],
    });

    const reply = finalText.slice(0, 1500);
    await db.insert(smsMessages).values({
      userId,
      direction: "out",
      body: reply,
    });

    return new NextResponse(twiml(reply), {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (err) {
    logError("twilio.incoming", err, { userId });
    return new NextResponse(twiml("Sorry, something went wrong."), {
      headers: { "Content-Type": "text/xml" },
    });
  }
}
