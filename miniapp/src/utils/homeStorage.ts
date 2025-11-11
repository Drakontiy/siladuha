import { addDays, getDateKey, getStartOfDay } from './dateUtils';
import { getDayActivity } from './storage';
import { TimeMark, ActivityType } from '../types';
import {
  DailyGoalState,
  HomeState,
  DEFAULT_HOME_STATE,
  AchievementsState,
  AchievementFlag,
  HomeCosmeticsState,
  AchievementKey,
  CosmeticThemeProgress,
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

export type ThemeLevelDefinition =
  | { kind: 'color'; value: string }
  | { kind: 'image'; value: string };

const HOME_BACKGROUND_THEMES: Record<
  AchievementKey,
  {
    levels: ThemeLevelDefinition[];
    baseCost: number;
    title: string;
    description: string;
  }
> = {
  firstGoalCompleted: {
    levels: [
      { kind: 'color', value: '#F5F3FF' },
      { kind: 'color', value: '#EDE9FE' },
      { kind: 'color', value: '#DDD6FE' },
    ],
    baseCost: 150,
    title: 'Первый шаг',
    description: 'Награда за первую выполненную цель — мягкие сиреневые оттенки.',
  },
  focusEightHours: {
    levels: [
      { kind: 'color', value: '#ECFDF5' },
      { kind: 'color', value: '#D1FAE5' },
      { kind: 'color', value: '#A7F3D0' },
    ],
    baseCost: 220,
    title: '8 часов фокуса',
    description: 'Зелёные оттенки фокуса за день продуктивной работы.',
  },
  sleepSevenNights: {
    levels: [
      { kind: 'image', value: 'media/night.svg' },
      { kind: 'color', value: '#E0E7FF' },
      { kind: 'color', value: '#C7D2FE' },
    ],
    baseCost: 200,
    title: 'Герой сна',
    description: 'Глубокие вечерние тона за полноценный отдых.',
  },
};

const HOME_BACKGROUND_DEFAULT_COLOR = '#F3F4F6';
const ACHIEVEMENT_KEYS = Object.keys(HOME_BACKGROUND_THEMES) as AchievementKey[];

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

const cloneCosmetics = (cosmetics: HomeCosmeticsState): HomeCosmeticsState => {
  const byAchievement: HomeCosmeticsState['homeBackground']['byAchievement'] = {};
  const sourceMap = cosmetics.homeBackground.byAchievement ?? {};
  (Object.keys(sourceMap) as AchievementKey[]).forEach((key) => {
    const cloned = cloneCosmeticThemeProgress(sourceMap[key]);
    if (cloned) {
      byAchievement[key] = cloned;
    }
  });

  const active = cosmetics.homeBackground.activeSelection;
  const activeSelection =
    active && typeof active.source === 'string' && typeof active.level === 'number'
      ? { source: active.source, level: active.level }
      : null;

  return {
    homeBackground: {
      byAchievement,
      activeSelection,
    },
  };
};

const cloneState = (state: HomeState): HomeState => ({
  currentStreak: state.currentStreak,
  lastProcessedDate: state.lastProcessedDate,
  currency: state.currency,
  goals: cloneGoals(state.goals),
  achievements: cloneAchievements(state.achievements),
  cosmetics: cloneCosmetics(state.cosmetics),
});

const getThemeForAchievement = (key: AchievementKey) => HOME_BACKGROUND_THEMES[key];

const getThemeLevelDefinition = (key: AchievementKey, level: number): ThemeLevelDefinition | null => {
  const theme = getThemeForAchievement(key);
  if (!theme) {
    return null;
  }
  return theme.levels[level - 1] ?? null;
};

const ensureCosmeticProgressForAchievement = (state: HomeState, key: AchievementKey): boolean => {
  if (!state.achievements[key]?.unlocked) {
    return false;
  }
  const theme = getThemeForAchievement(key);
  const map = state.cosmetics.homeBackground.byAchievement;
  const existing = map[key] ?? { levelsUnlocked: 0, currentLevel: 0 };

  let changed = false;

  if (existing.levelsUnlocked < 1) {
    existing.levelsUnlocked = 1;
    changed = true;
  }

  const maxLevels = theme.levels.length;
  if (existing.levelsUnlocked > maxLevels) {
    existing.levelsUnlocked = maxLevels;
    changed = true;
  }

  if (existing.currentLevel < 1) {
    existing.currentLevel = 1;
    changed = true;
  }

  if (existing.currentLevel > existing.levelsUnlocked) {
    existing.currentLevel = existing.levelsUnlocked;
    changed = true;
  }

  map[key] = existing;
  return changed;
};

const normalizeActiveHomeBackground = (state: HomeState): boolean => {
  let changed = false;
  const active = state.cosmetics.homeBackground.activeSelection;

  const isValidSelection = (source: AchievementKey, level: number): boolean => {
    const progress = state.cosmetics.homeBackground.byAchievement[source];
    if (!progress) {
      return false;
    }
    if (level < 1 || level > progress.levelsUnlocked) {
      return false;
    }
    return !!getThemeLevelDefinition(source, level);
  };

  if (active) {
    if (!isValidSelection(active.source, active.level)) {
      state.cosmetics.homeBackground.activeSelection = null;
      changed = true;
    }
  }

  if (!state.cosmetics.homeBackground.activeSelection) {
    const fallback = ACHIEVEMENT_KEYS.find((key) =>
      isValidSelection(key, state.cosmetics.homeBackground.byAchievement[key]?.currentLevel ?? 0),
    );
    if (fallback) {
      const progress = state.cosmetics.homeBackground.byAchievement[fallback]!;
      state.cosmetics.homeBackground.activeSelection = {
        source: fallback,
        level: Math.min(progress.currentLevel, progress.levelsUnlocked),
      };
      changed = true;
    }
  }

  return changed;
};

const ensureCosmeticsForUnlockedAchievements = (state: HomeState): boolean => {
  let changed = false;
  ACHIEVEMENT_KEYS.forEach((key) => {
    if (state.achievements[key]?.unlocked) {
      changed = ensureCosmeticProgressForAchievement(state, key) || changed;
    }
  });
  changed = normalizeActiveHomeBackground(state) || changed;
  return changed;
};

const getProgressForAchievement = (
  state: HomeState,
  key: AchievementKey,
): CosmeticThemeProgress | undefined => state.cosmetics.homeBackground.byAchievement[key];

const getNextHomeBackgroundLevel = (
  state: HomeState,
  key: AchievementKey,
): { level: number; cost: number; definition: ThemeLevelDefinition } | null => {
  const progress = getProgressForAchievement(state, key);
  if (!progress || !state.achievements[key]?.unlocked) {
    return null;
  }
  const theme = getThemeForAchievement(key);
  const nextLevel = progress.levelsUnlocked + 1;
  if (nextLevel > theme.levels.length) {
    return null;
  }
  const definition = theme.levels[nextLevel - 1];
  return {
    level: nextLevel,
    cost: theme.baseCost * nextLevel,
    definition,
  };
};

const mutateHomeState = (
  mutator: (draft: HomeState) => { changed: boolean; error?: string },
): { state: HomeState; changed: boolean; error?: string } => {
  let state = loadHomeState();
  const draft = cloneState(state);
  const result = mutator(draft);
  if (result.changed) {
    saveHomeState(draft);
    state = draft;
  }
  return { state, ...result };
};

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

  const cosmeticsChanged = ensureCosmeticsForUnlockedAchievements(state);

  return changed || cosmeticsChanged;
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
  if (changed) {
    return { state: cloned, changed: true };
  }
  const cosmeticsChanged = ensureCosmeticsForUnlockedAchievements(cloned);
  return cosmeticsChanged ? { state: cloned, changed: true } : { state, changed: false };
};

