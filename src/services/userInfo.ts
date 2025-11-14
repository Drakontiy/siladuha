import { bot } from '../bot';
import { StoredFriend, StoredFriendRequest } from '../storage/userStateStore';
import { getUserName as getCachedUserName, saveUserName as saveCachedUserName } from '../storage/userNameStore';

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
/**
 * Получает имя пользователя из кэша
 * MAX Bot API не имеет метода getUserInfo, поэтому используем сохранённые имена
 */
export const getUserNameFromBot = async (userId: string): Promise<string | null> => {
  // Проверяем сохранённое имя в кэше
  const cachedName = getCachedUserName(userId);
  if (cachedName) {
    console.log(`✅ [USERINFO] Got cached name for ${userId}: ${cachedName}`);
    return cachedName;
  }
  
  // MAX Bot API не имеет метода getUserInfo
  // Имена должны сохраняться из callback при привязке кода, создании заявок и т.д.
  console.log(`⚠️ [USERINFO] No cached name for ${userId}, getUserInfo is not available in MAX Bot API`);
  return null;
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
      // Если имя уже есть, сохраняем его в кэш для будущего использования
      saveCachedUserName(friend.userId, friend.displayName);
      return; // Пропускаем, если имя уже есть
    }

    try {
      // Пытаемся получить имя из кэша или других источников
      const userName = await getUserNameFromBot(friend.userId);
      if (userName) {
        // Сохраняем имя в кэш
        saveCachedUserName(friend.userId, userName);
        
        // Сохраняем имя, даже если оно уже было (может обновиться)
        if (userName !== friend.displayName) {
          updatedFriends[index] = {
            ...friend,
            displayName: userName,
            updatedAt: new Date().toISOString(),
          };
          hasUpdates = true;
          console.log(`✅ Updated name for friend ${friend.userId}: ${friend.displayName || 'null'} -> ${userName}`);
        }
      } else if (friend.displayName) {
        // Если имя не получено, но уже есть в друге, сохраняем его в кэш
        saveCachedUserName(friend.userId, friend.displayName);
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

/**
 * Обновляет имена в заявках в друзья, получая их через бота
 * Обновляет только те имена, которые отсутствуют
 */
export const updateFriendRequestNames = async (
  friendRequests: StoredFriendRequest[],
  updateAll: boolean = false,
): Promise<StoredFriendRequest[]> => {
  if (!friendRequests || friendRequests.length === 0) {
    return friendRequests;
  }

  const updatedRequests = [...friendRequests];
  let hasUpdates = false;

  // Обновляем имена в заявках асинхронно, но не ждём все запросы
  const updatePromises = updatedRequests.map(async (request, index) => {
    // Обновляем только если имя отсутствует или updateAll = true
    if (!updateAll && request.counterpartName) {
      // Если имя уже есть, сохраняем его в кэш для будущего использования
      saveCachedUserName(request.counterpartId, request.counterpartName);
      return; // Пропускаем, если имя уже есть
    }

    try {
      // Пытаемся получить имя из кэша или других источников
      const userName = await getUserNameFromBot(request.counterpartId);
      if (userName) {
        // Сохраняем имя в кэш
        saveCachedUserName(request.counterpartId, userName);
        
        // Сохраняем имя, даже если оно уже было (может обновиться)
        if (userName !== request.counterpartName) {
          updatedRequests[index] = {
            ...request,
            counterpartName: userName,
          };
          hasUpdates = true;
          console.log(`✅ Updated name for request ${request.id}: ${request.counterpartId} -> ${userName}`);
        }
      } else if (request.counterpartName) {
        // Если имя не получено, но уже есть в заявке, сохраняем его в кэш
        saveCachedUserName(request.counterpartId, request.counterpartName);
      }
    } catch (error) {
      // Игнорируем ошибки при обновлении отдельного имени
      console.debug(`⚠️ Failed to update name for friend request ${request.id}:`, error);
    }
  });

  // Ждём обновления всех имён (с таймаутом)
  await Promise.race([
    Promise.all(updatePromises),
    new Promise((resolve) => setTimeout(resolve, 2000)), // Таймаут 2 секунды
  ]);

  return hasUpdates ? updatedRequests : friendRequests;
};

