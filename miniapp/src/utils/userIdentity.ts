import { buildApiUrl } from './api';

type MaybeNullable<T> = T | null | undefined;

export type MiniAppUser = {
  userId: string;
  name?: string;
  username?: string | null;
};

export const DEFAULT_USER_ID = 'local';
const LAST_USER_ID_KEY = 'max_last_user_id';
const LAST_USER_NAME_KEY = 'max_last_user_name';
const STORAGE_PREFIX = 'max_miniapp';
const TELEGRAM_POLL_INTERVAL_MS = 150;
const TELEGRAM_POLL_ATTEMPTS = 40; // ~6 секунд ожидания
const MESSENGER_WAIT_TIMEOUT_MS = 6000;
const MESSENGER_REQUEST_INTERVAL_MS = 250;

let activeUser: MiniAppUser = { userId: DEFAULT_USER_ID };
let identityPromise: Promise<MiniAppUser> | null = null;

const safeLocalStorageGet = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeLocalStorageSet = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Игнорируем ошибки (например, приватный режим)
  }
};

const ensureString = (value: MaybeNullable<unknown>): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
};

const buildFullName = (source: Record<string, unknown>): string | undefined => {
  const display = ensureString(
    source.display_name ??
      source.displayName ??
      source.full_name ??
      source.fullName ??
      source.name ??
      source.title,
  );
  if (display) {
    return display;
  }

  const first = ensureString(source.first_name ?? source.firstName);
  const last = ensureString(source.last_name ?? source.lastName);
  const combined = [first, last].filter(Boolean).join(' ').trim();
  return combined.length > 0 ? combined : undefined;
};

const extractUserFromObject = (source: Record<string, unknown>): MiniAppUser | null => {
  const userId =
    ensureString(
      source.userId ??
        source.user_id ??
        source.id ??
        source.uid ??
        source.userID ??
        source.profile_id ??
        source.profileId,
    ) ?? null;

  if (!userId) {
    return null;
  }

  const name = buildFullName(source);
  const username = ensureString(source.username ?? source.login ?? source.nick ?? source.nickname) ?? null;

  return {
    userId,
    name,
    username,
  };
};

const extractUserFromUnknown = (input: unknown): MiniAppUser | null => {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const record = input as Record<string, unknown>;

  const direct = extractUserFromObject(record);
  if (direct) {
    return direct;
  }

  const possibleNestedKeys = [
    'user',
    'profile',
    'from',
    'sender',
    'payload',
    'context',
    'data',
    'account',
  ];

  for (const key of possibleNestedKeys) {
    const nested = record[key];
    if (nested && typeof nested === 'object') {
      const extracted = extractUserFromUnknown(nested);
      if (extracted) {
        return extracted;
      }
    }
  }

  return null;
};

const tryParseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const getSessionTokenFromQuery = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('session_token');
    if (!token) {
      return null;
    }
    const trimmed = token.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
};

const removeSessionTokenFromUrl = () => {
  if (typeof window === 'undefined' || typeof window.history?.replaceState !== 'function') {
    return;
  }
  try {
    const currentUrl = new URL(window.location.href);
    if (!currentUrl.searchParams.has('session_token')) {
      return;
    }
    currentUrl.searchParams.delete('session_token');
    window.history.replaceState({}, document.title, currentUrl.toString());
  } catch {
    // ignore
  }
};

const exchangeSessionToken = async (token: string): Promise<MiniAppUser | null> => {
  try {
    const response = await fetch(buildApiUrl('/api/auth/session/exchange'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      user?: {
        userId?: string;
        name?: string | null;
        username?: string | null;
      };
    };

    const user = payload?.user;
    if (!user?.userId) {
      return null;
    }

    return {
      userId: user.userId,
      name: user.name ?? undefined,
      username: user.username ?? null,
    };
  } catch (error) {
    console.warn('Failed to exchange session token:', error);
    return null;
  }
};

const parseUserFromQuery = (): MiniAppUser | null => {
  try {
    const params = new URLSearchParams(window.location.search);
    const userId = params.get('user_id');

    if (!userId) {
      return null;
    }

    const name = params.get('user_name') ?? undefined;
    const username = params.get('username');

    return {
      userId,
      name,
      username,
    };
  } catch {
    return null;
  }
};

const readUserFromMessengerGlobals = (): MiniAppUser | null => {
  try {
    const globalAny = window as unknown as Record<string, unknown>;
    const candidates = [
      globalAny.__MAX_USER__,
      (globalAny.__MAX_CONTEXT__ as Record<string, unknown> | undefined)?.user,
      globalAny.__MAX_CONTEXT__,
      globalAny.MAX_USER,
      globalAny.maxUser,
      (globalAny.MAX_CONTEXT as Record<string, unknown> | undefined)?.user,
      (globalAny.MAX as Record<string, unknown> | undefined)?.user,
      (globalAny.MAX as Record<string, unknown> | undefined)?.context,
      (globalAny.MAX_APP as Record<string, unknown> | undefined)?.user,
    ];

    for (const candidate of candidates) {
      const extracted = extractUserFromUnknown(candidate);
      if (extracted) {
        return extracted;
      }
    }
  } catch {
    // ignore
  }
  return null;
};

const requestMessengerContext = () => {
  if (typeof window === 'undefined' || window === window.parent) {
    return;
  }

  const payloads = [
    { type: 'max:getUser' },
    { type: 'max:getContext' },
    { type: 'miniapp:getUser' },
    { type: 'miniapp:getContext' },
    { type: 'getUser' },
    { type: 'getContext' },
    { method: 'getUser' },
    { method: 'getContext' },
  ];

  for (const payload of payloads) {
    try {
      window.parent?.postMessage(payload, '*');
    } catch {
      // ignore
    }
    try {
      window.parent?.postMessage(JSON.stringify(payload), '*');
    } catch {
      // ignore
    }
  }
};

const waitForMessengerUser = async (): Promise<MiniAppUser | null> => {
  if (typeof window === 'undefined') {
    return null;
  }

  const immediate = readUserFromMessengerGlobals();
  if (immediate) {
    return immediate;
  }

  return new Promise<MiniAppUser | null>((resolve) => {
    let resolved = false;

    const tryResolve = (input?: unknown) => {
      if (resolved) {
        return;
      }
      const fromInput = input ? extractUserFromUnknown(input) : null;
      const candidate = fromInput ?? readUserFromMessengerGlobals();
      if (candidate) {
        resolved = true;
        cleanup();
        resolve(candidate);
      }
    };

    const onMessage = (event: MessageEvent) => {
      if (resolved) {
        return;
      }
      tryResolve(event.data);
      if (typeof event.data === 'string') {
        tryResolve(tryParseJson(event.data));
      }
    };

    const sendRequests = () => {
      requestMessengerContext();
      tryResolve();
    };

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };

    window.addEventListener('message', onMessage);

    const intervalId = window.setInterval(sendRequests, MESSENGER_REQUEST_INTERVAL_MS);
    const timeoutId = window.setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(null);
      }
    }, MESSENGER_WAIT_TIMEOUT_MS);

    sendRequests();
  });
};

