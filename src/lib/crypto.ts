import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// AES-256-GCM envelope encryption for secrets at rest.
// The key never leaves env (Railway env vars). If the DB is dumped without
// the env key, ciphertext is useless.

const ALG = "aes-256-gcm";

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY is not set. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY must decode to exactly 32 bytes (base64 of 32 random bytes)"
    );
  }
  return key;
}

// Stored format: v1:<iv_b64>:<tag_b64>:<ciphertext_b64>
// The "v1" prefix lets us rotate schemes later without breaking old rows.
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Invalid encrypted payload (unexpected format)");
  }
  const [, ivB, tagB, ctB] = parts;
  const iv = Buffer.from(ivB, "base64");
  const tag = Buffer.from(tagB, "base64");
  const ct = Buffer.from(ctB, "base64");
  const decipher = createDecipheriv(ALG, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
    "utf8"
  );
}

export function isEncrypted(payload: string): boolean {
  return payload.startsWith("v1:") && payload.split(":").length === 4;
}
