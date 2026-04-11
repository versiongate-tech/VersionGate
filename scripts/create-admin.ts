#!/usr/bin/env bun
/**
 * Create the first dashboard user when the User table is empty.
 * Loads `.env` like the API (DATABASE_URL required).
 *
 *   bun run create-admin you@example.com 'your-secure-password'
 */
import "../src/config/env";
import { disconnectPrisma } from "../src/prisma/client";
import prisma from "../src/prisma/client";
import {
  AUTH_MIN_PASSWORD_LENGTH,
  hashPassword,
  isValidEmail,
} from "../src/services/auth.service";

const emailRaw = process.argv[2];
const password = process.argv[3];

if (!emailRaw || !password) {
  console.error("Usage: bun run create-admin <email> <password>");
  console.error(`Password must be at least ${AUTH_MIN_PASSWORD_LENGTH} characters.`);
  process.exit(1);
}

const email = emailRaw.trim().toLowerCase();

if (!process.env.DATABASE_URL?.trim()) {
  console.error("DATABASE_URL is not set. Add it to .env or the environment, then retry.");
  process.exit(1);
}

if (!isValidEmail(email)) {
  console.error("Invalid email.");
  process.exit(1);
}

if (password.length < AUTH_MIN_PASSWORD_LENGTH) {
  console.error(`Password must be at least ${AUTH_MIN_PASSWORD_LENGTH} characters.`);
  process.exit(1);
}

try {
  const n = await prisma.user.count();
  if (n > 0) {
    console.error(
      "At least one user already exists. Sign in at the dashboard; this script only bootstraps an empty database."
    );
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.create({
    data: { email, passwordHash },
  });

  console.log(`Created administrator ${email}. Open the dashboard and sign in.`);
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("Failed:", msg);
  process.exit(1);
} finally {
  await disconnectPrisma();
}
