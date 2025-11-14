import fs from 'fs/promises';
import path from 'path';

const USER_NAMES_FILE = path.resolve(__dirname, '../data/user_names.json');

interface UserNameCache {
  [userId: string]: string;
}

let nameCache: UserNameCache = {};

// Загружаем кэш имён из файла
const loadNameCache = async (): Promise<void> => {
  try {
    const data = await fs.readFile(USER_NAMES_FILE, 'utf-8');
    nameCache = JSON.parse(data);
    console.log(`📂 [NAMECACHE] Loaded ${Object.keys(nameCache).length} user names from file`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      // Файл не существует, создаём пустой кэш
      nameCache = {};
      console.log(`📂 [NAMECACHE] Name cache file not found, starting with empty cache`);
    } else {
      console.error('❌ [NAMECACHE] Failed to load name cache:', error);
      nameCache = {};
    }
  }
};

// Сохраняем кэш имён в файл
const saveNameCache = async (): Promise<void> => {
  try {
    const dir = path.dirname(USER_NAMES_FILE);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(USER_NAMES_FILE, JSON.stringify(nameCache, null, 2), 'utf-8');
    console.log(`💾 [NAMECACHE] Saved ${Object.keys(nameCache).length} user names to file`);
  } catch (error) {
    console.error('❌ [NAMECACHE] Failed to save name cache:', error);
  }
};

// Инициализация при запуске
loadNameCache().catch((error) => {
  console.error('❌ [NAMECACHE] Failed to initialize name cache:', error);
});

// Сохраняем кэш каждые 30 секунд
setInterval(() => {
  saveNameCache().catch((error) => {
    console.error('❌ [NAMECACHE] Failed to save name cache:', error);
  });
}, 30 * 1000);

// Сохраняем кэш при завершении процесса
process.on('SIGINT', () => {
  saveNameCache().catch(console.error);
  process.exit(0);
});

process.on('SIGTERM', () => {
  saveNameCache().catch(console.error);
  process.exit(0);
});

/**
 * Сохраняет имя пользователя
 */
export const saveUserName = (userId: string, name: string | null): void => {
  if (name && name.trim().length > 0) {
    const trimmedName = name.trim();
    if (nameCache[userId] !== trimmedName) {
      nameCache[userId] = trimmedName;
      console.log(`💾 [NAMECACHE] Saved name for user ${userId}: ${trimmedName}`);
      // Сохраняем асинхронно (не блокируем)
      saveNameCache().catch((error) => {
        console.error(`❌ [NAMECACHE] Failed to save name for ${userId}:`, error);
      });
    }
  }
};

/**
 * Получает сохранённое имя пользователя
 */
export const getUserName = (userId: string): string | null => {
  return nameCache[userId] || null;
};

/**
 * Получает несколько имён пользователей
 */
export const getUserNames = (userIds: string[]): Record<string, string | null> => {
  const result: Record<string, string | null> = {};
  for (const userId of userIds) {
    result[userId] = nameCache[userId] || null;
  }
  return result;
};

