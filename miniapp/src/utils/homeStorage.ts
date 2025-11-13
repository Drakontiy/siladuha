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
  CosmeticCategory,
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

const ACHIEVEMENT_THEME_CONFIG: Record<
  AchievementKey,
  {
    category: CosmeticCategory;
    levels: ThemeLevelDefinition[];
    baseCost: number;
    title: string;
    description: string;
  }
> = {
  firstGoalCompleted: {
    category: 'hats',
    levels: [
      { kind: 'image', value: 'images/hat.svg' },
    ],
    baseCost: 150,
    title: 'Первый шаг',
    description: 'Элегантная шляпа за первую выполненную цель.',
  },
  focusEightHours: {
    category: 'backgrounds',
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
    category: 'backgrounds',
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
const ACHIEVEMENT_KEYS = Object.keys(ACHIEVEMENT_THEME_CONFIG) as AchievementKey[];
const COSMETIC_CATEGORIES: CosmeticCategory[] = ['backgrounds', 'hats'];

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

const cloneCosmeticCategoryState = (
  category: HomeCosmeticsState[CosmeticCategory],
): HomeCosmeticsState[CosmeticCategory] => {
  const byAchievement: HomeCosmeticsState[CosmeticCategory]['byAchievement'] = {};
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

const cloneCosmetics = (cosmetics: HomeCosmeticsState): HomeCosmeticsState => ({
  backgrounds: cloneCosmeticCategoryState(cosmetics.backgrounds),
  hats: cloneCosmeticCategoryState(cosmetics.hats),
});

const cloneState = (state: HomeState): HomeState => ({
  currentStreak: state.currentStreak,
  lastProcessedDate: state.lastProcessedDate,
  currency: state.currency,
  goals: cloneGoals(state.goals),
  achievements: cloneAchievements(state.achievements),
  cosmetics: cloneCosmetics(state.cosmetics),
});

const getThemeForAchievement = (key: AchievementKey) => ACHIEVEMENT_THEME_CONFIG[key];

const getThemeLevelDefinition = (key: AchievementKey, level: number): ThemeLevelDefinition | null => {
  const theme = getThemeForAchievement(key);
  if (!theme) {
    return null;
  }
  return theme.levels[level - 1] ?? null;
};

const getCategoryState = (cosmetics: HomeCosmeticsState, category: CosmeticCategory) =>
  cosmetics[category];

const ensureCosmeticProgressForAchievement = (state: HomeState, key: AchievementKey): boolean => {
  if (!state.achievements[key]?.unlocked) {
    return false;
  }
  const theme = getThemeForAchievement(key);
  const categoryState = getCategoryState(state.cosmetics, theme.category);
  const map = categoryState.byAchievement;
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

const normalizeCategoryActiveSelection = (state: HomeState, category: CosmeticCategory): boolean => {
  const categoryState = getCategoryState(state.cosmetics, category);
  const isValidSelection = (source: AchievementKey, level: number): boolean => {
    const theme = getThemeForAchievement(source);
    if (!theme || theme.category !== category) {
      return false;
    }
    const progress = categoryState.byAchievement[source];
    if (!progress) {
      return false;
    }
    if (level < 1 || level > progress.levelsUnlocked) {
      return false;
    }
    return !!getThemeLevelDefinition(source, level);
  };

  let changed = false;
  const active = categoryState.activeSelection;
  if (active) {
    if (!isValidSelection(active.source, active.level)) {
      categoryState.activeSelection = null;
      changed = true;
    }
  }

  if (!categoryState.activeSelection) {
    const unlockedEntries = (
      Object.entries(categoryState.byAchievement) as Array<[AchievementKey, CosmeticThemeProgress | undefined]>
    )
      .filter(([, progress]) => (progress?.levelsUnlocked ?? 0) > 0)
      .sort(
        (a, b) =>
          ACHIEVEMENT_KEYS.indexOf(a[0]) - ACHIEVEMENT_KEYS.indexOf(b[0]),
      );
    const fallback = unlockedEntries.find(([key, progress]) => {
      if (!progress) {
        return false;
      }
      const level = Math.min(progress.currentLevel || 1, progress.levelsUnlocked);
      return isValidSelection(key, level);
    });
    if (fallback) {
      const [source, progress] = fallback;
      if (progress) {
        const level = Math.min(progress.currentLevel || 1, progress.levelsUnlocked);
        categoryState.activeSelection = { source, level };
        changed = true;
      }
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
  COSMETIC_CATEGORIES.forEach((category) => {
    changed = normalizeCategoryActiveSelection(state, category) || changed;
  });
  return changed;
};

const getProgressForAchievement = (
  state: HomeState,
  key: AchievementKey,
): CosmeticThemeProgress | undefined => {
  const theme = getThemeForAchievement(key);
  const categoryState = getCategoryState(state.cosmetics, theme.category);
  return categoryState.byAchievement[key];
};

const getNextCosmeticLevelInfo = (
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
        productiveRewardedHours: 0,
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
    const previousRewardGranted = existingGoal?.rewardGranted ?? false;
    const previousCountedInStreak = existingGoal?.countedInStreak ?? false;
    const previousRewardedHours = existingGoal?.productiveRewardedHours ?? 0;

    const productiveHours = Math.floor(productiveMinutes / 60);

    if (productiveHours > previousRewardedHours) {
      const delta = productiveHours - previousRewardedHours;
      nextState.currency += delta * 10;
      currencyChanged = true;
    } else if (productiveHours < previousRewardedHours) {
      const delta = previousRewardedHours - productiveHours;
      const deduction = delta * 10;
      if (deduction > 0) {
        const adjustedCurrency = Math.max(0, nextState.currency - deduction);
        if (adjustedCurrency !== nextState.currency) {
          nextState.currency = adjustedCurrency;
          currencyChanged = true;
        }
      }
    }

    let rewardGranted = previousRewardGranted;
    let countedInStreak = previousCountedInStreak;
    if (targetMinutes > 0) {
      if (completed) {
        if (!previousCountedInStreak) {
          currentStreak += 1;
          countedInStreak = true;
        }
        if (!rewardGranted) {
          const streakReward = Math.min(currentStreak, 7) * GOAL_REWARD;
          nextState.currency += streakReward;
          rewardGranted = true;
          currencyChanged = true;
        }
      } else {
        currentStreak = 0;
        countedInStreak = true;
      }
    }

    nextState.goals[key] = {
      targetMinutes,
      completed,
      countedInStreak,
      rewardGranted,
      productiveRewardedHours: productiveHours,
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

export const updateTodayGoal = (
  state: HomeState,
  referenceDate: Date,
): { state: HomeState; changed: boolean } => {
  const today = getStartOfDay(referenceDate);
  const todayKey = getDateKey(today);
  const existingGoal = state.goals[todayKey];

  if (!existingGoal || existingGoal.targetMinutes === 0) {
    return { state, changed: false };
  }

  const productiveMinutes = calculateProductiveMinutes(today);
  const completed = productiveMinutes >= existingGoal.targetMinutes;
  const productiveHours = Math.floor(productiveMinutes / 60);
  const previousRewardedHours = existingGoal.productiveRewardedHours ?? 0;
  const previousCountedInStreak = existingGoal.countedInStreak ?? false;
  const previousRewardGranted = existingGoal.rewardGranted ?? false;

  const nextState = cloneState(state);
  let changed = false;
  let currencyChanged = false;
  let currentStreak = nextState.currentStreak;

  // Обновление валюты за продуктивные часы
  if (productiveHours > previousRewardedHours) {
    const delta = productiveHours - previousRewardedHours;
    nextState.currency += delta * 10;
    currencyChanged = true;
  } else if (productiveHours < previousRewardedHours) {
    const delta = previousRewardedHours - productiveHours;
    const deduction = delta * 10;
    if (deduction > 0) {
      const adjustedCurrency = Math.max(0, nextState.currency - deduction);
      if (adjustedCurrency !== nextState.currency) {
        nextState.currency = adjustedCurrency;
        currencyChanged = true;
      }
    }
  }

  // Обновление streak
  let rewardGranted = previousRewardGranted;
  let countedInStreak = previousCountedInStreak;

  if (completed) {
    if (!previousCountedInStreak) {
      currentStreak += 1;
      countedInStreak = true;
      changed = true;
    }
    if (!rewardGranted) {
      const streakReward = Math.min(currentStreak, 7) * GOAL_REWARD;
      nextState.currency += streakReward;
      rewardGranted = true;
      currencyChanged = true;
      changed = true;
    }
  }

  // Обновление цели только если что-то изменилось
  if (
    completed !== existingGoal.completed ||
    countedInStreak !== previousCountedInStreak ||
    rewardGranted !== previousRewardGranted ||
    productiveHours !== previousRewardedHours ||
    currentStreak !== nextState.currentStreak
  ) {
    nextState.goals[todayKey] = {
      targetMinutes: existingGoal.targetMinutes,
      completed,
      countedInStreak,
      rewardGranted,
      productiveRewardedHours: productiveHours,
      setAt: existingGoal.setAt,
    };
    nextState.currentStreak = currentStreak;
    changed = true;
  }

  if (!changed && !currencyChanged) {
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

export type CosmeticStyle =
  | { kind: 'color'; color: string }
  | { kind: 'image'; src: string };

const definitionToStyle = (definition: ThemeLevelDefinition): CosmeticStyle =>
  definition.kind === 'color'
    ? { kind: 'color', color: definition.value }
    : { kind: 'image', src: definition.value };

export const getActiveCosmeticStyle = (state: HomeState, category: CosmeticCategory): CosmeticStyle | null => {
  const categoryState = getCategoryState(state.cosmetics, category);
  const selection = categoryState.activeSelection;
  if (!selection) {
    return category === 'backgrounds' ? { kind: 'color', color: HOME_BACKGROUND_DEFAULT_COLOR } : null;
  }
  const definition = getThemeLevelDefinition(selection.source, selection.level);
  if (!definition) {
    return category === 'backgrounds' ? { kind: 'color', color: HOME_BACKGROUND_DEFAULT_COLOR } : null;
  }
  return definitionToStyle(definition);
};

export const getHomeBackgroundStyle = (state: HomeState): CosmeticStyle =>
  getActiveCosmeticStyle(state, 'backgrounds') ?? { kind: 'color', color: HOME_BACKGROUND_DEFAULT_COLOR };

export const getHomeHatStyle = (state: HomeState): CosmeticStyle | null =>
  getActiveCosmeticStyle(state, 'hats');

export interface CosmeticOption {
  category: CosmeticCategory;
  source: AchievementKey;
  level: number;
  unlocked: boolean;
  selected: boolean;
  style: CosmeticStyle | null;
  purchasable: boolean;
  cost?: number;
}

export const getCosmeticOptions = (state: HomeState, category: CosmeticCategory): CosmeticOption[] => {
  const options: CosmeticOption[] = [];
  const categoryState = getCategoryState(state.cosmetics, category);
  const active = categoryState.activeSelection;

  ACHIEVEMENT_KEYS.forEach((key) => {
    const theme = getThemeForAchievement(key);
    if (theme.category !== category) {
      return;
    }
    const progress = getProgressForAchievement(state, key);
    const levelsUnlocked = progress?.levelsUnlocked ?? 0;
    const nextInfo = getNextCosmeticLevelInfo(state, key);
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
        category,
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

export const purchaseCosmeticLevel = (
  key: AchievementKey,
): { success: boolean; error?: string; state: HomeState; cost?: number } => {
  let purchaseCost: number | undefined;
  const { state, changed, error } = mutateHomeState((draft) => {
    if (!draft.achievements[key]?.unlocked) {
      return { changed: false, error: 'achievement_locked' };
    }
    const theme = getThemeForAchievement(key);
    const nextInfo = getNextCosmeticLevelInfo(draft, key);
    if (!nextInfo) {
      return { changed: false, error: 'max_level_reached' };
    }
    if (draft.currency < nextInfo.cost) {
      return { changed: false, error: 'insufficient_currency' };
    }
    const categoryState = getCategoryState(draft.cosmetics, theme.category);
    const progress = categoryState.byAchievement[key]!;
    draft.currency -= nextInfo.cost;
    progress.levelsUnlocked = nextInfo.level;
    progress.currentLevel = nextInfo.level;
    categoryState.activeSelection = { source: key, level: nextInfo.level };
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

export const setActiveCosmeticLevel = (
  category: CosmeticCategory,
  source: AchievementKey,
  level: number,
): { success: boolean; error?: string; state: HomeState } => {
  const { state, changed, error } = mutateHomeState((draft) => {
    const theme = getThemeForAchievement(source);
    if (!theme || theme.category !== category) {
      return { changed: false, error: 'invalid_level' };
    }
    const categoryState = getCategoryState(draft.cosmetics, category);
    const progress = categoryState.byAchievement[source];
    if (!progress || level < 1 || level > progress.levelsUnlocked) {
      return { changed: false, error: 'level_locked' };
    }
    if (!getThemeLevelDefinition(source, level)) {
      return { changed: false, error: 'invalid_level' };
    }
    categoryState.activeSelection = { source, level };
    ensureCosmeticsForUnlockedAchievements(draft);
    return { changed: true };
  });

  return { success: changed, error, state };
};

export const getNextCosmeticLevelCost = (
  state: HomeState,
  key: AchievementKey,
): { level: number; cost: number } | null => {
  const info = getNextCosmeticLevelInfo(state, key);
  if (!info) {
    return null;
  }
  return { level: info.level, cost: info.cost };
};

export const getCosmeticThemeConfig = () => ACHIEVEMENT_THEME_CONFIG;

export const getHomeBackgroundOptions = (state: HomeState) =>
  getCosmeticOptions(state, 'backgrounds');

export const getHomeHatOptions = (state: HomeState) => getCosmeticOptions(state, 'hats');

export const purchaseHomeBackgroundLevel = purchaseCosmeticLevel;

export const setActiveHomeBackground = (source: AchievementKey, level: number) =>
  setActiveCosmeticLevel('backgrounds', source, level);

export const getNextHomeBackgroundLevelCost = getNextCosmeticLevelCost;

export const getHomeBackgroundThemesConfig = () => ACHIEVEMENT_THEME_CONFIG;



