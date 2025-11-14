import fs from 'fs/promises';
import path from 'path';

export interface StoredTimeMark {
  id: string;
  hour: number;
  minute: number;
  timestamp: number;
}

export type StoredActivityType = 'sleep' | 'productive' | 'rest' | 'procrastination' | null;

export interface StoredActivityInterval {
  id: string;
  startMarkId: string;
  endMarkId: string;
  type: StoredActivityType;
}

export interface StoredDayActivity {
  date: string;
  marks: StoredTimeMark[];
  intervals: StoredActivityInterval[];
}

export interface StoredDailyGoalState {
  targetMinutes: number;
  completed: boolean;
  countedInStreak: boolean;
  rewardGranted: boolean;
  productiveRewardedHours: number;
  setAt: string;
}

export interface StoredAchievementFlag {
  unlocked: boolean;
  unlockedAt: string | null;
}

export interface StoredAchievementsState {
  workDay: StoredAchievementFlag;
  firstGoalCompleted: StoredAchievementFlag;
  planner: StoredAchievementFlag;
  sociality: StoredAchievementFlag;
  focus: StoredAchievementFlag;
  healthySleep: StoredAchievementFlag;
}

export interface StoredCosmeticThemeProgress {
  levelsUnlocked: number;
  currentLevel: number;
}

export interface StoredCosmeticCategoryState {
  byAchievement: Record<string, StoredCosmeticThemeProgress>;
  activeSelection: { source: string; level: number } | null;
}

export interface StoredHomeCosmeticsState {
  backgrounds: StoredCosmeticCategoryState;
  hats: StoredCosmeticCategoryState;
}

export interface StoredHomeState {
  currentStreak: number;
  lastProcessedDate: string | null;
  currency: number;
  goals: Record<string, StoredDailyGoalState>;
  achievements: StoredAchievementsState;
  cosmetics: StoredHomeCosmeticsState;
}

export type StoredFriendRequestStatus = 'pending' | 'accepted' | 'declined';

