import { NextResponse } from "next/server";
import { z } from "zod";
import { exchangePublicToken } from "@/lib/plaid";
import { deriveBudgetsForUser } from "@/lib/budget";
import { auth } from "@/lib/auth";

const bodySchema = z.object({ publicToken: z.string().min(1) });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const json = await req.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const item = await exchangePublicToken(session.user.id, parsed.data.publicToken);
  // After first link, auto-derive budgets from history.
  try {
    await deriveBudgetsForUser(session.user.id);
  } catch {
    // non-fatal; user can trigger manually from settings
  }
  return NextResponse.json({ ok: true, itemId: item.id });
}
