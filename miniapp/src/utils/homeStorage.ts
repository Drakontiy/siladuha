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
const EIGHT_HOUR_MINUTES = 8 * 60;
const PRODUCTIVE_ACHIEVEMENT_LOOKBACK_DAYS = 30;
const SLEEP_ACHIEVEMENT_LOOKBACK_DAYS = 7;
const SLEEP_WEEK_MINUTES = 56 * 60;

// Начисление газа за продуктивную работу: 10 газа за час
const PRODUCTIVE_HOUR_REWARD = 10;

// Начисление газа за выполнение целей:
// 1 день в ударе = 100 газа
// 2 дня в ударе = 200 газа
// 3+ дней в ударе = 300 газа
const getGoalReward = (streak: number): number => {
  if (streak === 1) return 100;
  if (streak === 2) return 200;
  if (streak >= 3) return 300;
  return 0;
};

export const GOAL_REWARD = 100; // Для совместимости, но не используется напрямую

export type ThemeLevelDefinition =
  | { kind: 'color'; value: string }
  | { kind: 'image'; value: string };

// Вспомогательная функция для получения файлов из папки
// Использует реальные имена файлов из папок
const getFirstLevelFromFolder = (folderName: string, fileNames: string[]): ThemeLevelDefinition[] => {
  const levels: ThemeLevelDefinition[] = [];
  // Первый файл - это первый уровень (бесплатный при получении достижения), остальные можно покупать
  fileNames.forEach((fileName) => {
    levels.push({ kind: 'image', value: `media/${folderName}/${fileName}` });
  });
  return levels;
};

const ACHIEVEMENT_THEME_CONFIG: Record<
  AchievementKey,
  {
    category: CosmeticCategory;
    levels: ThemeLevelDefinition[];
    baseCost: number;
    title: string;
    description: string;
    visible: boolean; // Показывать ли достижение на странице предметов
  }
