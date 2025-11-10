import { randomUUID } from 'crypto';

export interface SessionUser {
  userId: string;
  name?: string | null;
  username?: string | null;
}

interface SessionTokenRecord extends SessionUser {
  token: string;
  createdAt: number;
  expiresAt: number;
}

const ONE_TIME_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 минут
const CLEANUP_INTERVAL_MS = 60 * 1000;

const tokenStorage = new Map<string, SessionTokenRecord>();

const now = () => Date.now();

const sanitizeUser = (user: SessionUser): SessionUser => ({
  userId: user.userId.trim(),
  name: user.name?.toString() ?? undefined,
  username: user.username?.toString() ?? null,
});

export const createSessionToken = (user: SessionUser, ttlMs: number = ONE_TIME_TOKEN_TTL_MS): string => {
  const sanitized = sanitizeUser(user);
  if (!sanitized.userId) {
    throw new Error('Cannot create session token without userId');
  }

  const token = randomUUID();
  const record: SessionTokenRecord = {
    ...sanitized,
    token,
    createdAt: now(),
    expiresAt: now() + Math.max(ttlMs, 1_000),
  };

  tokenStorage.set(token, record);
  return token;
};

export const consumeSessionToken = (token: string): SessionUser | null => {
  const record = tokenStorage.get(token);
  if (!record) {
    return null;
  }

  tokenStorage.delete(token);

  if (record.expiresAt <= now()) {
    return null;
  }

  return {
    userId: record.userId,
    name: record.name ?? undefined,
    username: record.username ?? null,
  };
};

const cleanupExpiredTokens = () => {
  const timestamp = now();
  for (const [token, record] of tokenStorage.entries()) {
    if (record.expiresAt <= timestamp) {
      tokenStorage.delete(token);
    }
  }
};

const cleanupTimer = setInterval(cleanupExpiredTokens, CLEANUP_INTERVAL_MS);
if (typeof cleanupTimer.unref === 'function') {
  cleanupTimer.unref();
}


