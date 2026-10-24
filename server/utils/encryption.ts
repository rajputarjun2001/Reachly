import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const PREFIX = "enc:v1:";

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters");
  }
  return Buffer.from(hex, "hex");
}

/** Output format: enc:v1:<iv>:<authTag>:<ciphertext>, all base64. */
export function encrypt(text: string): string {
  if (text === undefined || text === null) throw new Error("Cannot encrypt empty value");
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function isEncrypted(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(PREFIX) && value.split(":").length === 5;
}

export function decrypt(payload: string): string {
  if (!isEncrypted(payload)) throw new Error("Value is not an encrypted payload");
  const [iv, tag, ciphertext] = payload.slice(PREFIX.length).split(":");
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
}

export function encryptJSON(value: unknown): string {
  return encrypt(JSON.stringify(value));
}

export function decryptJSON<T = unknown>(payload: string): T {
  return JSON.parse(decrypt(payload)) as T;
}
