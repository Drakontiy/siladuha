import React, { useEffect, useMemo, useState } from 'react';
import './HomeCustomizationModal.css';
import { AchievementKey } from '../types/home';
import {
  purchaseHomeBackgroundLevel,
  setActiveHomeBackground,
} from '../utils/homeStorage';

export interface HomeCustomizationItem {
  key: AchievementKey;
  title: string;
  description: string;
  levels: Array<{ level: number; color: string; selected: boolean }>;
  nextLevelCost?: number;
  hasMoreLevels: boolean;
}

interface HomeCustomizationModalProps {
  items: HomeCustomizationItem[];
  currency: number;
  onClose: () => void;
  onRefresh: () => void;
}

const HomeCustomizationModal: React.FC<HomeCustomizationModalProps> = ({
  items,
  currency,
  onClose,
  onRefresh,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<AchievementKey | null>(items[0]?.key ?? null);

  useEffect(() => {
    if (activeKey && !items.some((item) => item.key === activeKey)) {
      setActiveKey(items[0]?.key ?? null);
    }
  }, [items, activeKey]);

  const activeItem = useMemo(
    () => (activeKey ? items.find((item) => item.key === activeKey) ?? null : null),
    [items, activeKey],
  );

  const handleSelectLevel = (source: AchievementKey, level: number) => {
    const result = setActiveHomeBackground(source, level);
    if (!result.success) {
      setError(result.error ?? 'Не удалось применить фон');
      return;
    }
    setError(null);
    onRefresh();
  };

  const handlePurchaseNext = (source: AchievementKey) => {
    const result = purchaseHomeBackgroundLevel(source);
    if (!result.success) {
      setError(
        result.error === 'insufficient_currency'
          ? 'Недостаточно природного газа'
          : result.error === 'max_level_reached'
            ? 'Все оттенки уже открыты'
            : result.error === 'achievement_locked'
              ? 'Сначала выполните достижение'
              : 'Не удалось открыть новый оттенок',
      );
      return;
    }
    setError(null);
    onRefresh();
  };

  return (
    <div className="home-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="home-modal"
        role="dialog"
        aria-label="Настройка фона"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="home-modal__header">
          <h3 className="home-modal__title">Фон «Дом»</h3>
          <button className="home-modal__close" type="button" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="home-modal__body">
          <div className="home-modal__achievements">
            {items.length === 0 ? (
              <div className="home-modal__empty">Выполните достижения, чтобы получить доступ к кастомизации.</div>
            ) : (
              items.map((item) => {
                const firstColor = item.levels[0]?.color ?? '#E2E8F0';
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`home-modal__achievement ${activeKey === item.key ? 'home-modal__achievement--active' : ''}`}
                    onClick={() => setActiveKey(item.key)}
                  >
                    <span
                      className="home-modal__achievement-preview"
                      style={{ backgroundColor: firstColor }}
                    />
                    <span className="home-modal__achievement-title">{item.title}</span>
                  </button>
                );
              })
            )}
          </div>

          {activeItem && (
            <section className="home-modal__details">
              <h4 className="home-modal__details-title">{activeItem.title}</h4>
              <p className="home-modal__details-description">{activeItem.description}</p>

              <div className="home-modal__swatch-group">
                {activeItem.levels.map((level) => (
                  <button
                    key={level.level}
                    type="button"
                    className={`home-modal__swatch ${level.selected ? 'home-modal__swatch--active' : ''}`}
                    style={{ backgroundColor: level.color }}
                    onClick={() => handleSelectLevel(activeItem.key, level.level)}
                  >
                    <span className="home-modal__swatch-level">{level.level}</span>
                    {level.selected && <span className="home-modal__swatch-check">✓</span>}
                  </button>
                ))}
              </div>

              {error && <div className="home-modal__error">{error}</div>}

              <div className="home-modal__footer">
                <div className="home-modal__balance">
                  <span>Природный газ</span>
                  <strong>{currency.toLocaleString('ru-RU')}</strong>
                </div>

                {activeItem.hasMoreLevels && activeItem.nextLevelCost && (
                  <button
                    type="button"
                    className="home-modal__purchase"
                    onClick={() => handlePurchaseNext(activeItem.key)}
                    disabled={currency < activeItem.nextLevelCost}
                  >
                    Открыть новый оттенок · {activeItem.nextLevelCost.toLocaleString('ru-RU')}
                  </button>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default HomeCustomizationModal;