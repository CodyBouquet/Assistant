import twilio from "twilio";
import { db } from "@/db";
import { settings, smsMessages } from "@/db/schema";
import { eq } from "drizzle-orm";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

export const twilioClient =
  accountSid && authToken ? twilio(accountSid, authToken) : null;

export async function sendSms(userId: string, body: string): Promise<string> {
  if (!twilioClient || !fromNumber) {
    throw new Error("Twilio is not configured");
  }
  const [s] = await db
    .select({ phone: settings.phone })
    .from(settings)
    .where(eq(settings.userId, userId));
  const to = s?.phone ?? process.env.OWNER_PHONE_NUMBER;
  if (!to) throw new Error("No destination phone number on file");

  const msg = await twilioClient.messages.create({
    from: fromNumber,
    to,
    body,
  });
  await db.insert(smsMessages).values({
    userId,
    direction: "out",
    body,
    twilioSid: msg.sid,
  });
  return msg.sid;
}

// Strict: only return a userId when the From phone EXACTLY matches a
// registered owner phone. No "single user" fallback — we never want an
// unregistered phone to be treated as the owner.
export async function resolveUserByPhone(phone: string): Promise<string | null> {
  if (!phone) return null;
  const [row] = await db
    .select({ userId: settings.userId })
    .from(settings)
    .where(eq(settings.phone, phone));
  return row?.userId ?? null;
}