export interface StoredFriend {
  userId: string;
  displayName?: string | null;
  shareMyStatsWith: boolean;
  shareTheirStatsWithMe: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StoredFriendRequest {
  id: string;
  counterpartId: string;
  counterpartName?: string | null;
  direction: 'incoming' | 'outgoing';
  status: StoredFriendRequestStatus;
  createdAt: string;
  respondedAt?: string | null;
}

export type StoredNotificationType = 'friend_request' | 'friend_request_accepted' | 'friend_request_declined';

export interface StoredNotification {
  id: string;
  type: StoredNotificationType;
  message: string;
  createdAt: string;
  read: boolean;
  payload?: Record<string, unknown>;
}

export interface StoredSocialState {
  friends: StoredFriend[];
  friendRequests: StoredFriendRequest[];
  notifications: StoredNotification[];
}

export interface StoredUserState {
  activityData: Record<string, StoredDayActivity>;
  homeState: StoredHomeState;
  social: StoredSocialState;
  updatedAt: string;
}

const DATA_DIR = path.resolve(__dirname, '../data/users');

export const DEFAULT_HOME_STATE: StoredHomeState = {
  currentStreak: 0,
  lastProcessedDate: null,
  currency: 0,
  goals: {},
  achievements: {
    workDay: { unlocked: false, unlockedAt: null },
    firstGoalCompleted: { unlocked: false, unlockedAt: null },
    planner: { unlocked: false, unlockedAt: null },
    sociality: { unlocked: false, unlockedAt: null },
    focus: { unlocked: false, unlockedAt: null },
    healthySleep: { unlocked: false, unlockedAt: null },
  },
  cosmetics: {
    backgrounds: {
      byAchievement: {},
      activeSelection: null,
    },
    hats: {
      byAchievement: {},
      activeSelection: null,
    },
  },
};

export const DEFAULT_SOCIAL_STATE: StoredSocialState = {
  friends: [],
  friendRequests: [],
  notifications: [],
};

export const DEFAULT_USER_STATE: StoredUserState = {
  activityData: {},
  homeState: DEFAULT_HOME_STATE,
  social: DEFAULT_SOCIAL_STATE,
  updatedAt: new Date(0).toISOString(),
};

const ensureDataDir = async () => {
  await fs.mkdir(DATA_DIR, { recursive: true });
};

const getUserStatePath = (userId: string) => path.join(DATA_DIR, `${userId}.json`);

const sanitizeActivityData = (input: unknown): Record<string, StoredDayActivity> => {
  if (!input || typeof input !== 'object') {
    return {};
  }

  const source = input as Record<string, unknown>;
  const result: Record<string, StoredDayActivity> = {};

  for (const [key, value] of Object.entries(source)) {
    if (!value || typeof value !== 'object') {
      continue;
    }

    const day = value as Partial<StoredDayActivity>;

    if (typeof day.date !== 'string') {
      continue;
    }

    const marks = Array.isArray(day.marks) ? day.marks : [];
    const intervals = Array.isArray(day.intervals) ? day.intervals : [];

    result[key] = {
      date: day.date,
      marks: marks
        .filter((mark): mark is StoredTimeMark => !!mark && typeof mark === 'object')
        .map((mark) => ({
          id: typeof mark.id === 'string' ? mark.id : '',
          hour: typeof mark.hour === 'number' ? mark.hour : 0,
          minute: typeof mark.minute === 'number' ? mark.minute : 0,
          timestamp: typeof mark.timestamp === 'number' ? mark.timestamp : 0,
        })),
      intervals: intervals
        .filter((interval): interval is StoredActivityInterval => !!interval && typeof interval === 'object')
        .map((interval) => ({
          id: typeof interval.id === 'string' ? interval.id : '',
          startMarkId: typeof interval.startMarkId === 'string' ? interval.startMarkId : '',
          endMarkId: typeof interval.endMarkId === 'string' ? interval.endMarkId : '',
          type:
            interval.type === 'sleep' ||
            interval.type === 'productive' ||
            interval.type === 'rest' ||
            interval.type === 'procrastination'
              ? interval.type
              : null,
        })),
    };
  }

  return result;
};

const sanitizeCosmeticThemeProgress = (input: unknown): StoredCosmeticThemeProgress => {
  if (!input || typeof input !== 'object') {
    return {
      levelsUnlocked: 0,
      currentLevel: 0,
    };
  }

  const source = input as Partial<StoredCosmeticThemeProgress>;
  const levelsUnlocked = typeof source.levelsUnlocked === 'number' ? Math.max(0, source.levelsUnlocked) : 0;
  let currentLevel = typeof source.currentLevel === 'number' ? Math.max(0, source.currentLevel) : 0;
  if (currentLevel > levelsUnlocked) {
    currentLevel = levelsUnlocked;
  }

  return {
    levelsUnlocked,
    currentLevel,
  };
};

const sanitizeCosmeticCategoryState = (input: unknown): StoredCosmeticCategoryState => {
  if (!input || typeof input !== 'object') {
    return {
      byAchievement: {},
      activeSelection: null,
    };
  }

  const source = input as Partial<StoredCosmeticCategoryState>;
  const byAchievementSource =
    source.byAchievement && typeof source.byAchievement === 'object' ? source.byAchievement : {};

  const sanitizedByAchievement: Record<string, StoredCosmeticThemeProgress> = {};
  for (const [key, value] of Object.entries(byAchievementSource)) {
    sanitizedByAchievement[key] = sanitizeCosmeticThemeProgress(value);
  }

  let activeSelection: { source: string; level: number } | null = null;
  const active = source.activeSelection;
  if (active && typeof active === 'object') {
    const sourceKey =
      typeof (active as { source?: unknown }).source === 'string'
        ? (active as { source: string }).source
        : null;
    const levelValue =
      typeof (active as { level?: unknown }).level === 'number'
        ? (active as { level: number }).level
        : null;
    if (sourceKey && levelValue !== null) {
      activeSelection = { source: sourceKey, level: levelValue };
    }
  }

  return {
    byAchievement: sanitizedByAchievement,
    activeSelection,
  };
};

const sanitizeHomeCosmeticsState = (input: unknown): StoredHomeCosmeticsState => {
  if (!input || typeof input !== 'object') {
    return { ...DEFAULT_HOME_STATE.cosmetics };
  }

  const source = input as Partial<
    StoredHomeCosmeticsState & {
      homeBackground?: StoredCosmeticCategoryState;
      homeHat?: StoredCosmeticCategoryState;
    }
  >;

  const backgroundsSource =
    source.backgrounds ??
    source.homeBackground ??
    DEFAULT_HOME_STATE.cosmetics.backgrounds;
  const hatsSource = source.hats ?? (source as { homeHat?: StoredCosmeticCategoryState }).homeHat ?? DEFAULT_HOME_STATE.cosmetics.hats;

  return {
    backgrounds: sanitizeCosmeticCategoryState(backgroundsSource),
    hats: sanitizeCosmeticCategoryState(hatsSource),
  };
};

const sanitizeHomeState = (input: unknown): StoredHomeState => {
  if (!input || typeof input !== 'object') {
    return { ...DEFAULT_HOME_STATE };
  }

  const source = input as Partial<StoredHomeState>;
  const goalsSource = source.goals && typeof source.goals === 'object' ? source.goals : {};
  const goals: Record<string, StoredDailyGoalState> = {};

  for (const [key, value] of Object.entries(goalsSource)) {
    if (!value || typeof value !== 'object') {
      continue;
    }
    const goal = value as Partial<StoredDailyGoalState>;
    goals[key] = {
      targetMinutes: typeof goal.targetMinutes === 'number' ? goal.targetMinutes : 0,
      completed: typeof goal.completed === 'boolean' ? goal.completed : false,
      countedInStreak: typeof goal.countedInStreak === 'boolean' ? goal.countedInStreak : false,
      rewardGranted: typeof goal.rewardGranted === 'boolean' ? goal.rewardGranted : false,
      productiveRewardedHours:
        typeof goal.productiveRewardedHours === 'number' ? goal.productiveRewardedHours : 0,
      setAt: typeof goal.setAt === 'string' ? goal.setAt : new Date().toISOString(),
    };
  }

  const sanitizeAchievement = (input: unknown): StoredAchievementFlag => {
    if (!input || typeof input !== 'object') {
      return { unlocked: false, unlockedAt: null };
    }
    const flag = input as Partial<StoredAchievementFlag>;
    return {
      unlocked: typeof flag.unlocked === 'boolean' ? flag.unlocked : false,
      unlockedAt: typeof flag.unlockedAt === 'string' ? flag.unlockedAt : null,
    };
  };

  const achievementsSource =
    source.achievements && typeof source.achievements === 'object' ? source.achievements : {};

  return {
    currentStreak: typeof source.currentStreak === 'number' ? source.currentStreak : 0,
    lastProcessedDate: typeof source.lastProcessedDate === 'string' ? source.lastProcessedDate : null,
    currency: typeof source.currency === 'number' ? source.currency : 0,
    goals,
    achievements: {
      // Миграция: преобразуем старые ключи в новые
      workDay: sanitizeAchievement(
        (achievementsSource as StoredAchievementsState & { workDay?: unknown; focusEightHours?: unknown }).workDay ||
        (achievementsSource as StoredAchievementsState & { focusEightHours?: unknown }).focusEightHours ||
        DEFAULT_HOME_STATE.achievements.workDay,
      ),
      firstGoalCompleted: sanitizeAchievement(
        (achievementsSource as StoredAchievementsState).firstGoalCompleted ||
        DEFAULT_HOME_STATE.achievements.firstGoalCompleted,
      ),
      planner: sanitizeAchievement(
        (achievementsSource as StoredAchievementsState).planner ||
        DEFAULT_HOME_STATE.achievements.planner,
      ),
      sociality: sanitizeAchievement(
        (achievementsSource as StoredAchievementsState).sociality ||
        DEFAULT_HOME_STATE.achievements.sociality,
      ),
      focus: sanitizeAchievement(
        (achievementsSource as StoredAchievementsState).focus ||
        DEFAULT_HOME_STATE.achievements.focus,
      ),
      healthySleep: sanitizeAchievement(
        (achievementsSource as StoredAchievementsState & { healthySleep?: unknown; sleepSevenNights?: unknown }).healthySleep ||
        (achievementsSource as StoredAchievementsState & { sleepSevenNights?: unknown }).sleepSevenNights ||
        DEFAULT_HOME_STATE.achievements.healthySleep,
      ),
    },
    cosmetics: sanitizeHomeCosmeticsState(source.cosmetics),
  };
};

const sanitizeFriend = (input: unknown): StoredFriend => {
  if (!input || typeof input !== 'object') {
    const now = new Date().toISOString();
    return {
      userId: '',
      displayName: null,
      shareMyStatsWith: false,
      shareTheirStatsWithMe: false,
      createdAt: now,
      updatedAt: now,
    };
  }

  const source = input as Partial<StoredFriend>;
  const now = new Date().toISOString();

  return {
    userId: typeof source.userId === 'string' ? source.userId : '',
    displayName: typeof source.displayName === 'string' ? source.displayName : null,
    shareMyStatsWith: typeof source.shareMyStatsWith === 'boolean' ? source.shareMyStatsWith : false,
    shareTheirStatsWithMe:
      typeof source.shareTheirStatsWithMe === 'boolean' ? source.shareTheirStatsWithMe : false,
    createdAt: typeof source.createdAt === 'string' ? source.createdAt : now,
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : now,
  };
};

const sanitizeFriendRequest = (input: unknown): StoredFriendRequest => {
  if (!input || typeof input !== 'object') {
    return {
      id: '',
      counterpartId: '',
      counterpartName: null,
      direction: 'incoming',
      status: 'pending',
      createdAt: new Date().toISOString(),
      respondedAt: null,
    };
  }

  const source = input as Partial<StoredFriendRequest>;
  const direction = source.direction === 'outgoing' ? 'outgoing' : 'incoming';
  const status: StoredFriendRequestStatus =
    source.status === 'accepted' || source.status === 'declined' ? source.status : 'pending';

  return {
    id: typeof source.id === 'string' ? source.id : '',
    counterpartId: typeof source.counterpartId === 'string' ? source.counterpartId : '',
    counterpartName: typeof source.counterpartName === 'string' ? source.counterpartName : null,
    direction,
    status,
    createdAt: typeof source.createdAt === 'string' ? source.createdAt : new Date().toISOString(),
    respondedAt: typeof source.respondedAt === 'string' ? source.respondedAt : null,
  };
};

const sanitizeNotification = (input: unknown): StoredNotification => {
  if (!input || typeof input !== 'object') {
    return {
      id: '',
      type: 'friend_request',
      message: '',
      createdAt: new Date().toISOString(),
      read: false,
      payload: undefined,
    };
  }

  const source = input as Partial<StoredNotification>;
  const type: StoredNotificationType =
    source.type === 'friend_request_accepted' || source.type === 'friend_request_declined'
      ? source.type
      : 'friend_request';

  const payload =
    source.payload && typeof source.payload === 'object' ? (source.payload as Record<string, unknown>) : undefined;

  return {
    id: typeof source.id === 'string' ? source.id : '',
    type,
    message: typeof source.message === 'string' ? source.message : '',
    createdAt: typeof source.createdAt === 'string' ? source.createdAt : new Date().toISOString(),
    read: typeof source.read === 'boolean' ? source.read : false,
    payload,
  };
};

const sanitizeSocialState = (input: unknown): StoredSocialState => {
  if (!input || typeof input !== 'object') {
    return { ...DEFAULT_SOCIAL_STATE };
  }

  const source = input as Partial<StoredSocialState>;

  const friendsSource = Array.isArray(source.friends) ? source.friends : [];
  const friendRequestsSource = Array.isArray(source.friendRequests) ? source.friendRequests : [];
  const notificationsSource = Array.isArray(source.notifications) ? source.notifications : [];

  return {
    friends: friendsSource.map((friend) => sanitizeFriend(friend)).filter((friend) => friend.userId),
    friendRequests: friendRequestsSource
      .map((request) => sanitizeFriendRequest(request))
      .filter((request) => request.id && request.counterpartId),
    notifications: notificationsSource.map((notification) => sanitizeNotification(notification)),
  };
};

const sanitizeUserState = (input: unknown): StoredUserState => {
  if (!input || typeof input !== 'object') {
    return {
      activityData: {},
      homeState: { ...DEFAULT_HOME_STATE },
      social: { ...DEFAULT_SOCIAL_STATE },
      updatedAt: new Date().toISOString(),
    };
  }

  const source = input as Partial<StoredUserState>;

  return {
    activityData: sanitizeActivityData(source.activityData),
    homeState: sanitizeHomeState(source.homeState),
    social: sanitizeSocialState(source.social),
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : new Date().toISOString(),
  };
};

export const initUserStateStore = async (): Promise<void> => {
  await ensureDataDir();
};

export const readUserState = async (userId: string): Promise<StoredUserState> => {
  await ensureDataDir();

  try {
    const raw = await fs.readFile(getUserStatePath(userId), 'utf-8');
    const parsed = JSON.parse(raw);
    return sanitizeUserState(parsed);
  } catch (error: unknown) {
    // Если файл отсутствует — возвращаем состояние по умолчанию
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return {
        activityData: {},
        homeState: { ...DEFAULT_HOME_STATE },
        social: { ...DEFAULT_SOCIAL_STATE },
        updatedAt: new Date(0).toISOString(),
      };
    }

    throw error;
  }
};

export const writeUserState = async (userId: string, state: StoredUserState): Promise<StoredUserState> => {
  await ensureDataDir();

  const sanitized = sanitizeUserState(state);
  sanitized.updatedAt = new Date().toISOString();

  await fs.writeFile(getUserStatePath(userId), JSON.stringify(sanitized, null, 2), 'utf-8');

  return sanitized;
};


