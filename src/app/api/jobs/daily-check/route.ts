import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { db } from "@/db";
import { users } from "@/db/schema";
import { runClaude } from "@/lib/claude";
import { syncAllForUser } from "@/lib/plaid";
import { logError } from "@/lib/logger";

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  // Constant-time comparison; guards against timing attacks.
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const allUsers = await db.select({ id: users.id }).from(users);
  const results: Array<{ userId: string; sent: string }> = [];

  for (const u of allUsers) {
    try {
      await syncAllForUser(u.id);
    } catch (err) {
      logError("daily-check.plaid-sync", err, { userId: u.id });
    }

    try {
      const { finalText } = await runClaude({
        mode: "proactive",
        ctx: { userId: u.id, mode: "proactive" },
        messages: [
          {
            role: "user",
            content:
              "Run today's scheduled check. Review upcoming bills, budget status, and unusual transactions. Text me only if something warrants it; otherwise reply SILENT.",
          },
        ],
      });
      results.push({ userId: u.id, sent: finalText });
    } catch (err) {
      logError("daily-check.claude", err, { userId: u.id });
    }
  }

  return NextResponse.json({ ok: true, count: results.length });
}

export const GET = POST;
