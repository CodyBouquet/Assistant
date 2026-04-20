import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { runClaude } from "@/lib/claude";
import { chatLimiter } from "@/lib/ratelimit";
import { logError } from "@/lib/logger";

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      })
    )
    .min(1)
    .max(40),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const rl = chatLimiter.check(userId);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate limited", resetAt: rl.resetAt },
      { status: 429 }
    );
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  try {
    const { finalText } = await runClaude({
      mode: "reactive",
      ctx: { userId, mode: "reactive" },
      messages: parsed.data.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });
    return NextResponse.json({ reply: finalText });
  } catch (err) {
    logError("chat", err, { userId });
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
