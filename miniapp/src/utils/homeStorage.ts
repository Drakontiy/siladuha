import { addDays, getDateKey, getStartOfDay } from './dateUtils';
import { getDayActivity } from './storage';
import { TimeMark } from '../types';
import { getUserScopedStorageKey } from './userIdentity';

const DAY_TOTAL_MINUTES = 24 * 60;
const VIRTUAL_START_ID = '__start_of_day__';
const VIRTUAL_END_ID = '__end_of_day__';

export interface DailyGoalState {
  targetMinutes: number;
  completed: boolean;
  countedInStreak: boolean;
  setAt: string;
}

export interface HomeState {
  currentStreak: number;
  lastProcessedDate: string | null;
  goals: Record<string, DailyGoalState>;
}

const DEFAULT_STATE: HomeState = {
  currentStreak: 0,
  lastProcessedDate: null,
  goals: {},
};

const parseDateKey = (key: string): Date => {
  const [day, month, year] = key.split('.').map(Number);
  return getStartOfDay(new Date(year, (month ?? 1) - 1, day ?? 1));
};

const cloneState = (state: HomeState): HomeState => ({
  currentStreak: state.currentStreak,
  lastProcessedDate: state.lastProcessedDate,
  goals: { ...state.goals },
});

export const loadHomeState = (): HomeState => {
  try {
    const raw = localStorage.getItem(getUserScopedStorageKey('home_state'));
    if (!raw) {
      return DEFAULT_STATE;
    }
    const parsed = JSON.parse(raw) as Partial<HomeState>;
    return {
      currentStreak: parsed.currentStreak ?? 0,
      lastProcessedDate: parsed.lastProcessedDate ?? null,
      goals: parsed.goals ?? {},
    };
  } catch (error) {
    console.error('Error loading home state:', error);
    return DEFAULT_STATE;
  }
};

export const saveHomeState = (state: HomeState): void => {
  try {
    localStorage.setItem(getUserScopedStorageKey('home_state'), JSON.stringify(state));
  } catch (error) {
    console.error('Error saving home state:', error);
  }
};

export const setDailyGoal = (date: Date, minutes: number): HomeState => {
  const todayKey = getDateKey(getStartOfDay(date));
  const existingState = loadHomeState();
  if (existingState.goals[todayKey]) {
    return existingState;
  }
  const nextState: HomeState = {
    ...existingState,
    goals: {
      ...existingState.goals,
      [todayKey]: {
        targetMinutes: minutes,
        completed: false,
        countedInStreak: false,
        setAt: new Date().toISOString(),
      },
    },
  };
  saveHomeState(nextState);
  return nextState;
};

export const calculateProductiveMinutes = (date: Date): number => {
  const dayStart = getStartOfDay(date);
  const activity = getDayActivity(dayStart);
  const marksMap = new Map<string, TimeMark>();
  activity.marks.forEach(mark => marksMap.set(mark.id, mark));

  const getMinuteForMark = (markId: string): number => {
    if (markId === VIRTUAL_START_ID) {
      return 0;
    }
    if (markId === VIRTUAL_END_ID) {
      return DAY_TOTAL_MINUTES;
    }
    const mark = marksMap.get(markId);
    return mark ? mark.timestamp : 0;
  };

  let total = 0;
  activity.intervals
    .filter(interval => interval.type === 'productive')
    .forEach(interval => {
      const startMinute = getMinuteForMark(interval.startMarkId);
      const endMinute = getMinuteForMark(interval.endMarkId);
      if (endMinute > startMinute) {
        total += endMinute - startMinute;
      }
    });

  return total;
};

export const processPendingDays = (
  state: HomeState,
  referenceDate: Date,
): { state: HomeState; changed: boolean } => {
  const today = getStartOfDay(referenceDate);
  const yesterday = addDays(today, -1);

  if (yesterday.getTime() < 0) {
    return { state, changed: false };
  }

  const startDate = state.lastProcessedDate
    ? addDays(parseDateKey(state.lastProcessedDate), 1)
    : yesterday;

  if (startDate.getTime() > yesterday.getTime()) {
    return { state, changed: false };
  }

  const nextState = cloneState(state);
  let changed = false;

  let currentStreak = nextState.currentStreak;

  for (
    let current = startDate;
    current.getTime() <= yesterday.getTime();
    current = addDays(current, 1)
  ) {
    const key = getDateKey(current);
    const goal = nextState.goals[key];
    const targetMinutes = goal?.targetMinutes ?? 0;
    const productiveMinutes = calculateProductiveMinutes(current);
    const completed = targetMinutes > 0 && productiveMinutes >= targetMinutes;

    if (completed) {
      currentStreak = targetMinutes > 0 ? currentStreak + 1 : 0;
    } else {
      currentStreak = 0;
    }

    nextState.goals[key] = {
      targetMinutes,
      completed,
      countedInStreak: true,
      setAt: goal?.setAt ?? current.toISOString(),
    };

    nextState.currentStreak = currentStreak;
    nextState.lastProcessedDate = key;
    changed = true;
  }

  if (!changed) {
    return { state, changed: false };
  }

  return { state: nextState, changed: true };
};



