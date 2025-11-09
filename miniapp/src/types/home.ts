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

export const DEFAULT_HOME_STATE: HomeState = {
  currentStreak: 0,
  lastProcessedDate: null,
  goals: {},
};