> = {
  workDay: {
    category: 'hats',
    levels: getFirstLevelFromFolder('green', ['HatFrog1.svg']),
    baseCost: 100,
    title: 'Рабочий день',
    description: 'Проработать 8 часов за день',
    visible: true,
  },
  firstGoalCompleted: {
    category: 'backgrounds',
    levels: getFirstLevelFromFolder('forest', ['forest0.svg', 'forest1.svg', 'forest2.svg', 'forest3.svg']),
    baseCost: 100,
    title: 'Первый шаг',
    description: 'Выполните дневную цель',
    visible: true,
  },
  planner: {
    category: 'hats',
    levels: getFirstLevelFromFolder('blue', ['HatCat1.svg']),
    baseCost: 100,
    title: 'Планровщик',
    description: 'Установите цель на завтра',
    visible: true,
  },
  sociality: {
    category: 'hats',
    levels: getFirstLevelFromFolder('red', ['HatDefault1.svg', 'HatHeart2.svg', 'HatBerry3.svg']),
    baseCost: 100,
    title: 'Социальность',
    description: 'Добавьте друга',
    visible: true,
  },
  focus: {
    category: 'hats',
    levels: getFirstLevelFromFolder('blue', ['HatCat1.svg']),
    baseCost: 100,
    title: 'Фокус',
    description: 'Завершите 30 минут работы',
    visible: true,
  },
  healthySleep: {
    category: 'hats',
    levels: getFirstLevelFromFolder('yellow', ['HatSun1.svg', 'HatCacke2.svg']),
    baseCost: 100,
    title: 'Здоровый сон',
    description: 'Проспать 56 часов за неделю',
    visible: true,
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
  workDay: cloneAchievementFlag(achievements.workDay),
  firstGoalCompleted: cloneAchievementFlag(achievements.firstGoalCompleted),
  planner: cloneAchievementFlag(achievements.planner),
  sociality: cloneAchievementFlag(achievements.sociality),
  focus: cloneAchievementFlag(achievements.focus),
  healthySleep: cloneAchievementFlag(achievements.healthySleep),
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

const cloneCosmetics = (cosmetics: HomeCosmeticsState | any): HomeCosmeticsState => {
  // Миграция: добавляем hats категорию, если её нет в старых данных
  const oldCosmetics = cosmetics || {};
  
  return {
    backgrounds: oldCosmetics.backgrounds 
      ? cloneCosmeticCategoryState(oldCosmetics.backgrounds)
      : { byAchievement: {}, activeSelection: null },
    hats: oldCosmetics.hats 
      ? cloneCosmeticCategoryState(oldCosmetics.hats)
      : { byAchievement: {}, activeSelection: null },
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

const getThemeForAchievement = (key: AchievementKey) => {
  // Обработка '__none__' как специального ключа
  if (key === '__none__' as AchievementKey) {
    return null;
  }
  return ACHIEVEMENT_THEME_CONFIG[key];
};

const getThemeLevelDefinition = (key: AchievementKey, level: number): ThemeLevelDefinition | null => {
  // Обработка '__none__' как специального ключа
  if (key === '__none__' as AchievementKey) {
    return null;
  }
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
  if (!theme) {
    return false;
  }
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
  if (!theme) {
    return undefined;
  }
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
  if (!theme) {
    return null;
  }
  const nextLevel = progress.levelsUnlocked + 1;
  if (nextLevel > theme.levels.length) {
    return null;
  }
  const definition = theme.levels[nextLevel - 1];
  
  // Логика: первый уровень бесплатен (базовая награда при получении достижения)
  // Остальные уровни стоят baseCost * (level - 1)
  // Например: level 2 = 100, level 3 = 200, level 4 = 300 и т.д.
  const cost: number = theme.baseCost * (nextLevel - 1);
  
  return {
    level: nextLevel,
    cost,
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

// Проверка завершения 30 минут работы
const hasCompleted30MinutesWork = (referenceDate: Date): boolean => {
  const today = getStartOfDay(referenceDate);
  const dayActivity = getDayActivity(today);
  
  // Проверяем интервалы продуктивной работы длительностью 30 минут или больше
  const marksMap = new Map<string, TimeMark>();
  dayActivity.marks.forEach(mark => marksMap.set(mark.id, mark));
  
  const getMinuteForMark = (markId: string): number => {
    if (markId === VIRTUAL_START_ID) return 0;
    if (markId === VIRTUAL_END_ID) return DAY_TOTAL_MINUTES;
    const mark = marksMap.get(markId);
    return mark ? mark.timestamp : 0;
  };
  
  for (const interval of dayActivity.intervals) {
    if (interval.type === 'productive') {
      const startMinute = getMinuteForMark(interval.startMarkId);
      const endMinute = getMinuteForMark(interval.endMarkId);
      if (endMinute > startMinute && (endMinute - startMinute) >= 30) {
        return true;
      }
    }
  }
  return false;
};

// Проверка наличия друзей
const hasFriends = (): boolean => {
  try {
    const { getSocialState } = require('./userStateSync');
    const socialState = getSocialState();
    return socialState && socialState.friends && socialState.friends.length > 0;
  } catch {
    return false;
  }
};

// Проверка установки цели на завтра
const hasGoalSetForTomorrow = (state: HomeState, referenceDate: Date): boolean => {
  const tomorrow = addDays(getStartOfDay(referenceDate), 1);
  const tomorrowKey = getDateKey(tomorrow);
  const tomorrowGoal = state.goals[tomorrowKey];
  return tomorrowGoal && tomorrowGoal.targetMinutes > 0;
};

const evaluateAchievements = (state: HomeState, referenceDate: Date): boolean => {
  let changed = false;

  // Рабочий день - проработать 8 часов за день
  if (
    !state.achievements.workDay.unlocked &&
    hasProductiveDayWithMinutes(referenceDate, PRODUCTIVE_ACHIEVEMENT_LOOKBACK_DAYS, EIGHT_HOUR_MINUTES)
  ) {
    changed = unlockAchievement(state, 'workDay') || changed;
  }

  // Первый шаг - выполните дневную цель
  if (
    !state.achievements.firstGoalCompleted.unlocked &&
    Object.values(state.goals).some((goal) => goal?.completed)
  ) {
    changed = unlockAchievement(state, 'firstGoalCompleted') || changed;
  }

  // Планровщик - установите цель на завтра
  if (
    !state.achievements.planner.unlocked &&
    hasGoalSetForTomorrow(state, referenceDate)
  ) {
    changed = unlockAchievement(state, 'planner') || changed;
  }

  // Социальность - добавьте друга
  if (
    !state.achievements.sociality.unlocked &&
    hasFriends()
  ) {
    changed = unlockAchievement(state, 'sociality') || changed;
  }

  // Фокус - завершите 30 минут работы
  if (
    !state.achievements.focus.unlocked &&
    hasCompleted30MinutesWork(referenceDate)
  ) {
    changed = unlockAchievement(state, 'focus') || changed;
  }

  // Здоровый сон - проспать 56 часов за неделю (скрыто)
  if (!state.achievements.healthySleep.unlocked) {
    const totalSleepMinutes = sumActivityMinutesOverRange(
      referenceDate,
      SLEEP_ACHIEVEMENT_LOOKBACK_DAYS,
      'sleep',
    );
    if (totalSleepMinutes >= SLEEP_WEEK_MINUTES) {
      changed = unlockAchievement(state, 'healthySleep') || changed;
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
    
    // Обновляем productiveRewardedHours, но не начисляем газ здесь
    // Газ начисляется в реальном времени при изменении интервалов

    let rewardGranted = previousRewardGranted;
    let countedInStreak = previousCountedInStreak;
    if (targetMinutes > 0) {
      if (completed) {
        if (!previousCountedInStreak) {
          currentStreak += 1;
          countedInStreak = true;
        }
        if (!rewardGranted) {
          const streakReward = getGoalReward(currentStreak);
          nextState.currency += streakReward;
          rewardGranted = true;
          currencyChanged = true;
        }
      } else {
        currentStreak = 0;
        countedInStreak = true;
      }
    }

    // Обновляем productiveRewardedHours, но не начисляем газ здесь
    // Газ начисляется в реальном времени при изменении интервалов
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

  // Обновляем productiveRewardedHours, но не начисляем газ здесь
  // Газ начисляется в реальном времени при изменении интервалов

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
      const streakReward = getGoalReward(currentStreak);
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

  // Добавляем опцию "пусто" в начало списка
  options.push({
    category,
    source: '__none__' as AchievementKey,
    level: 0,
    unlocked: true,
    selected: active === null,
    style: category === 'backgrounds' ? { kind: 'color', color: HOME_BACKGROUND_DEFAULT_COLOR } : null,
    purchasable: false,
  });

  ACHIEVEMENT_KEYS.forEach((key) => {
    const theme = getThemeForAchievement(key);
    if (!theme || theme.category !== category) {
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
    if (!theme) {
      return { changed: false, error: 'invalid_theme' };
    }
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
    const categoryState = getCategoryState(draft.cosmetics, category);
    
    // Если source === '__none__' или level === 0, устанавливаем null (пустой выбор)
    if (source === '__none__' as AchievementKey || level === 0) {
      categoryState.activeSelection = null;
      return { changed: true };
    }
    
    const theme = getThemeForAchievement(source);
    if (!theme || theme.category !== category) {
      return { changed: false, error: 'invalid_level' };
    }
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

export const getHomeHatStyle = (state: HomeState): CosmeticStyle | null =>
  getActiveCosmeticStyle(state, 'hats');

export const getHomeHatOptions = (state: HomeState) => getCosmeticOptions(state, 'hats');

export const purchaseHomeBackgroundLevel = purchaseCosmeticLevel;

export const setActiveHomeBackground = (source: AchievementKey, level: number) =>
  setActiveCosmeticLevel('backgrounds', source, level);

export const getNextHomeBackgroundLevelCost = getNextCosmeticLevelCost;

export const getHomeBackgroundThemesConfig = () => ACHIEVEMENT_THEME_CONFIG;

/**
 * Обновляет газ при изменении продуктивных интервалов в реальном времени
 * Вызывается при добавлении, изменении или удалении продуктивных интервалов
 */
export const updateCurrencyForProductiveIntervals = (
  date: Date,
  previousProductiveMinutes: number | null = null
): void => {
  const state = loadHomeState();
  const dateKey = getDateKey(date);
  const goal = state.goals[dateKey];
  
  // Текущее количество продуктивных минут
  const currentProductiveMinutes = calculateProductiveMinutes(date);
  const currentProductiveHours = Math.floor(currentProductiveMinutes / 60);
  
  // Предыдущее количество продуктивных часов из цели
  const previousProductiveHours = goal?.productiveRewardedHours ?? 0;
  
  // Если previousProductiveMinutes передан, используем его
  const previousHours = previousProductiveMinutes !== null
    ? Math.floor(previousProductiveMinutes / 60)
    : previousProductiveHours;
  
  // Вычисляем разницу
  const hoursDelta = currentProductiveHours - previousHours;
  
  if (hoursDelta === 0) {
    // Обновляем только productiveRewardedHours без изменения газа
    if (goal && goal.productiveRewardedHours !== currentProductiveHours) {
      const nextState = cloneState(state);
      nextState.goals[dateKey] = {
        ...goal,
        productiveRewardedHours: currentProductiveHours,
      };
      saveHomeState(nextState);
    }
    return; // Ничего не изменилось в часах
  }
  
  const nextState = cloneState(state);
  
  if (hoursDelta > 0) {
    // Добавляем газ
    nextState.currency += hoursDelta * PRODUCTIVE_HOUR_REWARD;
  } else {
    // Убираем газ (но не уводим в минус)
    const deduction = Math.abs(hoursDelta) * PRODUCTIVE_HOUR_REWARD;
    nextState.currency = Math.max(0, nextState.currency - deduction);
  }
  
  // Обновляем productiveRewardedHours в цели
  if (!nextState.goals[dateKey]) {
    // Если цели нет, просто обновляем currency без создания цели
    saveHomeState(nextState);
    return;
  }
  
  nextState.goals[dateKey] = {
    ...nextState.goals[dateKey]!,
    productiveRewardedHours: currentProductiveHours,
  };
  
  saveHomeState(nextState);
};



