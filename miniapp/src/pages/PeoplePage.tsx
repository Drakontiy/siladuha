import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './PeoplePage.css';
import { Friend, FriendRequest, SocialNotification, SocialState } from '../types/social';
import { getActiveUser, unbindAccount } from '../utils/userIdentity';
import {
  getSocialState,
  setSocialState,
  subscribeToUserStateChanges,
} from '../utils/userStateSync';
import FriendProfileModal from '../components/FriendProfileModal';
import {
  fetchSharedUserData,
  removeFriend,
  respondToFriendRequest,
  sendFriendRequest,
  updateFriendSharing,
  SharedUserHomeState,
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
  
  // Получаем имя и фамилию из URL параметров MAX или из activeUser
  const getUserNameFromMax = () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const firstName = params.get('first_name') || '';
      const lastName = params.get('last_name') || '';
      
      // Если есть отдельные имя и фамилия
      if (firstName || lastName) {
        const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
        return {
          firstName,
          lastName,
          fullName: fullName || null,
        };
      }
      
      // Если есть полное имя в user_name
      const fullNameParam = params.get('user_name');
      if (fullNameParam) {
        const parts = fullNameParam.trim().split(/\s+/);
        return {
          firstName: parts[0] || '',
          lastName: parts.slice(1).join(' ') || '',
          fullName: fullNameParam.trim() || null,
        };
      }
    } catch {
      // Игнорируем ошибки
    }
    
    return {
      firstName: '',
      lastName: '',
      fullName: null,
    };
  };
  
  const { firstName, lastName, fullName } = getUserNameFromMax();
  
  // Если данные из URL недоступны, используем name из activeUser
  const displayFirstName = firstName || (activeUser.name ? activeUser.name.trim().split(/\s+/)[0] : '');
  const displayLastName = lastName || (activeUser.name ? activeUser.name.trim().split(/\s+/).slice(1).join(' ') : '');

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [isAddFriendBusy, setIsAddFriendBusy] = useState(false);
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [friendHomeStateCache, setFriendHomeStateCache] = useState<Record<string, SharedUserHomeState | null>>({});
  const [isUnbinding, setIsUnbinding] = useState(false);

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

  const selectedFriend = useMemo(
    () => friends.find((friend) => friend.userId === selectedFriendId) ?? null,
    [friends, selectedFriendId],
  );

  const selectedFriendHomeState = selectedFriend ? friendHomeStateCache[selectedFriend.userId] : undefined;
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

  useEffect(() => {
    if (selectedFriendId && !socialState.friends.some((friend) => friend.userId === selectedFriendId)) {
      setSelectedFriendId(null);
    }
  }, [selectedFriendId, socialState.friends]);

  useEffect(() => {
    setFriendHomeStateCache((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const friendId of Object.keys(next)) {
        const friend = socialState.friends.find((candidate) => candidate.userId === friendId);
        if (!friend || !friend.shareTheirStatsWithMe) {
          delete next[friendId];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [socialState.friends]);

  useEffect(() => {
    if (!selectedFriendId) {
      setProfileLoading(false);
      setProfileError(null);
      return;
    }

    const friend = socialState.friends.find((candidate) => candidate.userId === selectedFriendId);
    if (!friend) {
      setProfileError('Пользователь не найден');
      setProfileLoading(false);
      return;
    }

    if (!friend.shareTheirStatsWithMe) {
      setProfileError('Этот пользователь пока не делится статистикой');
      setProfileLoading(false);
      return;
    }

    if (friendHomeStateCache[selectedFriendId] !== undefined) {
      setProfileError(null);
      setProfileLoading(false);
      return;
    }

    let cancelled = false;
    setProfileLoading(true);
    setProfileError(null);

    void fetchSharedUserData(friend.userId)
      .then((data) => {
        if (cancelled) {
          return;
        }
        setFriendHomeStateCache((prev) => ({
          ...prev,
          [friend.userId]: data.homeState ?? null,
        }));
        setProfileLoading(false);
      })
      .catch((fetchError) => {
        if (cancelled) {
          return;
        }
        console.error('Failed to load friend profile data:', fetchError);
        setProfileError(fetchError instanceof Error ? fetchError.message : 'Не удалось загрузить данные друга');
        setProfileLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedFriendId, socialState.friends, friendHomeStateCache]);

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

  const handleUnbindAccount = async () => {
    if (isUnbinding) {
      return;
    }

    const confirmed = window.confirm(
      'Вы уверены, что хотите отвязать аккаунт?\n\n' +
      'После отвязки вам потребуется снова привязать аккаунт для использования мини-приложения.'
    );

    if (!confirmed) {
      return;
    }

    setIsUnbinding(true);
    setError(null);

    try {
      await unbindAccount();
      // Перезагружаем страницу, чтобы вернуться на страницу авторизации
      window.location.reload();
    } catch (unbindError) {
      console.error('Failed to unbind account:', unbindError);
      setError(unbindError instanceof Error ? unbindError.message : 'Не удалось отвязать аккаунт');
      setMessage(null);
      setIsUnbinding(false);
    }
  };

  const handleFriendClick = (friend: Friend) => {
    setSelectedFriendId(friend.userId);
    setProfileError(null);
  };

  const handleRemoveFriend = async (friend: Friend) => {
    if (busyIds.has(friend.userId)) {
      return;
    }

    withBusyFlag(friend.userId, true);
    setError(null);

    try {
      const updatedSocial = await removeFriend(friend.userId);
      setSocialState(updatedSocial);
      setFriendHomeStateCache((prev) => {
        const next = { ...prev };
        delete next[friend.userId];
        return next;
      });
      setMessage('Друг удалён');
      if (selectedFriendId === friend.userId) {
        setSelectedFriendId(null);
      }
    } catch (removeError) {
      console.error('Failed to remove friend:', removeError);
      setError(removeError instanceof Error ? removeError.message : 'Не удалось удалить друга');
      setMessage(null);
    } finally {
      withBusyFlag(friend.userId, false);
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
      // Передаём имя из URL параметров MAX или из activeUser
      const requesterName = fullName || activeUser.name || activeUser.username || null;
      const updatedSocial = await sendFriendRequest(
        trimmed,
        requesterName,
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
      // Передаём имя из URL параметров MAX или из activeUser
      const responderName = fullName || activeUser.name || activeUser.username || null;
      const updatedSocial = await respondToFriendRequest(
        request.id,
        action,
        responderName,
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
      setFriendHomeStateCache((prev) => {
        const next = { ...prev };
        delete next[friend.userId];
        return next;
      });
      if (share) {
        setProfileError(null);
      } else if (selectedFriendId === friend.userId) {
        setProfileError('Этот пользователь пока не делится статистикой');
        setProfileLoading(false);
      }
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
            <li key={friend.userId}>
              <button
                type="button"
                className="people-friends__item"
                onClick={() => handleFriendClick(friend)}
              >
                <div className="people-friends__info">
                  <span className="people-friends__name">{friend.displayName || friend.userId}</span>
                  <span className="people-friends__id">{friend.userId}</span>
                </div>
                <div className="people-friends__badges">
                  <span
                    className={friend.shareMyStatsWith ? 'people-tag people-tag--success' : 'people-tag people-tag--inactive'}
                  >
                    {friend.shareMyStatsWith ? 'Вы делитесь статистикой' : 'Вы скрываете статистику'}
                  </span>
                  <span
                    className={friend.shareTheirStatsWithMe ? 'people-tag people-tag--success' : 'people-tag people-tag--inactive'}
                  >
                    {friend.shareTheirStatsWithMe ? 'Он делится с вами' : 'Нет доступа к его статистике'}
                  </span>
                </div>
                <span className="people-friends__chevron" aria-hidden="true">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="people-page">
      {(displayFirstName || displayLastName) && (
        <div className="people-name">
          {displayFirstName && <span className="people-name__first">{displayFirstName}</span>}
          {displayLastName && <span className="people-name__last">{displayLastName}</span>}
        </div>
      )}
      <header className="people-header">
        <div className="people-id">
          <div className="people-id__caption">Ваш ID</div>
          <div className="people-id__wrapper">
            <div className="people-id__value">{activeUser.userId ?? '—'}</div>
            <button className="people-button people-button--copy" onClick={handleCopyId}>
              Скопировать
            </button>
          </div>
        </div>
        <div className="people-header__actions">
          <button
            className="people-button people-button--primary"
            onClick={handleAddFriend}
            disabled={isAddFriendBusy}
          >
            Добавить друга
          </button>
          <button
            className="people-button people-button--danger"
            onClick={handleUnbindAccount}
            disabled={isUnbinding}
            style={{ marginLeft: '8px' }}
          >
            {isUnbinding ? 'Отвязываем...' : 'Отвязать аккаунт'}
          </button>
        </div>
      </header>

      {message && <div className="people-feedback people-feedback--success">{message}</div>}
      {error && <div className="people-feedback people-feedback--error">{error}</div>}

      {renderNotifications(notifications)}
      {renderRequests()}
      {renderFriends()}

      {selectedFriend && (
        <FriendProfileModal
          friend={selectedFriend}
          onClose={() => setSelectedFriendId(null)}
          onToggleSharing={(share) => handleSharingToggle(selectedFriend, share)}
          onRemoveFriend={() => handleRemoveFriend(selectedFriend)}
          sharingBusy={busyIds.has(selectedFriend.userId)}
          removingBusy={busyIds.has(selectedFriend.userId)}
          homeState={selectedFriendHomeState}
          isLoading={profileLoading}
          error={profileError}
        />
      )}
    </div>
  );
};

export default PeoplePage;

