export interface DailyGoalState {
  targetMinutes: number;
  completed: boolean;
  countedInStreak: boolean;
  rewardGranted: boolean;
  productiveRewardedHours: number;
  setAt: string;
}

export interface AchievementFlag {
  unlocked: boolean;
  unlockedAt: string | null;
}

export interface AchievementsState {
  workDay: AchievementFlag; // Рабочий день - проработать 8 часов за день
  firstGoalCompleted: AchievementFlag; // Первый шаг - выполните дневную цель
  planner: AchievementFlag; // Планровщик - установите цель на завтра
  sociality: AchievementFlag; // Социальность - добавьте друга
  focus: AchievementFlag; // Фокус - завершите 30 минут работы
  healthySleep: AchievementFlag; // Здоровый сон - проспать 56 часов за неделю (скрыто)
}

export type AchievementKey = keyof AchievementsState;

export interface CosmeticThemeProgress {
  levelsUnlocked: number;
  currentLevel: number;
}

export type CosmeticCategory = 'backgrounds';

export interface CosmeticCategoryState {
  byAchievement: Partial<Record<AchievementKey, CosmeticThemeProgress>>;
  activeSelection: { source: AchievementKey; level: number } | null;
}

export interface HomeCosmeticsState {
  backgrounds: CosmeticCategoryState;
}

export interface HomeState {
  currentStreak: number;
  lastProcessedDate: string | null;
  currency: number;
  goals: Record<string, DailyGoalState>;
  achievements: AchievementsState;
  cosmetics: HomeCosmeticsState;
}

export const DEFAULT_HOME_STATE: HomeState = {
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
  },
};
