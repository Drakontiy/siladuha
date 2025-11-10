import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './PeoplePage.css';
import { Friend, FriendRequest, SocialNotification, SocialState } from '../types/social';
import { getActiveUser } from '../utils/userIdentity';
import {
  getSocialState,
  setSocialState,
  subscribeToUserStateChanges,
} from '../utils/userStateSync';
import {
  respondToFriendRequest,
  sendFriendRequest,
  updateFriendSharing,
} from '../utils/friendsApi';

const useSocialState = (): SocialState => {
  const [state, setState] = useState<SocialState>(() => getSocialState());

  useEffect(() => {
    const unsubscribe = subscribeToUserStateChanges(() => {
      setState(getSocialState());
    });
    return unsubscribe;
  }, []);

  return state;
};

const sortByDateDesc = <T extends { createdAt: string }>(items: T[]): T[] =>
  [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

const PeoplePage: React.FC = () => {
  const activeUser = getActiveUser();
  const socialState = useSocialState();

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [isAddFriendBusy, setIsAddFriendBusy] = useState(false);

  const incomingRequests = useMemo(
    () =>
      sortByDateDesc(
        socialState.friendRequests.filter(
          (request) => request.direction === 'incoming' && request.status === 'pending',
        ),
      ),
    [socialState.friendRequests],
  );

  const outgoingRequests = useMemo(
    () =>
      sortByDateDesc(
        socialState.friendRequests.filter(
          (request) => request.direction === 'outgoing' && request.status === 'pending',
        ),
      ),
    [socialState.friendRequests],
  );

  const friends = useMemo(
    () => socialState.friends.slice().sort((a, b) => a.userId.localeCompare(b.userId)),
    [socialState.friends],
  );

  const notifications = useMemo(
    () => sortByDateDesc(socialState.notifications).slice(0, 5),
    [socialState.notifications],
  );

  const withBusyFlag = useCallback((id: string, active: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (active) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const handleCopyId = async () => {
    if (!activeUser.userId) {
      return;
    }
    try {
      await navigator.clipboard.writeText(activeUser.userId);
      setMessage('ID скопирован');
      setError(null);
    } catch (clipboardError) {
      console.error('Failed to copy user id:', clipboardError);
      setError('Не удалось скопировать ID');
      setMessage(null);
    }
  };

  const handleAddFriend = async () => {
    if (isAddFriendBusy) {
      return;
    }

    const input = window.prompt('Введите ID друга, чтобы отправить заявку:');
    if (!input) {
      return;
    }

    const trimmed = input.trim();
    if (!trimmed) {
      setError('ID не должен быть пустым');
      setMessage(null);
      return;
    }

    setIsAddFriendBusy(true);
    setError(null);

    try {
      const updatedSocial = await sendFriendRequest(
        trimmed,
        activeUser.name ?? activeUser.username ?? null,
      );
      setSocialState(updatedSocial);
      setMessage('Заявка отправлена');
    } catch (requestError) {
      console.error('Failed to send friend request:', requestError);
      setError(requestError instanceof Error ? requestError.message : 'Не удалось отправить заявку');
      setMessage(null);
    } finally {
      setIsAddFriendBusy(false);
    }
  };

  const handleRespond = async (request: FriendRequest, action: 'accepted' | 'declined') => {
    if (busyIds.has(request.id)) {
      return;
    }

    withBusyFlag(request.id, true);
    setError(null);

    try {
      const updatedSocial = await respondToFriendRequest(
        request.id,
        action,
        activeUser.name ?? activeUser.username ?? null,
      );
      setSocialState(updatedSocial);
      setMessage(action === 'accepted' ? 'Друг добавлен' : 'Заявка отклонена');
    } catch (respondError) {
      console.error('Failed to respond to friend request:', respondError);
      setError(respondError instanceof Error ? respondError.message : 'Не удалось обработать заявку');
      setMessage(null);
    } finally {
      withBusyFlag(request.id, false);
    }
  };

  const handleSharingToggle = async (friend: Friend, share: boolean) => {
    if (busyIds.has(friend.userId)) {
      return;
    }

    withBusyFlag(friend.userId, true);
    setError(null);

    try {
      const updatedSocial = await updateFriendSharing(friend.userId, share);
      setSocialState(updatedSocial);
      setMessage(
        share
          ? 'Доступ к вашей статистике предоставлен'
          : 'Доступ к вашей статистике закрыт',
      );
    } catch (updateError) {
      console.error('Failed to update sharing preferences:', updateError);
      setError(
        updateError instanceof Error ? updateError.message : 'Не удалось обновить доступ',
      );
      setMessage(null);
    } finally {
      withBusyFlag(friend.userId, false);
    }
  };

  const renderNotifications = (items: SocialNotification[]) => {
    if (items.length === 0) {
      return null;
    }

    return (
      <section className="people-section">
        <h3 className="people-section__title">Уведомления</h3>
        <ul className="people-notifications">
          {items.map((notification) => (
            <li key={notification.id} className="people-notifications__item">
              <span className="people-notifications__dot" aria-hidden="true" />
              <div className="people-notifications__content">
                <span>{notification.message}</span>
                <time className="people-notifications__time">
                  {new Date(notification.createdAt).toLocaleString()}
                </time>
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  };

  const renderRequests = () => {
    if (incomingRequests.length === 0 && outgoingRequests.length === 0) {
      return null;
    }

    return (
      <section className="people-section">
        <h3 className="people-section__title">Заявки</h3>
        <div className="people-requests">
          {incomingRequests.length > 0 && (
            <div className="people-requests__group">
              <h4 className="people-requests__subtitle">Входящие</h4>
              <ul>
                {incomingRequests.map((request) => (
                  <li key={request.id} className="people-requests__item">
                    <div className="people-requests__info">
                      <span className="people-requests__name">
                        {request.counterpartName || request.counterpartId}
                      </span>
                      <span className="people-requests__id">{request.counterpartId}</span>
                    </div>
                    <div className="people-requests__actions">
                      <button
                        className="people-button people-button--primary"
                        onClick={() => handleRespond(request, 'accepted')}
                        disabled={busyIds.has(request.id)}
                      >
                        Принять
                      </button>
                      <button
                        className="people-button people-button--secondary"
                        onClick={() => handleRespond(request, 'declined')}
                        disabled={busyIds.has(request.id)}
                      >
                        Отклонить
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {outgoingRequests.length > 0 && (
            <div className="people-requests__group">
              <h4 className="people-requests__subtitle">Исходящие</h4>
              <ul>
                {outgoingRequests.map((request) => (
                  <li key={request.id} className="people-requests__item people-requests__item--outgoing">
                    <div>
                      <span className="people-requests__name">
                        {request.counterpartName || request.counterpartId}
                      </span>
                      <span className="people-requests__id">{request.counterpartId}</span>
                    </div>
                    <span className="people-requests__status">Ожидает ответа</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    );
  };

  const renderFriends = () => (
    <section className="people-section">
      <h3 className="people-section__title">Друзья</h3>
      {friends.length === 0 ? (
        <div className="people-empty">Список друзей пуст</div>
      ) : (
        <ul className="people-friends">
          {friends.map((friend) => (
            <li key={friend.userId} className="people-friends__item">
              <div className="people-friends__info">
                <span className="people-friends__name">{friend.displayName || friend.userId}</span>
                <span className="people-friends__id">{friend.userId}</span>
              </div>
              <div className="people-friends__controls">
                <label className="people-toggle">
                  <input
                    type="checkbox"
                    checked={friend.shareMyStatsWith}
                    onChange={(event) => handleSharingToggle(friend, event.target.checked)}
                    disabled={busyIds.has(friend.userId)}
                  />
                  <span>Разрешить доступ к моей статистике</span>
                </label>
                <div className="people-friends__stats-access">
                  {friend.shareTheirStatsWithMe ? (
                    <span className="people-tag people-tag--success">Видите его статистику</span>
                  ) : (
                    <span className="people-tag people-tag--inactive">Доступ к его статистике закрыт</span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="people-page">
      <header className="people-header">
        <div className="people-id">
          <div className="people-id__caption">Ваш ID</div>
          <div className="people-id__value">{activeUser.userId ?? '—'}</div>
        </div>
        <div className="people-header__actions">
          <button className="people-button" onClick={handleCopyId}>
            Скопировать
          </button>
          <button
            className="people-button people-button--primary"
            onClick={handleAddFriend}
            disabled={isAddFriendBusy}
          >
            Добавить друга
          </button>
        </div>
      </header>

      {message && <div className="people-feedback people-feedback--success">{message}</div>}
      {error && <div className="people-feedback people-feedback--error">{error}</div>}

      {renderNotifications(notifications)}
      {renderRequests()}
      {renderFriends()}
    </div>
  );
};

export default PeoplePage;

