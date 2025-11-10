import React, { useCallback, useEffect, useState } from 'react';
import TimePicker from '../components/TimePicker';
import {
  GOAL_REWARD,
  calculateProductiveMinutes,
  ensureAchievementsUpToDate,
  loadHomeState,
  processPendingDays,
  saveHomeState,
  setDailyGoal,
} from '../utils/homeStorage';
import { getDateKey, getStartOfDay } from '../utils/dateUtils';
import './HomePage.css';

const REFRESH_INTERVAL_MS = 30_000;

const getPlural = (value: number, one: string, few: string, many: string): string => {
  const mod100 = value % 100;
  const mod10 = value % 10;

  if (mod100 >= 11 && mod100 <= 14) {
    return many;
  }
  if (mod10 === 1) {
    return one;
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return few;
  }
  return many;
};

const formatDuration = (totalMinutes: number): string => {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours} ${getPlural(hours, 'час', 'часа', 'часов')}`);
  }

  if (minutes > 0 || parts.length === 0) {
    parts.push(`${minutes} ${getPlural(minutes, 'минута', 'минуты', 'минут')}`);
  }

  return parts.join(' ');
};

const HomePage: React.FC = () => {
  const [homeState, setHomeState] = useState(() => {
    const initialState = loadHomeState();
    const { state: processedState, changed } = processPendingDays(initialState, new Date());
    if (changed) {
      saveHomeState(processedState);
    }
    return processedState;
  });

  const [productiveMinutes, setProductiveMinutes] = useState(() => {
    return calculateProductiveMinutes(new Date());
  });

  const [showGoalPicker, setShowGoalPicker] = useState(false);

  const todayStart = getStartOfDay(new Date());
  const todayKey = getDateKey(todayStart);
  const todayGoal = homeState.goals[todayKey];

  const updateHomeData = useCallback(() => {
    const now = new Date();
    const today = getStartOfDay(now);
    const todayDateKey = getDateKey(today);

    let state = loadHomeState();
    let mutated = false;

    const processed = processPendingDays(state, now);
    if (processed.changed) {
      state = processed.state;
      mutated = true;
    }

    const productive = calculateProductiveMinutes(today);

    const goalForToday = state.goals[todayDateKey];
    if (goalForToday) {
      const goalCompletedToday =
        goalForToday.targetMinutes > 0 && productive >= goalForToday.targetMinutes;

      if (goalCompletedToday) {
        const alreadyCompleted = goalForToday.completed;
        const rewardGranted = goalForToday.rewardGranted;
        const countedInStreak = goalForToday.countedInStreak;

        if (!alreadyCompleted || !rewardGranted || !countedInStreak) {
          const updatedGoal = {
            ...goalForToday,
            completed: true,
            countedInStreak: true,
            rewardGranted: true,
          };

          let updatedCurrency = state.currency;
          if (!rewardGranted) {
            updatedCurrency += GOAL_REWARD;
          }

          let updatedStreak = state.currentStreak;
          if (!countedInStreak) {
            updatedStreak += 1;
          }

          state = {
            ...state,
            currentStreak: updatedStreak,
            lastProcessedDate: todayDateKey,
            currency: updatedCurrency,
            goals: {
              ...state.goals,
              [todayDateKey]: updatedGoal,
            },
          };
          mutated = true;
        }
      }
    }

    const achievementsResult = ensureAchievementsUpToDate(state, now);
    if (achievementsResult.changed) {
      state = achievementsResult.state;
      mutated = true;
    }

    if (mutated) {
      saveHomeState(state);
    }

    setHomeState(state);
    setProductiveMinutes(productive);
  }, []);

  useEffect(() => {
    updateHomeData();

    const intervalId = window.setInterval(updateHomeData, REFRESH_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        updateHomeData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [updateHomeData]);

  const handleGoalButtonClick = () => {
    if (todayGoal) {
      return;
    }
    setShowGoalPicker(true);
  };

  const handleGoalSelect = (hour: number, minute: number) => {
    const totalMinutes = hour * 60 + minute;
    setShowGoalPicker(false);

    if (totalMinutes <= 0) {
      updateHomeData();
      return;
    }

    const updatedState = setDailyGoal(todayStart, totalMinutes);
    setHomeState(updatedState);
    updateHomeData();
  };

  const handleGoalPickerCancel = () => {
    setShowGoalPicker(false);
  };

  const remainingMinutes = todayGoal
    ? Math.max(todayGoal.targetMinutes - productiveMinutes, 0)
    : null;

  const goalCompleted = !!todayGoal && remainingMinutes === 0;

  const streakWord = getPlural(homeState.currentStreak, 'день', 'дня', 'дней');

  const targetSummary = todayGoal
    ? `Цель: ${formatDuration(todayGoal.targetMinutes)}`
    : null;

  const productiveSummary = todayGoal
    ? `Выполнено: ${formatDuration(productiveMinutes)}`
    : null;

  const goalMessage = goalCompleted
    ? 'Цель выполнена!'
    : remainingMinutes !== null
      ? `Осталось ${formatDuration(remainingMinutes)}`
      : null;

  const streakImage = homeState.currentStreak > 0 ? 'media/happy1.svg' : 'media/sad.svg';
  const streakImageAlt = homeState.currentStreak > 0 ? 'Отличное настроение' : 'Пора собраться';

  return (
    <div className="home-page">
      <div className="home-header">
        <h2 className="home-title">Вы в ударе {homeState.currentStreak} {streakWord}</h2>
        {!todayGoal && (
          <button className="home-goal-button" onClick={handleGoalButtonClick}>
            Установить цели на сегодня
          </button>
        )}
        {todayGoal && (
          <div className={`home-goal-status ${goalCompleted ? 'home-goal-status--success' : ''}`}>
            {goalMessage}
          </div>
        )}
        {todayGoal && (
          <div className="home-goal-progress">
            <span>{targetSummary}</span>
            <span>{productiveSummary}</span>
          </div>
        )}
      </div>

      <div className="home-illustration">
        <img src={streakImage} alt={streakImageAlt} className="home-illustration-image" />
      </div>

      {showGoalPicker && (
        <TimePicker
          onTimeSelect={handleGoalSelect}
          onCancel={handleGoalPickerCancel}
          initialHour={todayGoal ? Math.floor(todayGoal.targetMinutes / 60) : undefined}
          initialMinute={todayGoal ? todayGoal.targetMinutes % 60 : undefined}
        />
      )}
    </div>
  );
};

export default HomePage;

