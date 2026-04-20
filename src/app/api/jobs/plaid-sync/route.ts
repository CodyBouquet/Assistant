import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { db } from "@/db";
import { users } from "@/db/schema";
import { syncAllForUser } from "@/lib/plaid";
import { logError } from "@/lib/logger";

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
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
  for (const u of allUsers) {
    try {
      await syncAllForUser(u.id);
    } catch (err) {
      logError("plaid-sync.job", err, { userId: u.id });
    }
  }
  return NextResponse.json({ ok: true, count: allUsers.length });
}

export const GET = POST;
