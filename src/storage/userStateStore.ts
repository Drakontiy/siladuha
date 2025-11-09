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
  setAt: string;
}

export interface StoredHomeState {
  currentStreak: number;
  lastProcessedDate: string | null;
  goals: Record<string, StoredDailyGoalState>;
}

export interface StoredUserState {
  activityData: Record<string, StoredDayActivity>;
  homeState: StoredHomeState;
  updatedAt: string;
}

const DATA_DIR = path.resolve(__dirname, '../data/users');

export const DEFAULT_HOME_STATE: StoredHomeState = {
  currentStreak: 0,
  lastProcessedDate: null,
  goals: {},
};

export const DEFAULT_USER_STATE: StoredUserState = {
  activityData: {},
  homeState: DEFAULT_HOME_STATE,
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
      setAt: typeof goal.setAt === 'string' ? goal.setAt : new Date().toISOString(),
    };
  }

  return {
    currentStreak: typeof source.currentStreak === 'number' ? source.currentStreak : 0,
    lastProcessedDate: typeof source.lastProcessedDate === 'string' ? source.lastProcessedDate : null,
    goals,
  };
};

const sanitizeUserState = (input: unknown): StoredUserState => {
  if (!input || typeof input !== 'object') {
    return {
      activityData: {},
      homeState: { ...DEFAULT_HOME_STATE },
      updatedAt: new Date().toISOString(),
    };
  }

  const source = input as Partial<StoredUserState>;

  return {
    activityData: sanitizeActivityData(source.activityData),
    homeState: sanitizeHomeState(source.homeState),
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


