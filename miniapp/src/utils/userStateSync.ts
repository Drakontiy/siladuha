import { DayActivity } from '../types';
import {
  HomeState,
  DEFAULT_HOME_STATE,
  CosmeticThemeProgress,
  AchievementKey,
  CosmeticCategory,
} from '../types/home';
import { DEFAULT_SOCIAL_STATE, SocialState } from '../types/social';
import { DEFAULT_USER_ID, getActiveUser, getUserScopedStorageKey } from './userIdentity';

type ActivityData = Record<string, DayActivity>;

export interface SyncStatus {
  isSyncing: boolean;
  lastSyncedAt: string | null;
  error?: string;
}

const SYNC_DEBOUNCE_MS = 1_000;

let activityData: ActivityData = {};

const cloneAchievementFlag = (flag: HomeState['achievements']['firstGoalCompleted']): HomeState['achievements']['firstGoalCompleted'] => ({
  unlocked: flag.unlocked,
  unlockedAt: flag.unlockedAt,
});

const cloneAchievements = (achievements: HomeState['achievements']): HomeState['achievements'] => {
  // Миграция старых достижений в новый формат
  const oldAchievements = achievements as any; // временно используем any для миграции
  
  // Создаём новый объект с дефолтными значениями
  const newAchievements: HomeState['achievements'] = {
    workDay: { unlocked: false, unlockedAt: null },
    firstGoalCompleted: { unlocked: false, unlockedAt: null },
    planner: { unlocked: false, unlockedAt: null },
    sociality: { unlocked: false, unlockedAt: null },
    focus: { unlocked: false, unlockedAt: null },
    healthySleep: { unlocked: false, unlockedAt: null },
  };
  
  // Мигрируем существующие достижения
  if (oldAchievements.firstGoalCompleted) {
    newAchievements.firstGoalCompleted = cloneAchievementFlag(oldAchievements.firstGoalCompleted);
  }
  
  // Миграция focusEightHours -> workDay
  if (oldAchievements.focusEightHours) {
    newAchievements.workDay = cloneAchievementFlag(oldAchievements.focusEightHours);
  } else if (oldAchievements.workDay) {
    newAchievements.workDay = cloneAchievementFlag(oldAchievements.workDay);
  }
  
  // Миграция sleepSevenNights -> healthySleep
  if (oldAchievements.sleepSevenNights) {
    newAchievements.healthySleep = cloneAchievementFlag(oldAchievements.sleepSevenNights);
  } else if (oldAchievements.healthySleep) {
    newAchievements.healthySleep = cloneAchievementFlag(oldAchievements.healthySleep);
  }
  
  // Копируем новые достижения, если они есть
  if (oldAchievements.planner) {
    newAchievements.planner = cloneAchievementFlag(oldAchievements.planner);
  }
  if (oldAchievements.sociality) {
    newAchievements.sociality = cloneAchievementFlag(oldAchievements.sociality);
  }
  if (oldAchievements.focus) {
    newAchievements.focus = cloneAchievementFlag(oldAchievements.focus);
  }
  
  return newAchievements;
};

const cloneGoals = (goals: HomeState['goals']): HomeState['goals'] => {
  const result: HomeState['goals'] = {};
  Object.entries(goals ?? {}).forEach(([key, goal]) => {
    if (!goal) {
      return;
    }
    result[key] = { ...goal };
  });
  return result;
};

const cloneCosmeticThemeProgress = (
  progress: CosmeticThemeProgress | undefined,
): CosmeticThemeProgress | undefined => {
  if (!progress) {
    return undefined;
  }
  return {
    levelsUnlocked: progress.levelsUnlocked,
    currentLevel: progress.currentLevel,
  };
};

const cloneCosmeticCategoryState = (
  category: HomeState['cosmetics'][CosmeticCategory],
): HomeState['cosmetics'][CosmeticCategory] => {
  const byAchievement: HomeState['cosmetics'][CosmeticCategory]['byAchievement'] = {};
  const sourceMap = category.byAchievement ?? {};
  (Object.keys(sourceMap) as AchievementKey[]).forEach((key) => {
    const cloned = cloneCosmeticThemeProgress(sourceMap[key]);
    if (cloned) {
      byAchievement[key] = cloned;
    }
  });

  const active = category.activeSelection;
  const activeSelection =
    active && typeof active.source === 'string' && typeof active.level === 'number'
      ? { source: active.source, level: active.level }
      : null;

  return {
    byAchievement,
    activeSelection,
  };
};

const cloneCosmetics = (cosmetics: HomeState['cosmetics']): HomeState['cosmetics'] => {
  // Миграция: убираем hats категорию, если она есть в старых данных
  const oldCosmetics = cosmetics as any;
  
  return {
    backgrounds: oldCosmetics.backgrounds 
      ? cloneCosmeticCategoryState(oldCosmetics.backgrounds)
      : { byAchievement: {}, activeSelection: null },
  };
};

