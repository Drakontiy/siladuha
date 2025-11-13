import React, { useEffect, useMemo, useState } from 'react';
import './SubjectsPage.css';
import { HomeState } from '../types/home';
import { loadHomeState } from '../utils/homeStorage';
import { subscribeToUserStateChanges } from '../utils/userStateSync';

type AchievementKey = keyof HomeState['achievements'];

const ACHIEVEMENTS_CONFIG: Record<
  AchievementKey,
  {
    title: string;
    description: string;
  }
> = {
  firstGoalCompleted: {
    title: 'Первый шаг',
    description: 'Выполнить одну цель',
  },
  focusEightHours: {
    title: '8 часов фокуса',
    description: 'Проработать 8 часов за день',
  },
  sleepSevenNights: {
    title: 'Герой сна',
    description: 'Проспать 56 часов за неделю',
  },
};

const useHomeState = (): HomeState => {
  const [state, setState] = useState<HomeState>(() => loadHomeState());

  useEffect(() => {
    const unsubscribe = subscribeToUserStateChanges(() => {
      setState(loadHomeState());
    });
    return unsubscribe;
  }, []);

  return state;
};

const formatUnlockedAt = (value: string | null): string | null => {
  if (!value) {
    return null;
  }
  try {
    return new Date(value).toLocaleString();
  } catch {
    return null;
  }
};

const SubjectsPage: React.FC = () => {
  const homeState = useHomeState();

  const achievements = useMemo(() => {
    return (Object.keys(ACHIEVEMENTS_CONFIG) as AchievementKey[]).map((key) => {
      const flag = homeState.achievements[key];
      return {
        key,
        title: ACHIEVEMENTS_CONFIG[key].title,
        description: flag.unlocked ? ACHIEVEMENTS_CONFIG[key].description : '???',
        unlocked: flag.unlocked,
        unlockedAtLabel: formatUnlockedAt(flag.unlockedAt),
      };
    });
  }, [homeState.achievements]);

  return (
    <div className="subjects-page">
      <header className="subjects-header">
        <h2 className="subjects-title">Предметы</h2>
        <p className="subjects-subtitle">
          Следи за прогрессом, собирай природный газ и открывай достижения.
        </p>
      </header>

      <section className="subjects-card subjects-card--currency">
        <div className="subjects-card__label">Природный газ</div>
        <div className="subjects-card__value">
          <span role="img" aria-label="газ">
            🔥
          </span>
          {homeState.currency.toLocaleString('ru-RU')}
        </div>
      </section>

      <section className="subjects-card">
        <div className="subjects-card__label">Достижения</div>
        <ul className="subjects-achievements">
          {achievements.map((achievement) => (
            <li
              key={achievement.key}
              className={`subjects-achievement ${
                achievement.unlocked ? 'subjects-achievement--unlocked' : ''
              }`}
            >
              <div className="subjects-achievement__marker" aria-hidden="true">
                {achievement.unlocked ? '✓' : '•'}
              </div>
              <div className="subjects-achievement__content">
                <div className="subjects-achievement__title">{achievement.title}</div>
                <div className="subjects-achievement__description">
                  {achievement.description}
                </div>
                {achievement.unlocked && achievement.unlockedAtLabel && (
                  <div className="subjects-achievement__timestamp">
                    Открыто {achievement.unlockedAtLabel}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="subjects-version">v1.8.0</div>
    </div>
  );
};

export default SubjectsPage;


