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

/**
 * Парсит данные пользователя из URL параметров
 * В MAX мини-приложении данные передаются через URL параметры:
 * - user_id - ID пользователя
 * - user_name - полное имя пользователя (first_name + last_name)
 * - first_name - имя (если передаётся отдельно)
 * - last_name - фамилия (если передаётся отдельно)
 * - username - username пользователя
 */
const parseUserFromMaxUrl = (): MiniAppUser | null => {
  try {
    const params = new URLSearchParams(window.location.search);
    const userId = params.get('user_id');
    
    if (!userId) {
      return null;
    }

    // Пробуем получить имя и фамилию отдельно или полное имя
    const firstName = params.get('first_name');
    const lastName = params.get('last_name');
    const fullName = params.get('user_name');
    const username = params.get('username');

    // Составляем полное имя из отдельных частей или используем переданное
    let name: string | undefined;
    if (firstName || lastName) {
      name = [firstName, lastName].filter(Boolean).join(' ').trim() || undefined;
    } else if (fullName) {
      name = fullName.trim() || undefined;
    }

    return {
      userId,
      name,
      username: username || null,
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
  const fromMaxUrl = parseUserFromMaxUrl();
  const lastKnown = loadLastKnownUser();

  // Приоритет: данные из URL параметров MAX > сохранённый в localStorage
  // parseUserFromQuery и parseUserFromMaxUrl могут возвращать одинаковые данные,
  // но parseUserFromMaxUrl поддерживает first_name и last_name отдельно
  activeUser = fromMaxUrl ?? fromQuery ?? lastKnown ?? { userId: DEFAULT_USER_ID };

  // Если есть данные из URL параметров MAX, обновляем имя даже если user_id из другого источника
  if (fromMaxUrl && fromMaxUrl.name && fromMaxUrl.name !== activeUser.name) {
    activeUser.name = fromMaxUrl.name;
  }

  // Сохраняем только если это не DEFAULT_USER_ID
  if (activeUser.userId !== DEFAULT_USER_ID && activeUser.userId !== 'local') {
    safeLocalStorageSet(LAST_USER_ID_KEY, activeUser.userId);
    if (activeUser.name) {
      safeLocalStorageSet(LAST_USER_NAME_KEY, activeUser.name);
    }
  }

  return activeUser;
};

export const getActiveUser = (): MiniAppUser => activeUser;

export const getUserScopedStorageKey = (baseKey: string): string => {
  const userId = activeUser.userId || DEFAULT_USER_ID;
  return `${STORAGE_PREFIX}:${userId}:${baseKey}`;
};

// Отвязка аккаунта - очистка user_id из localStorage
export const unbindAccount = async (): Promise<void> => {
  try {
    const userId = activeUser.userId;
    
    // Удаляем user_id из localStorage
    try {
      localStorage.removeItem(LAST_USER_ID_KEY);
      localStorage.removeItem(LAST_USER_NAME_KEY);
      // Удаляем все сохраненные коды
      localStorage.removeItem('max_auth_codes');
    } catch (storageError) {
      console.error('Failed to clear localStorage:', storageError);
    }
    
    // Уведомляем сервер об отвязке (опционально)
    if (userId && userId !== DEFAULT_USER_ID && userId !== 'local') {
      try {
        const apiBase = process.env.MINIAPP_API_BASE || window.location.origin;
        await fetch(`${apiBase}/api/auth/unbind-account`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId }),
        });
      } catch (apiError) {
        console.error('Failed to notify server about unbinding:', apiError);
        // Не критично, продолжаем отвязку
      }
    }
    
    // Удаляем user_id из URL перед сбросом activeUser
    const url = new URL(window.location.href);
    url.searchParams.delete('user_id');
    url.searchParams.delete('user_name');
    url.searchParams.delete('username');
    window.history.replaceState({}, '', url.toString());
    
    // Сбрасываем activeUser в последнюю очередь
    activeUser = { userId: DEFAULT_USER_ID };
  } catch (error) {
    console.error('Failed to unbind account:', error);
    throw error;
  }
};