export type HomeBackgroundStyle =
  | { kind: 'color'; color: string }
  | { kind: 'image'; src: string };

const definitionToStyle = (definition: ThemeLevelDefinition): HomeBackgroundStyle =>
  definition.kind === 'color'
    ? { kind: 'color', color: definition.value }
    : { kind: 'image', src: definition.value };

export const getHomeBackgroundStyle = (state: HomeState): HomeBackgroundStyle => {
  const selection = state.cosmetics.homeBackground.activeSelection;
  if (selection) {
    const definition = getThemeLevelDefinition(selection.source, selection.level);
    if (definition) {
      return definitionToStyle(definition);
    }
  }
  return { kind: 'color', color: HOME_BACKGROUND_DEFAULT_COLOR };
};

export interface HomeBackgroundOption {
  source: AchievementKey;
  level: number;
  unlocked: boolean;
  selected: boolean;
  style: HomeBackgroundStyle | null;
  purchasable: boolean;
  cost?: number;
}

export const getHomeBackgroundOptions = (state: HomeState): HomeBackgroundOption[] => {
  const options: HomeBackgroundOption[] = [];
  const active = state.cosmetics.homeBackground.activeSelection;

  ACHIEVEMENT_KEYS.forEach((key) => {
    const theme = getThemeForAchievement(key);
    const progress = state.cosmetics.homeBackground.byAchievement[key];
    const levelsUnlocked = progress?.levelsUnlocked ?? 0;
    const nextInfo = getNextHomeBackgroundLevelCost(state, key);
    for (let level = 1; level <= theme.levels.length; level += 1) {
      const unlocked = level <= levelsUnlocked;
      const selected = active?.source === key && active.level === level;
      const definition = unlocked ? getThemeLevelDefinition(key, level) : null;
      const style = definition ? definitionToStyle(definition) : null;
      const purchasable =
        !unlocked &&
        !!progress &&
        nextInfo?.level === level &&
        state.currency >= (nextInfo?.cost ?? Number.MAX_SAFE_INTEGER);
      options.push({
        source: key,
        level,
        unlocked,
        selected,
        style,
        purchasable,
        cost: purchasable ? nextInfo?.cost : undefined,
      });
    }
  });

  return options;
};

