import { addDays, getDateKey, getStartOfDay } from './dateUtils';
import { getDayActivity } from './storage';
import { TimeMark, ActivityType } from '../types';
import {
  DailyGoalState,
  HomeState,
  DEFAULT_HOME_STATE,
  AchievementsState,
  AchievementFlag,
} from '../types/home';
import { getHomeState as getSyncedHomeState, setHomeState as setSyncedHomeState } from './userStateSync';

const DAY_TOTAL_MINUTES = 24 * 60;
const VIRTUAL_START_ID = '__start_of_day__';
const VIRTUAL_END_ID = '__end_of_day__';
const GOAL_REWARD_AMOUNT = 100;
const EIGHT_HOUR_MINUTES = 8 * 60;
const PRODUCTIVE_ACHIEVEMENT_LOOKBACK_DAYS = 30;
const SLEEP_ACHIEVEMENT_LOOKBACK_DAYS = 7;
const SLEEP_WEEK_MINUTES = 56 * 60;

export const GOAL_REWARD = GOAL_REWARD_AMOUNT;

const cloneAchievementFlag = (flag: AchievementFlag): AchievementFlag => ({
  unlocked: flag.unlocked,
  unlockedAt: flag.unlockedAt,
});

const cloneAchievements = (achievements: AchievementsState): AchievementsState => ({
  firstGoalCompleted: cloneAchievementFlag(achievements.firstGoalCompleted),
  focusEightHours: cloneAchievementFlag(achievements.focusEightHours),
  sleepSevenNights: cloneAchievementFlag(achievements.sleepSevenNights),
});

const cloneGoals = (goals: Record<string, DailyGoalState>): Record<string, DailyGoalState> => {
  const result: Record<string, DailyGoalState> = {};
  Object.entries(goals ?? {}).forEach(([key, goal]) => {
    if (!goal) {
      return;
    }
    result[key] = { ...goal };
  });
  return result;
};

const cloneState = (state: HomeState): HomeState => ({
  currentStreak: state.currentStreak,
  lastProcessedDate: state.lastProcessedDate,
  currency: state.currency,
  goals: cloneGoals(state.goals),
  achievements: cloneAchievements(state.achievements),
});

const DEFAULT_STATE: HomeState = cloneState(DEFAULT_HOME_STATE);

const parseDateKey = (key: string): Date => {
  const [day, month, year] = key.split('.').map(Number);
  return getStartOfDay(new Date(year, (month ?? 1) - 1, day ?? 1));
};

export const loadHomeState = (): HomeState => {
  const state = getSyncedHomeState();
  if (!state) {
    return cloneState(DEFAULT_STATE);
  }
  return cloneState(state);
};

export const saveHomeState = (state: HomeState): void => {
  setSyncedHomeState(cloneState(state));
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
        rewardGranted: false,
        setAt: new Date().toISOString(),
      },
    },
  };
  saveHomeState(nextState);
  return nextState;
};

const calculateActivityMinutes = (date: Date, activityType: Exclude<ActivityType, null>): number => {
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
    .filter(interval => interval.type === activityType)
    .forEach(interval => {
      const startMinute = getMinuteForMark(interval.startMarkId);
      const endMinute = getMinuteForMark(interval.endMarkId);
      if (endMinute > startMinute) {
        total += endMinute - startMinute;
      }
    });

  return total;
};

export const calculateProductiveMinutes = (date: Date): number =>
  calculateActivityMinutes(date, 'productive');

const sumActivityMinutesOverRange = (
  referenceDate: Date,
  days: number,
  activityType: Exclude<ActivityType, null>,
): number => {
  let total = 0;
  for (let offset = 0; offset < days; offset += 1) {
    const current = getStartOfDay(addDays(referenceDate, -offset));
    total += calculateActivityMinutes(current, activityType);
  }
  return total;
};

const hasProductiveDayWithMinutes = (
  referenceDate: Date,
  days: number,
  thresholdMinutes: number,
): boolean => {
  for (let offset = 0; offset < days; offset += 1) {
    const current = getStartOfDay(addDays(referenceDate, -offset));
    if (calculateProductiveMinutes(current) >= thresholdMinutes) {
      return true;
    }
  }
  return false;
};

const unlockAchievement = (state: HomeState, key: keyof AchievementsState): boolean => {
  const achievement = state.achievements[key];
  if (achievement.unlocked) {
    return false;
  }
  state.achievements[key] = {
    unlocked: true,
    unlockedAt: new Date().toISOString(),
  };
  return true;
};

const evaluateAchievements = (state: HomeState, referenceDate: Date): boolean => {
  let changed = false;

  if (
    !state.achievements.firstGoalCompleted.unlocked &&
    Object.values(state.goals).some((goal) => goal?.completed)
  ) {
    changed = unlockAchievement(state, 'firstGoalCompleted') || changed;
  }

  if (
    !state.achievements.focusEightHours.unlocked &&
    hasProductiveDayWithMinutes(referenceDate, PRODUCTIVE_ACHIEVEMENT_LOOKBACK_DAYS, EIGHT_HOUR_MINUTES)
  ) {
    changed = unlockAchievement(state, 'focusEightHours') || changed;
  }

  if (!state.achievements.sleepSevenNights.unlocked) {
    const totalSleepMinutes = sumActivityMinutesOverRange(
      referenceDate,
      SLEEP_ACHIEVEMENT_LOOKBACK_DAYS,
      'sleep',
    );
    if (totalSleepMinutes >= SLEEP_WEEK_MINUTES) {
      changed = unlockAchievement(state, 'sleepSevenNights') || changed;
    }
  }

  return changed;
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
  let currencyChanged = false;

  for (
    let current = startDate;
    current.getTime() <= yesterday.getTime();
    current = addDays(current, 1)
  ) {
    const key = getDateKey(current);
    const existingGoal = nextState.goals[key];
    const targetMinutes = existingGoal?.targetMinutes ?? 0;
    const productiveMinutes = calculateProductiveMinutes(current);
    const completed = targetMinutes > 0 && productiveMinutes >= targetMinutes;

    let rewardGranted = existingGoal?.rewardGranted ?? false;
    if (completed && !rewardGranted) {
      nextState.currency += GOAL_REWARD_AMOUNT;
      rewardGranted = true;
      currencyChanged = true;
    }

    if (targetMinutes > 0) {
      if (completed) {
        currentStreak = existingGoal?.countedInStreak ? currentStreak : currentStreak + 1;
      } else {
        currentStreak = 0;
      }
    }

    nextState.goals[key] = {
      targetMinutes,
      completed,
      countedInStreak: true,
      rewardGranted,
      setAt: existingGoal?.setAt ?? current.toISOString(),
    };

    nextState.currentStreak = currentStreak;
    nextState.lastProcessedDate = key;
    changed = true;
  }

  const achievementsChanged = evaluateAchievements(nextState, referenceDate);

  if (!changed && !currencyChanged && !achievementsChanged) {
    return { state, changed: false };
  }

  return { state: nextState, changed: true };
};

export const ensureAchievementsUpToDate = (
  state: HomeState,
  referenceDate: Date,
): { state: HomeState; changed: boolean } => {
  const cloned = cloneState(state);
  const changed = evaluateAchievements(cloned, referenceDate);
  return changed ? { state: cloned, changed: true } : { state, changed: false };
};



