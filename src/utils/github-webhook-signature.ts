import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verifies GitHub `X-Hub-Signature-256` (HMAC SHA256 of raw body).
 */
export function verifyGithubWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const receivedHex = signatureHeader.slice("sha256=".length);
  const expectedHex = createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    const a = Buffer.from(receivedHex, "hex");
    const b = Buffer.from(expectedHex, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
