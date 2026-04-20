import { NextResponse } from "next/server";
import { createLinkToken } from "@/lib/plaid";
import { auth } from "@/lib/auth";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const token = await createLinkToken(session.user.id);
  return NextResponse.json({ linkToken: token });
}
