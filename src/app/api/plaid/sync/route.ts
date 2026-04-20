import { NextResponse } from "next/server";
import { syncAllForUser } from "@/lib/plaid";
import { auth } from "@/lib/auth";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await syncAllForUser(session.user.id);
  return NextResponse.json({ ok: true });
}
