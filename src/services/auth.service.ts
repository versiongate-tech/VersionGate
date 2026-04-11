import { createHash, randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import type { PrismaClient } from "@prisma/client";
import prisma from "../prisma/client";

const scryptAsync = promisify(scrypt);

const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60;

export { SESSION_MAX_AGE_SEC };

/** Minimum password length for dashboard accounts (register, setup admin). */
export const AUTH_MIN_PASSWORD_LENGTH = 10;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(plain, salt, 64)) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [saltHex, hashHex] = parts;
  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const derived = (await scryptAsync(plain, salt, 64)) as Buffer;
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export async function createSession(userId: string): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SEC * 1000);
  await prisma.session.create({
    data: { tokenHash, userId, expiresAt },
  });
  return raw;
}

/** Used during first-time setup before the global Prisma client is reconnected. */
export async function createSessionWithClient(client: PrismaClient, userId: string): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SEC * 1000);
  await client.session.create({
    data: { tokenHash, userId, expiresAt },
  });
  return raw;
}

export async function deleteSessionByRawToken(raw: string | undefined): Promise<void> {
  if (!raw) return;
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(raw) } });
}

export async function getUserFromSessionToken(
  rawToken: string | undefined
): Promise<{ id: string; email: string } | null> {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);
  const row = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!row) return null;
  if (row.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: row.id } }).catch(() => null);
    return null;
  }
  return { id: row.user.id, email: row.user.email };
}

export function isValidEmail(email: string): boolean {
  const t = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}
