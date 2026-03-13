import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { logger } from "./logger";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;
const KEY_LENGTH_BYTES = 32;
const ENCRYPTION_KEY_HEX_REGEX = /^[0-9a-fA-F]{64}$/;

function resolveEncryptionKey(): Buffer {
  const configuredKey = process.env.ENCRYPTION_KEY?.trim();

  if (configuredKey) {
    if (!ENCRYPTION_KEY_HEX_REGEX.test(configuredKey)) {
      throw new Error("ENCRYPTION_KEY must be a 32-byte hex string (64 hex characters)");
    }

    return Buffer.from(configuredKey, "hex");
  }

  const generatedKey = randomBytes(KEY_LENGTH_BYTES).toString("hex");
  process.env.ENCRYPTION_KEY = generatedKey;

  logger.warn(
    { encryptionKey: generatedKey },
    "ENCRYPTION_KEY is missing. Add this 32-byte hex string to .env to keep encrypted project env vars readable after restart."
  );

  return Buffer.from(generatedKey, "hex");
}

const encryptionKey = resolveEncryptionKey();

export function encrypt(text: string): string {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(text: string): string {
  const [ivHex, authTagHex, encryptedHex] = text.split(":");

  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error("Invalid encrypted payload format");
  }

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");

  if (iv.length !== IV_LENGTH_BYTES || authTag.length !== AUTH_TAG_LENGTH_BYTES) {
    throw new Error("Invalid encrypted payload components");
  }

  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, encryptionKey, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
