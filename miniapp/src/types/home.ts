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
  firstGoalCompleted: AchievementFlag;
  focusEightHours: AchievementFlag;
  sleepSevenNights: AchievementFlag;
}

export type AchievementKey = keyof AchievementsState;

export interface CosmeticThemeProgress {
  levelsUnlocked: number;
  currentLevel: number;
}

export type CosmeticCategory = 'backgrounds' | 'hats';

export interface CosmeticCategoryState {
  byAchievement: Partial<Record<AchievementKey, CosmeticThemeProgress>>;
  activeSelection: { source: AchievementKey; level: number } | null;
}

export interface HomeCosmeticsState {
  backgrounds: CosmeticCategoryState;
  hats: CosmeticCategoryState;
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
    firstGoalCompleted: { unlocked: false, unlockedAt: null },
    focusEightHours: { unlocked: false, unlockedAt: null },
    sleepSevenNights: { unlocked: false, unlockedAt: null },
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
