import React, { useCallback, useEffect, useMemo, useState } from 'react';
import TimePicker from '../components/TimePicker';
import HomeCustomizationModal, {
  HomeCustomizationItem,
  HomeCustomizationSection,
} from '../components/HomeCustomizationModal';
import {
  calculateProductiveMinutes,
  ensureAchievementsUpToDate,
  getCosmeticOptions,
  getCosmeticThemeConfig,
  getHomeBackgroundStyle,
  getHomeHatStyle,
  getNextCosmeticLevelCost,
  loadHomeState,
  processPendingDays,
  saveHomeState,
  setDailyGoal,
  updateTodayGoal,
  CosmeticOption,
} from '../utils/homeStorage';
import { addDays, getDateKey, getStartOfDay } from '../utils/dateUtils';
import { AchievementKey } from '../types/home';
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
    const { state: processedState, changed: processedChanged } = processPendingDays(initialState, new Date());
    let state = processedState;
    let changed = processedChanged;
    
    const { state: todayState, changed: todayChanged } = updateTodayGoal(state, new Date());
    if (todayChanged) {
      state = todayState;
      changed = true;
    }
    
    if (changed) {
      saveHomeState(state);
    }
    return state;
  });

  const [productiveMinutes, setProductiveMinutes] = useState(() => {
    return calculateProductiveMinutes(new Date());
  });

  const [showGoalPicker, setShowGoalPicker] = useState(false);
  const [showGoalPickerForTomorrow, setShowGoalPickerForTomorrow] = useState(false);
  const [showCustomizationModal, setShowCustomizationModal] = useState(false);
  const [recentlyUnlocked, setRecentlyUnlocked] = useState<boolean>(false);

  const todayStart = getStartOfDay(new Date());
  const todayKey = getDateKey(todayStart);
  const todayGoal = homeState.goals[todayKey];

  const tomorrowStart = getStartOfDay(addDays(new Date(), 1));
  const tomorrowKey = getDateKey(tomorrowStart);
  const tomorrowGoal = homeState.goals[tomorrowKey];

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

    const todayResult = updateTodayGoal(state, now);
    if (todayResult.changed) {
      state = todayResult.state;
      mutated = true;
    }

    const productive = calculateProductiveMinutes(today);

    const achievementsResult = ensureAchievementsUpToDate(state, now);
    if (achievementsResult.changed) {
      state = achievementsResult.state;
      mutated = true;
      setRecentlyUnlocked(true);
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

  const handleTomorrowGoalButtonClick = () => {
    if (tomorrowGoal) {
      return;
    }
    setShowGoalPickerForTomorrow(true);
  };

  const handleTomorrowGoalSelect = (hour: number, minute: number) => {
    const totalMinutes = hour * 60 + minute;
    setShowGoalPickerForTomorrow(false);

    if (totalMinutes <= 0) {
      updateHomeData();
      return;
    }

    const updatedState = setDailyGoal(tomorrowStart, totalMinutes);
    setHomeState(updatedState);
    updateHomeData();
  };

  const handleTomorrowGoalPickerCancel = () => {
    setShowGoalPickerForTomorrow(false);
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

  const backgroundStyleDef = useMemo(() => getHomeBackgroundStyle(homeState), [homeState]);
  const hatStyleDef = useMemo(() => getHomeHatStyle(homeState), [homeState]);
  const homePageStyle = useMemo<React.CSSProperties>(() => {
    if (backgroundStyleDef.kind === 'color') {
      return { backgroundColor: backgroundStyleDef.color };
    }
    return {
      backgroundColor: '#0f172a',
      backgroundImage: `url(${backgroundStyleDef.src})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    };
  }, [backgroundStyleDef]);
  const backgroundOptions = useMemo(
    () => getCosmeticOptions(homeState, 'backgrounds'),
    [homeState],
  );
  const hatOptions = useMemo(() => getCosmeticOptions(homeState, 'hats'), [homeState]);
  const currency = homeState.currency;
  const themeConfig = useMemo(() => getCosmeticThemeConfig(), []);

  const buildCustomizationItems = useCallback(
    (category: 'backgrounds' | 'hats', options: CosmeticOption[]) => {
      const groups = new Map<AchievementKey, HomeCustomizationItem['levels']>();
      options.forEach((option) => {
        const key = option.source as AchievementKey;
        if (!option.unlocked || !option.style) {
          return;
        }
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)!.push({
          level: option.level,
          preview: option.style,
          selected: option.selected,
        });
      });

      return Array.from(groups.entries())
        .map(([key, levels]) => {
          const theme = themeConfig[key];
          if (!theme || theme.category !== category) {
            return null;
          }
          const sortedLevels = levels.sort((a, b) => a.level - b.level);
          const nextLevelInfo = getNextCosmeticLevelCost(homeState, key);
          return {
            category,
            key,
            title: theme.title,
            description: theme.description,
            levels: sortedLevels,
            nextLevelCost: nextLevelInfo?.cost,
            hasMoreLevels: !!nextLevelInfo,
          } as HomeCustomizationItem;
        })
        .filter((item): item is HomeCustomizationItem => !!item && item.levels.length > 0);
    },
    [homeState, themeConfig],
  );

  const backgroundItems = useMemo(
    () => buildCustomizationItems('backgrounds', backgroundOptions),
    [buildCustomizationItems, backgroundOptions],
  );
  const hatItems = useMemo(
    () => buildCustomizationItems('hats', hatOptions),
    [buildCustomizationItems, hatOptions],
  );

  const customizationSections: HomeCustomizationSection[] = useMemo(() => {
    const sectionsList: HomeCustomizationSection[] = [];
    if (backgroundItems.length > 0) {
      sectionsList.push({
        category: 'backgrounds',
        title: 'Фоны',
        items: backgroundItems,
      });
    }
    if (hatItems.length > 0) {
      sectionsList.push({
        category: 'hats',
        title: 'Головные уборы',
        items: hatItems,
      });
    }
    return sectionsList;
  }, [backgroundItems, hatItems]);

  return (
    <div className="home-page" style={homePageStyle}>
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
        {goalCompleted && !tomorrowGoal && (
          <button className="home-goal-button home-goal-button--tomorrow" onClick={handleTomorrowGoalButtonClick}>
            Установить цель на завтра
          </button>
        )}
      </div>

      <div className="home-illustration">
        <div className="home-illustration-avatar">
          {hatStyleDef && hatStyleDef.kind === 'image' && (
            <img src={hatStyleDef.src} alt="" className="home-illustration-hat" />
          )}
          <img src={streakImage} alt={streakImageAlt} className="home-illustration-image" />
        </div>
      </div>

      <div className="home-actions">
        <button
          className="home-customize-button"
          onClick={() => {
            setShowCustomizationModal(true);
            setRecentlyUnlocked(false);
          }}
        >
          Кастомизация
          {recentlyUnlocked && <span className="home-customize-badge">!</span>}
        </button>
      </div>

      {showGoalPicker && (
        <TimePicker
          onTimeSelect={handleGoalSelect}
          onCancel={handleGoalPickerCancel}
          initialHour={todayGoal ? Math.floor(todayGoal.targetMinutes / 60) : undefined}
          initialMinute={todayGoal ? todayGoal.targetMinutes % 60 : undefined}
        />
      )}

      {showGoalPickerForTomorrow && (
        <TimePicker
          onTimeSelect={handleTomorrowGoalSelect}
          onCancel={handleTomorrowGoalPickerCancel}
          initialHour={todayGoal ? Math.floor(todayGoal.targetMinutes / 60) : undefined}
          initialMinute={todayGoal ? todayGoal.targetMinutes % 60 : undefined}
        />
      )}

      {showCustomizationModal && (
        <HomeCustomizationModal
          sections={customizationSections}
          currency={currency}
          onClose={() => setShowCustomizationModal(false)}
          onRefresh={() => {
            setHomeState(loadHomeState());
            setRecentlyUnlocked(false);
          }}
        />
      )}
    </div>
  );
};

export default HomePage;

