import React, { useEffect, useMemo, useState } from 'react';
import './HomeCustomizationModal.css';
import { AchievementKey, CosmeticCategory } from '../types/home';
import {
  CosmeticStyle,
  purchaseCosmeticLevel,
  setActiveCosmeticLevel,
} from '../utils/homeStorage';

export interface HomeCustomizationItem {
  category: CosmeticCategory;
  key: AchievementKey;
  title: string;
  description: string;
  levels: Array<{ level: number; preview: CosmeticStyle; selected: boolean }>;
  nextLevelCost?: number;
  hasMoreLevels: boolean;
}

export interface HomeCustomizationSection {
  category: CosmeticCategory;
  title: string;
  items: HomeCustomizationItem[];
}

const getPreviewStyle = (preview: CosmeticStyle): React.CSSProperties =>
  preview.kind === 'color'
    ? {
        backgroundColor: preview.color,
      }
    : {
        backgroundImage: `url(${preview.src})`,
        backgroundSize: 'contain',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundColor: '#0f172a',
      };

interface HomeCustomizationModalProps {
  sections: HomeCustomizationSection[];
  currency: number;
  onClose: () => void;
  onRefresh: () => void;
}

const HomeCustomizationModal: React.FC<HomeCustomizationModalProps> = ({
  sections,
  currency,
  onClose,
  onRefresh,
}) => {
  const [error, setError] = useState<string | null>(null);
  const flatItems = useMemo(() => {
    const map = new Map<
      AchievementKey,
      { item: HomeCustomizationItem; section: HomeCustomizationSection }
    >();
    sections.forEach((section) => {
      section.items.forEach((item) => {
        map.set(item.key, { item, section });
      });
    });
    return map;
  }, [sections]);

  const firstKey = sections[0]?.items[0]?.key ?? null;
  const [activeKey, setActiveKey] = useState<AchievementKey | null>(firstKey);

  useEffect(() => {
    if (activeKey && !flatItems.has(activeKey)) {
      setActiveKey(firstKey);
    } else if (!activeKey && firstKey) {
      setActiveKey(firstKey);
    }
  }, [flatItems, activeKey, firstKey]);

  const activeEntry = useMemo(
    () => (activeKey ? flatItems.get(activeKey) ?? null : null),
    [flatItems, activeKey],
  );

  const activeItem = activeEntry?.item ?? null;
  const activeCategory = activeEntry?.section.category ?? null;

  const handleSelectLevel = (source: AchievementKey, level: number) => {
    if (!activeCategory) {
      return;
    }
    const result = setActiveCosmeticLevel(activeCategory, source, level);
    if (!result.success) {
      setError(result.error ?? 'Не удалось применить элемент');
      return;
    }
    setError(null);
    onRefresh();
  };

  const handlePurchaseNext = (source: AchievementKey) => {
    const result = purchaseCosmeticLevel(source);
    if (!result.success) {
      setError(
        result.error === 'insufficient_currency'
          ? 'Недостаточно природного газа'
          : result.error === 'max_level_reached'
            ? 'Все уровни уже открыты'
            : result.error === 'achievement_locked'
              ? 'Сначала выполните достижение'
              : 'Не удалось открыть следующий уровень',
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
        aria-label="Настройка внешнего вида"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="home-modal__header">
          <h3 className="home-modal__title">Кастомизация «Дом»</h3>
          <button className="home-modal__close" type="button" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="home-modal__body">
          <div className="home-modal__achievements">
            {sections.length === 0 ? (
              <div className="home-modal__empty">
                Выполните достижения, чтобы получить доступ к кастомизации.
              </div>
            ) : (
              sections.map((section) => (
                <div key={section.category} className="home-modal__section">
                  <h4 className="home-modal__section-title">{section.title}</h4>
                  <div className="home-modal__achievements-group">
                    {section.items.map((item) => {
                const firstPreview = item.levels[0]?.preview;
                const previewStyle = firstPreview
                  ? getPreviewStyle(firstPreview)
                  : { backgroundColor: '#E2E8F0' };
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`home-modal__achievement ${activeKey === item.key ? 'home-modal__achievement--active' : ''}`}
                    onClick={() => setActiveKey(item.key)}
                  >
                        <span
                          className="home-modal__achievement-preview"
                          style={previewStyle}
                        />
                        <span className="home-modal__achievement-title">{item.title}</span>
                      </button>
                    );
                  })}
                  </div>
                </div>
              ))
            )}
          </div>

          {activeItem && (
            <section className="home-modal__details">
              <h4 className="home-modal__details-title">{activeItem.title}</h4>
              <p className="home-modal__details-description">{activeItem.description}</p>

              <div className="home-modal__swatch-group">
                {activeItem.levels.map((level) => {
                  const swatchStyle = getPreviewStyle(level.preview);
                  return (
                    <button
                      key={level.level}
                      type="button"
                      className={`home-modal__swatch ${level.selected ? 'home-modal__swatch--active' : ''}`}
                      style={swatchStyle}
                      onClick={() => handleSelectLevel(activeItem.key, level.level)}
                    >
                      <span className="home-modal__swatch-level">{level.level}</span>
                      {level.selected && <span className="home-modal__swatch-check">✓</span>}
                    </button>
                  );
                })}
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
                    Открыть следующий уровень · {activeItem.nextLevelCost.toLocaleString('ru-RU')}
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