const telegramEnv = (): MaybeNullable<{
  WebApp?: { initDataUnsafe?: unknown; initData?: string; ready?: () => void };
}> => {
  try {
    return (window as unknown as { Telegram?: { WebApp?: { initDataUnsafe?: unknown; initData?: string; ready?: () => void } } })
      .Telegram;
  } catch {
    return null;
  }
};

const parseTelegramUserFromUnsafe = (): MiniAppUser | null => {
  const telegram = telegramEnv();
  const user = (telegram?.WebApp?.initDataUnsafe as { user?: Record<string, unknown> } | undefined)?.user;
  if (!user) {
    return null;
  }

  const extracted = extractUserFromUnknown(user);
  if (extracted) {
    telegram?.WebApp?.ready?.();
  }
  return extracted;
};

const parseTelegramUserFromInitData = (): MiniAppUser | null => {
  const telegram = telegramEnv();
  const rawInitData = telegram?.WebApp?.initData;
  if (!rawInitData) {
    return null;
  }

  const params = new URLSearchParams(rawInitData);
  const userJson = params.get('user');
  if (!userJson) {
    return null;
  }

  const parsed = tryParseJson(userJson);
  const extracted = extractUserFromUnknown(parsed);
  if (extracted) {
    telegram?.WebApp?.ready?.();
  }
  return extracted;
};

const parseUserFromTelegram = (): MiniAppUser | null =>
  parseTelegramUserFromUnsafe() ?? parseTelegramUserFromInitData();

const loadLastKnownUser = (): MiniAppUser | null => {
  const lastUserId = safeLocalStorageGet(LAST_USER_ID_KEY);
  if (!lastUserId) {
    return null;
  }

  const name = safeLocalStorageGet(LAST_USER_NAME_KEY) ?? undefined;

  return {
    userId: lastUserId,
    name,
  };
};

const waitForTelegramUser = async (): Promise<MiniAppUser | null> => {
  for (let attempt = 0; attempt < TELEGRAM_POLL_ATTEMPTS; attempt += 1) {
    const user = parseUserFromTelegram();
    if (user) {
      return user;
    }
    await new Promise((resolve) => setTimeout(resolve, TELEGRAM_POLL_INTERVAL_MS));
  }
  return null;
};

const persistActiveUser = (user: MiniAppUser) => {
  safeLocalStorageSet(LAST_USER_ID_KEY, user.userId);
  if (user.name) {
    safeLocalStorageSet(LAST_USER_NAME_KEY, user.name);
  }
};

const setActiveUser = (user: MiniAppUser) => {
  activeUser = user;
  persistActiveUser(user);
};

export const initializeUserIdentity = async (): Promise<MiniAppUser> => {
  if (identityPromise) {
    return identityPromise;
  }

  identityPromise = (async () => {
    const sessionToken = getSessionTokenFromQuery();
    if (sessionToken) {
      const tokenUser = await exchangeSessionToken(sessionToken);
      if (tokenUser) {
        setActiveUser(tokenUser);
        removeSessionTokenFromUrl();
        return activeUser;
      }
    }

    const fromQuery = parseUserFromQuery();
    if (fromQuery) {
      setActiveUser(fromQuery);
      return activeUser;
    }

    const messengerImmediate = readUserFromMessengerGlobals();
    if (messengerImmediate) {
      setActiveUser(messengerImmediate);
      return activeUser;
    }

    const telegramImmediate = parseUserFromTelegram();
    if (telegramImmediate) {
      setActiveUser(telegramImmediate);
      return activeUser;
    }

    const [messengerAsync, telegramAsync] = await Promise.all([
      waitForMessengerUser(),
      waitForTelegramUser(),
    ]);

    const resolvedUser = messengerAsync ?? telegramAsync ?? loadLastKnownUser();
    setActiveUser(resolvedUser ?? { userId: DEFAULT_USER_ID });
    return activeUser;
  })();

  return identityPromise;
};

export const getActiveUser = (): MiniAppUser => activeUser;

export const getUserScopedStorageKey = (baseKey: string): string => {
  const userId = activeUser.userId || DEFAULT_USER_ID;
  return `${STORAGE_PREFIX}:${userId}:${baseKey}`;
};