export const purchaseHomeBackgroundLevel = (
  key: AchievementKey,
): { success: boolean; error?: string; state: HomeState; cost?: number } => {
  let purchaseCost: number | undefined;
  const { state, changed, error } = mutateHomeState((draft) => {
    if (!draft.achievements[key]?.unlocked) {
      return { changed: false, error: 'achievement_locked' };
    }
    const nextInfo = getNextHomeBackgroundLevel(draft, key);
    if (!nextInfo) {
      return { changed: false, error: 'max_level_reached' };
    }
    if (draft.currency < nextInfo.cost) {
      return { changed: false, error: 'insufficient_currency' };
    }
    const progress = draft.cosmetics.homeBackground.byAchievement[key]!;
    draft.currency -= nextInfo.cost;
    progress.levelsUnlocked = nextInfo.level;
    progress.currentLevel = nextInfo.level;
    draft.cosmetics.homeBackground.activeSelection = { source: key, level: nextInfo.level };
    ensureCosmeticsForUnlockedAchievements(draft);
    purchaseCost = nextInfo.cost;
    return { changed: true };
  });

  return {
    success: changed,
    error,
    state,
    cost: purchaseCost,
  };
};

export const setActiveHomeBackground = (
  source: AchievementKey,
  level: number,
): { success: boolean; error?: string; state: HomeState } => {
  const { state, changed, error } = mutateHomeState((draft) => {
    const progress = draft.cosmetics.homeBackground.byAchievement[source];
    if (!progress || level < 1 || level > progress.levelsUnlocked) {
      return { changed: false, error: 'level_locked' };
    }
    if (!getThemeLevelDefinition(source, level)) {
      return { changed: false, error: 'invalid_level' };
    }
    draft.cosmetics.homeBackground.activeSelection = { source, level };
    ensureCosmeticsForUnlockedAchievements(draft);
    return { changed: true };
  });

  return { success: changed, error, state };
};

export const getNextHomeBackgroundLevelCost = (
  state: HomeState,
  key: AchievementKey,
): { level: number; cost: number } | null => {
  const info = getNextHomeBackgroundLevel(state, key);
  if (!info) {
    return null;
  }
  return { level: info.level, cost: info.cost };
};

export const getHomeBackgroundThemesConfig = () => HOME_BACKGROUND_THEMES;