const cloneHomeState = (state: HomeState | any): HomeState => {
  // Безопасное клонирование с обработкой миграции
  const oldState = state || {};
  
  return {
    currentStreak: typeof oldState.currentStreak === 'number' ? oldState.currentStreak : 0,
    lastProcessedDate: oldState.lastProcessedDate || null,
    currency: typeof oldState.currency === 'number' ? oldState.currency : 0,
    goals: oldState.goals ? cloneGoals(oldState.goals) : {},
    achievements: oldState.achievements ? cloneAchievements(oldState.achievements) : {
      workDay: { unlocked: false, unlockedAt: null },
      firstGoalCompleted: { unlocked: false, unlockedAt: null },
      planner: { unlocked: false, unlockedAt: null },
      sociality: { unlocked: false, unlockedAt: null },
      focus: { unlocked: false, unlockedAt: null },
      healthySleep: { unlocked: false, unlockedAt: null },
    },
    cosmetics: oldState.cosmetics ? cloneCosmetics(oldState.cosmetics) : {
      backgrounds: { byAchievement: {}, activeSelection: null },
    },
  };
};

let homeState: HomeState = cloneHomeState(DEFAULT_HOME_STATE);
let socialState: SocialState = {
  friends: [],
  friendRequests: [],
  notifications: [],
};
let syncStatus: SyncStatus = {
  isSyncing: false,
  lastSyncedAt: null,
};
let activeUserId: string = DEFAULT_USER_ID;
let initialized = false;
let syncTimeout: number | undefined;
let syncPending = false;
const listeners = new Set<(status: SyncStatus) => void>();
const stateListeners = new Set<() => void>();

const cloneActivityData = (data: ActivityData): ActivityData =>
  JSON.parse(JSON.stringify(data ?? {}));

const cloneSocialState = (state: SocialState): SocialState => ({
  friends: state.friends.map((friend) => ({ ...friend })),
  friendRequests: state.friendRequests.map((request) => ({ ...request })),
  notifications: state.notifications.map((notification) => ({
    ...notification,
    payload: notification.payload ? { ...notification.payload } : undefined,
  })),
});

socialState = cloneSocialState(DEFAULT_SOCIAL_STATE);

const notifyListeners = () => {
  listeners.forEach((listener) => {
    try {
      listener({ ...syncStatus });
    } catch (error) {
      console.error('Error notifying sync listener:', error);
    }
  });
};

const notifyStateChange = () => {
  stateListeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.error('Error notifying state listener:', error);
    }
  });
};

const readLocalJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = window.localStorage.getItem(getUserScopedStorageKey(key));
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeLocalJson = (key: string, value: unknown) => {
  try {
    window.localStorage.setItem(getUserScopedStorageKey(key), JSON.stringify(value));
  } catch {
    // Игнорируем (например, приватный режим)
  }
};

const getApiBase = (): string => {
  const envBase = (process.env.MINIAPP_API_BASE ?? '').trim();
  const runtimeBase =
    typeof window !== 'undefined' && (window as unknown as Record<string, string | undefined>).__MAX_API_BASE__;

  const base = envBase || runtimeBase || (typeof window !== 'undefined' ? window.location.origin : '');
  return base.replace(/\/+$/, '');
};

const buildEndpoint = (path: string): string => {
  const base = getApiBase();
  return `${base}${path}`;
};

const updateSyncStatus = (patch: Partial<SyncStatus>) => {
  syncStatus = { ...syncStatus, ...patch };
  notifyListeners();
};

const performSync = async () => {
  if (activeUserId === DEFAULT_USER_ID) {
    return;
  }

  if (syncStatus.isSyncing) {
    syncPending = true;
    return;
  }

  updateSyncStatus({ isSyncing: true, error: undefined });

  try {
    const response = await fetch(buildEndpoint(`/api/user/${encodeURIComponent(activeUserId)}/state`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        activityData,
        homeState,
        social: socialState,
      }),
    });

    if (!response.ok) {
      throw new Error(`Sync failed with status ${response.status}`);
    }

    const payload = (await response.json()) as {
      activityData?: ActivityData;
      homeState?: HomeState;
      social?: SocialState;
      updatedAt?: string;
    };

    if (payload.activityData) {
      activityData = cloneActivityData(payload.activityData);
      writeLocalJson('activity_data', activityData);
    }
    if (payload.homeState) {
      // Безопасная загрузка с миграцией
      try {
        homeState = cloneHomeState(payload.homeState);
        writeLocalJson('home_state', homeState);
      } catch (error) {
        console.error('Error cloning home state from server:', error);
        // Если ошибка, используем текущее локальное состояние
      }
    }
    if (payload.social) {
      socialState = cloneSocialState(payload.social);
      writeLocalJson('social_state', socialState);
    }

    updateSyncStatus({
      isSyncing: false,
      lastSyncedAt: payload.updatedAt ?? new Date().toISOString(),
      error: undefined,
    });
  } catch (error) {
    console.error('Failed to sync user state:', error);
    updateSyncStatus({
      isSyncing: false,
      error: error instanceof Error ? error.message : 'Unknown sync error',
    });
  } finally {
    syncStatus.isSyncing = false;
    if (syncPending) {
      syncPending = false;
      scheduleSync();
    }
  }
};

