import React, { useMemo, useState } from 'react';
import './HomeCustomizationModal.css';
import { AchievementKey } from '../types/home';
import { HomeBackgroundOption, purchaseHomeBackgroundLevel, setActiveHomeBackground } from '../utils/homeStorage';
import { loadHomeState } from '../utils/homeStorage';

export interface HomeCustomizationModalProps {
  options: HomeBackgroundOption[];
  onClose: () => void;
  onStateChange: () => void;
  currency: number;
}

const HomeCustomizationModal: React.FC<HomeCustomizationModalProps> = ({
  options,
  onClose,
  onStateChange,
  currency,
}) => {
  const [error, setError] = useState<string | null>(null);
  const state = useMemo(() => loadHomeState(), []);

  const handleSelect = (source: AchievementKey, level: number) => {
    const result = setActiveHomeBackground(source, level);
    if (!result.success) {
      setError(result.error ?? 'Не удалось применить фон');
      return;
    }
    setError(null);
    onStateChange();
  };

  const handlePurchase = (source: AchievementKey) => {
    const stateBefore = loadHomeState();
    const result = purchaseHomeBackgroundLevel(source);
    if (!result.success) {
      setError(
        result.error === 'insufficient_currency'
          ? 'Недостаточно природного газа'
          : result.error === 'max_level_reached'
            ? 'Все оттенки уже открыты'
            : result.error === 'achievement_locked'
              ? 'Сначала выполните достижение'
              : 'Покупка не удалась',
      );
      return;
    }
    setError(null);
    onStateChange();
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

        <div className="home-modal__currency">
          <span>Природный газ:</span>
          <strong>{currency.toLocaleString('ru-RU')}</strong>
        </div>

        {error && <div className="home-modal__error">{error}</div>}

        <ul className="home-modal__list">
          {options.map((option) => (
            <li key={`${option.source}-${option.level}`} className="home-modal__list-item">
              <button
                type="button"
                className={`home-modal__swatch ${
                  option.unlocked ? '' : 'home-modal__swatch--locked'
                } ${option.selected ? 'home-modal__swatch--active' : ''}`}
                style={{ backgroundColor: option.color ?? 'transparent' }}
                onClick={() =>
                  option.unlocked
                    ? handleSelect(option.source as AchievementKey, option.level)
                    : option.purchasable
                      ? handlePurchase(option.source as AchievementKey)
                      : null
                }
                disabled={!option.unlocked && !option.purchasable}
              >
                {!option.unlocked && !option.purchasable && <span className="home-modal__swatch-dot">?</span>}
                {option.purchasable && (
                  <span className="home-modal__swatch-cost">{option.cost?.toLocaleString('ru-RU')}</span>
                )}
                {option.selected && <span className="home-modal__swatch-check">✓</span>}
              </button>
              <div className="home-modal__swatch-label">
                {option.unlocked ? 'Открыто' : option.purchasable ? 'Доступно к покупке' : 'Скрыто'}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default HomeCustomizationModal;


