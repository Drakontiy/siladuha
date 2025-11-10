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
const TELEGRAM_POLL_ATTEMPTS = 40; // ~6 seconds

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
    // Игнорируем ошибки (например, в приватном режиме)
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

const parseTelegramUserFromUnsafe = (): MiniAppUser | null => {
  try {
    const telegram = (window as unknown as {
      Telegram?: {
        WebApp?: {
          initDataUnsafe?: {
            user?: { id?: number; first_name?: string; last_name?: string; username?: string };
          };
          ready?: () => void;
        };
      };
    }).Telegram;

    const user = telegram?.WebApp?.initDataUnsafe?.user;
    if (!user?.id) {
      return null;
    }

    telegram?.WebApp?.ready?.();

    const firstName = user.first_name ?? '';
    const lastName = user.last_name ?? '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

    return {
      userId: String(user.id),
      name: fullName || undefined,
      username: user.username ?? null,
    };
  } catch {
    return null;
  }
};

const parseTelegramUserFromInitData = (): MiniAppUser | null => {
  try {
    const telegram = (window as unknown as {
      Telegram?: {
        WebApp?: {
          initData?: string;
          ready?: () => void;
        };
      };
    }).Telegram;

    const rawInitData = telegram?.WebApp?.initData;
    if (!rawInitData || rawInitData.length === 0) {
      return null;
    }

    const params = new URLSearchParams(rawInitData);
    const userJson = params.get('user');
    if (!userJson) {
      return null;
    }

    const parsed = JSON.parse(userJson) as {
      id?: number;
      first_name?: string;
      last_name?: string;
      username?: string;
    };

    if (!parsed?.id) {
      return null;
    }

    telegram?.WebApp?.ready?.();

    const firstName = parsed.first_name ?? '';
    const lastName = parsed.last_name ?? '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

    return {
      userId: String(parsed.id),
      name: fullName || undefined,
      username: parsed.username ?? null,
    };
  } catch {
    return null;
  }
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
    const fromQuery = parseUserFromQuery();
    if (fromQuery) {
      setActiveUser(fromQuery);
      return activeUser;
    }

    const telegramImmediate = parseUserFromTelegram();
    if (telegramImmediate) {
      setActiveUser(telegramImmediate);
      return activeUser;
    }

    const telegramAsync = await waitForTelegramUser();
    if (telegramAsync) {
      setActiveUser(telegramAsync);
      return activeUser;
    }

    const lastKnown = loadLastKnownUser();
    setActiveUser(lastKnown ?? { userId: DEFAULT_USER_ID });
    return activeUser;
  })();

  return identityPromise;
};

export const getActiveUser = (): MiniAppUser => activeUser;

export const getUserScopedStorageKey = (baseKey: string): string => {
  const userId = activeUser.userId || DEFAULT_USER_ID;
  return `${STORAGE_PREFIX}:${userId}:${baseKey}`;
};
