export type MiniAppUser = {
  userId: string;
  name?: string;
  username?: string | null;
};

export const DEFAULT_USER_ID = 'local';
const LAST_USER_ID_KEY = 'max_last_user_id';
const LAST_USER_NAME_KEY = 'max_last_user_name';
const STORAGE_PREFIX = 'max_miniapp';

let activeUser: MiniAppUser = { userId: DEFAULT_USER_ID };

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

const parseUserFromTelegram = (): MiniAppUser | null => {
  try {
    const telegram = (window as unknown as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { id?: number; first_name?: string; last_name?: string; username?: string } } } } }).Telegram;
    const user = telegram?.WebApp?.initDataUnsafe?.user;
    if (!user?.id) {
      return null;
    }

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

export const initializeUserIdentity = (): MiniAppUser => {
  const fromQuery = parseUserFromQuery();
  const fromTelegram = parseUserFromTelegram();
  const lastKnown = loadLastKnownUser();

  activeUser = fromQuery ?? fromTelegram ?? lastKnown ?? { userId: DEFAULT_USER_ID };

  safeLocalStorageSet(LAST_USER_ID_KEY, activeUser.userId);
  if (activeUser.name) {
    safeLocalStorageSet(LAST_USER_NAME_KEY, activeUser.name);
  }

  return activeUser;
};

export const getActiveUser = (): MiniAppUser => activeUser;

export const getUserScopedStorageKey = (baseKey: string): string => {
  const userId = activeUser.userId || DEFAULT_USER_ID;
  return `${STORAGE_PREFIX}:${userId}:${baseKey}`;
};