const scheduleSync = () => {
  if (activeUserId === DEFAULT_USER_ID) {
    return;
  }

  if (syncTimeout) {
    window.clearTimeout(syncTimeout);
  }

  syncTimeout = window.setTimeout(() => {
    syncTimeout = undefined;
    void performSync();
  }, SYNC_DEBOUNCE_MS);
};

export const initializeUserStateSync = async (): Promise<void> => {
  if (initialized) {
    return;
  }

  const user = getActiveUser();
  activeUserId = user.userId ?? DEFAULT_USER_ID;

  activityData = cloneActivityData(readLocalJson<ActivityData>('activity_data', {}));
  
  // Безопасная загрузка homeState с миграцией
  try {
    const loadedState = readLocalJson<any>('home_state', null);
    if (loadedState) {
      homeState = cloneHomeState(loadedState);
      // Сохраняем мигрированное состояние обратно
      writeLocalJson('home_state', homeState);
    } else {
      homeState = cloneHomeState(DEFAULT_HOME_STATE);
    }
  } catch (error) {
    console.error('Error loading home state, using default:', error);
    homeState = cloneHomeState(DEFAULT_HOME_STATE);
  }
  
  socialState = cloneSocialState(readLocalJson<SocialState>('social_state', { ...DEFAULT_SOCIAL_STATE }));

  if (activeUserId === DEFAULT_USER_ID) {
    initialized = true;
    return;
  }

  try {
    const response = await fetch(buildEndpoint(`/api/user/${encodeURIComponent(activeUserId)}/state`), {
      method: 'GET',
      credentials: 'include',
    });

    if (response.ok) {
      const payload = (await response.json()) as {
        activityData?: ActivityData;
        homeState?: HomeState;
        social?: SocialState;
        updatedAt?: string;
      };

      if (payload.activityData) {
        activityData = cloneActivityData(payload.activityData);
        writeLocalJson('activity_data', activityData);
      }
      if (payload.homeState) {
        homeState = cloneHomeState(payload.homeState);
        writeLocalJson('home_state', homeState);
      }
      if (payload.social) {
        socialState = cloneSocialState(payload.social);
        writeLocalJson('social_state', socialState);
      }

      updateSyncStatus({
        isSyncing: false,
        lastSyncedAt: payload.updatedAt ?? null,
        error: undefined,
      });
      notifyStateChange();
    } else {
      console.warn(`Failed to load remote state: ${response.status}`);
    }
  } catch (error) {
    console.warn('Unable to load remote user state, using local cache:', error);
    updateSyncStatus({
      isSyncing: false,
      error: error instanceof Error ? error.message : 'Failed to load remote state',
    });
  } finally {
    initialized = true;
    notifyStateChange();
  }
};

export const getActivityState = (): ActivityData => cloneActivityData(activityData);

export const setActivityState = (data: ActivityData): void => {
  activityData = cloneActivityData(data);
  writeLocalJson('activity_data', activityData);
  scheduleSync();
  notifyStateChange();
};

export const getHomeState = (): HomeState => cloneHomeState(homeState);

export const setHomeState = (state: HomeState): void => {
  homeState = cloneHomeState(state);
  writeLocalJson('home_state', homeState);
  scheduleSync();
  notifyStateChange();
};

export const getSocialState = (): SocialState => cloneSocialState(socialState);

export const setSocialState = (state: SocialState): void => {
  socialState = cloneSocialState(state);
  writeLocalJson('social_state', socialState);
  scheduleSync();
  notifyStateChange();
};

export const subscribeToSyncStatus = (listener: (status: SyncStatus) => void): (() => void) => {
  listeners.add(listener);
  listener({ ...syncStatus });
  return () => {
    listeners.delete(listener);
  };
};

export const getSyncStatus = (): SyncStatus => ({ ...syncStatus });

export const forceSyncNow = async (): Promise<void> => {
  if (activeUserId === DEFAULT_USER_ID) {
    return;
  }
  if (syncTimeout) {
    window.clearTimeout(syncTimeout);
    syncTimeout = undefined;
  }
  await performSync();
};

export const subscribeToUserStateChanges = (listener: () => void): (() => void) => {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
};

export const getApiBaseUrl = (): string => getApiBase();

export const buildApiUrl = (path: string): string => buildEndpoint(path);


