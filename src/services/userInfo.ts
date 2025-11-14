import { bot } from '../bot';
import { StoredFriend } from '../storage/userStateStore';

/**
 * Преобразует строковый user_id в числовой формат для MAX Bot API
 */
const toNumericUserId = (userId: string): number | null => {
  if (!userId) {
    return null;
  }
  const numeric = Number(userId);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return numeric;
};

/**
 * Получает информацию о пользователе через MAX Bot API
 * Возвращает имя пользователя, если доступно
 */
export const getUserNameFromBot = async (userId: string): Promise<string | null> => {
  try {
    if (!bot?.api) {
      console.warn('⚠️ Bot API is not available to get user info.');
      return null;
    }

    const numericUserId = toNumericUserId(userId);
    if (numericUserId === null) {
      return null;
    }

    // Пытаемся получить информацию о пользователе через bot API
    // Если метод недоступен, возвращаем null
    try {
      // Проверяем, есть ли метод getUserInfo или аналогичный
      // Если метод недоступен, пытаемся другой подход
      if (typeof (bot.api as any).getUserInfo === 'function') {
        const userInfo = await (bot.api as any).getUserInfo(numericUserId);
        if (userInfo?.first_name || userInfo?.last_name) {
          const firstName = userInfo.first_name || '';
          const lastName = userInfo.last_name || '';
          return [firstName, lastName].filter(Boolean).join(' ').trim() || null;
        }
        if (userInfo?.name) {
          return userInfo.name.trim() || null;
        }
      }
    } catch (apiError) {
      // Метод может быть недоступен, игнорируем ошибку
      console.debug(`⚠️ Unable to get user info for ${userId}:`, apiError);
    }

    // Альтернативный подход: пробуем отправить тестовое сообщение и получить информацию
    // Но это не совсем правильно, так как пользователь получит сообщение
    // Поэтому лучше не использовать этот подход

    return null;
  } catch (error) {
    console.warn(`⚠️ Failed to get user name for ${userId}:`, error);
    return null;
  }
};

/**
 * Обновляет имена друзей в социальном состоянии, получая их через бота
 * Обновляет только те имена, которые отсутствуют или могут быть обновлены
 */
export const updateFriendNames = async (
  friends: StoredFriend[],
  updateAll: boolean = false,
): Promise<StoredFriend[]> => {
  if (!friends || friends.length === 0) {
    return friends;
  }

  const updatedFriends = [...friends];
  let hasUpdates = false;

  // Обновляем имена друзей асинхронно, но не ждём все запросы
  const updatePromises = updatedFriends.map(async (friend, index) => {
    // Обновляем только если имя отсутствует или updateAll = true
    if (!updateAll && friend.displayName) {
      return; // Пропускаем, если имя уже есть
    }

    try {
      const userName = await getUserNameFromBot(friend.userId);
      if (userName && userName !== friend.displayName) {
        updatedFriends[index] = {
          ...friend,
          displayName: userName,
          updatedAt: new Date().toISOString(),
        };
        hasUpdates = true;
      }
    } catch (error) {
      // Игнорируем ошибки при обновлении отдельного имени
      console.debug(`⚠️ Failed to update name for friend ${friend.userId}:`, error);
    }
  });

  // Ждём обновления всех имён (с таймаутом)
  await Promise.race([
    Promise.all(updatePromises),
    new Promise((resolve) => setTimeout(resolve, 2000)), // Таймаут 2 секунды
  ]);

  return hasUpdates ? updatedFriends : friends;
};

