export interface DailyGoalState {
  targetMinutes: number;
  completed: boolean;
  countedInStreak: boolean;
  rewardGranted: boolean;
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

export interface HomeState {
  currentStreak: number;
  lastProcessedDate: string | null;
  currency: number;
  goals: Record<string, DailyGoalState>;
  achievements: AchievementsState;
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
};
