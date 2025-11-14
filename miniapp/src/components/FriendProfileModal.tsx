import React from 'react';
import './FriendProfileModal.css';
import { Friend } from '../types/social';
import { SharedUserHomeState } from '../utils/friendsApi';

interface FriendProfileModalProps {
  friend: Friend;
  onClose: () => void;
  onToggleSharing: (share: boolean) => void;
  onRemoveFriend: () => void;
  sharingBusy: boolean;
  removingBusy: boolean;
  homeState: SharedUserHomeState | null | undefined;
  isLoading: boolean;
  error: string | null;
}

const getStreakImage = (currentStreak: number) => {
  if (currentStreak > 0) {
    return { src: 'media/fire/happy1.svg', alt: 'Фокус на высоте' };
  }
  return { src: 'media/fire/sad.svg', alt: 'Нужно чуть больше старания' };
};

const FriendProfileModal: React.FC<FriendProfileModalProps> = ({
  friend,
  onClose,
  onToggleSharing,
  onRemoveFriend,
  sharingBusy,
  removingBusy,
  homeState,
  isLoading,
  error,
}) => {
  const { src: streakImageSrc, alt: streakImageAlt } = getStreakImage(homeState?.currentStreak ?? 0);

  return (
    <div className="friend-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="friend-modal"
        role="dialog"
        aria-label={`Профиль ${friend.displayName || friend.userId}`}
        onClick={(event) => event.stopPropagation()}
      >
        <button className="friend-modal__close" type="button" onClick={onClose} aria-label="Закрыть">
          ×
        </button>

        <header className="friend-modal__header">
          <h3 className="friend-modal__title">{friend.displayName || friend.userId}</h3>
          <span className="friend-modal__id">{friend.userId}</span>
        </header>

        <section className="friend-modal__section">
          <h4 className="friend-modal__subtitle">Настроение</h4>
          <div className="friend-modal__status">
            {isLoading ? (
              <span className="friend-modal__note">Загружаем данные…</span>
            ) : error ? (
              <span className="friend-modal__error">{error}</span>
            ) : friend.shareTheirStatsWithMe ? (
              <div className="friend-modal__streak">
                <img src={streakImageSrc} alt={streakImageAlt} className="friend-modal__streak-image" />
                <div className="friend-modal__streak-info">
                  <span className="friend-modal__streak-label">Текущий фокус</span>
                  <span className="friend-modal__streak-value">
                    {homeState ? `${homeState.currentStreak} дн.` : 'Нет данных'}
                  </span>
                </div>
              </div>
            ) : (
              <span className="friend-modal__note">Пользователь не делится статистикой</span>
            )}
          </div>
        </section>

        <section className="friend-modal__section">
          <label className="friend-modal__toggle">
            <input
              type="checkbox"
              checked={friend.shareMyStatsWith}
              onChange={(event) => onToggleSharing(event.target.checked)}
              disabled={sharingBusy}
            />
            <span>Разрешить доступ к моей статистике</span>
          </label>
          <div className="friend-modal__share-info">
            {friend.shareTheirStatsWithMe ? (
              <span className="friend-modal__tag friend-modal__tag--success">Пользователь делится с вами статистикой</span>
            ) : (
              <span className="friend-modal__tag">Пользователь скрывает статистику</span>
            )}
          </div>
        </section>

        <footer className="friend-modal__footer">
          <button
            className="friend-modal__remove"
            type="button"
            onClick={onRemoveFriend}
            disabled={removingBusy}
          >
            Удалить из друзей
          </button>
        </footer>
      </div>
    </div>
  );
};

export default FriendProfileModal;


