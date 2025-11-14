import React, { useEffect, useMemo, useState } from 'react';
import './StatsPage.css';
import { formatDate, getStartOfDay, addDays } from '../utils/dateUtils';
import CalendarModal from '../components/CalendarModal';
import {
  getActivityState,
  getSocialState,
  subscribeToUserStateChanges,
} from '../utils/userStateSync';
import { fetchSharedUserData, SharedUserData } from '../utils/friendsApi';
import { DayActivity, ActivityType, TimeMark } from '../types';
import { DAY_MINUTES } from '../utils/constants';
import ActivityPieChart, { ActivityPieChartEntry } from '../components/ActivityPieChart';
import { DEFAULT_USER_ID, getActiveUser } from '../utils/userIdentity';
import { Friend, SocialState } from '../types/social';

const RANGE_STORAGE_KEY = 'stats_period_range';

const clampToToday = (date: Date, today: Date): Date => (date > today ? today : date);

const StatsPage: React.FC = () => {
  const today = useMemo(() => getStartOfDay(new Date()), []);

  const loadStoredRange = (): { start: Date; end: Date } => {
    const fallbackStart = addDays(today, -6);
    const fallbackEnd = today;
    if (typeof window === 'undefined') {
      return { start: fallbackStart, end: fallbackEnd };
    }
    const raw = window.localStorage.getItem(RANGE_STORAGE_KEY);
    if (!raw) {
      return { start: fallbackStart, end: fallbackEnd };
    }
    try {
      const parsed = JSON.parse(raw) as { start?: string; end?: string };
      const storedStart = parsed.start ? getStartOfDay(new Date(parsed.start)) : fallbackStart;
      const storedEnd = parsed.end ? getStartOfDay(new Date(parsed.end)) : fallbackEnd;
      const clampedStart = clampToToday(storedStart, today);
      let clampedEnd = clampToToday(storedEnd, today);
      if (clampedEnd < clampedStart) {
        clampedEnd = clampedStart;
      }
      return { start: clampedStart, end: clampedEnd };
    } catch (error) {
      console.warn('Failed to parse stored stats period range:', error);
      return { start: fallbackStart, end: fallbackEnd };
    }
  };

  const initialRange = loadStoredRange();

  const [startDate, setStartDate] = useState<Date>(initialRange.start);
  const [endDate, setEndDate] = useState<Date>(initialRange.end);
  const [calendarMode, setCalendarMode] = useState<'start' | 'end' | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const activeUser = getActiveUser();
  const activeUserId = activeUser.userId ?? DEFAULT_USER_ID;
  const [socialState, setSocialState] = useState<SocialState>(() => getSocialState());
  const [selectedUserId, setSelectedUserId] = useState<string>(activeUserId);
  const [currentActivityState, setCurrentActivityState] = useState<Record<string, DayActivity>>(
    () => getActivityState(),
  );
  const [friendSharedCache, setFriendSharedCache] = useState<Record<string, SharedUserData>>({});
  const [isLoadingShared, setIsLoadingShared] = useState(false);
  const [sharedError, setSharedError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userNameLoading, setUserNameLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToUserStateChanges(() => {
      setDataVersion((prev) => prev + 1);
      setSocialState(getSocialState());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(
      RANGE_STORAGE_KEY,
      JSON.stringify({
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      }),
    );
  }, [startDate, endDate]);

  const activityState = useMemo(() => getActivityState(), [dataVersion]);

  useEffect(() => {
    if (selectedUserId === activeUserId) {
      setCurrentActivityState(activityState);
      setSharedError(null);
      setIsLoadingShared(false);
    }
  }, [selectedUserId, activeUserId, activityState]);

  useEffect(() => {
    setSelectedUserId(activeUserId);
  }, [activeUserId]);

  useEffect(() => {
    if (selectedUserId === activeUserId) {
      return;
    }
    const exists = socialState.friends.some((friend) => friend.userId === selectedUserId);
    if (!exists) {
      setSelectedUserId(activeUserId);
    }
  }, [selectedUserId, activeUserId, socialState.friends]);

  useEffect(() => {
    setFriendSharedCache((prev) => {
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
    if (selectedUserId === activeUserId) {
      return;
    }

    const friend = socialState.friends.find((candidate) => candidate.userId === selectedUserId);
    if (!friend) {
      setSharedError('Пользователь не найден');
      setCurrentActivityState({});
      setIsLoadingShared(false);
      return;
    }

    if (!friend.shareTheirStatsWithMe) {
      setSharedError('Этот пользователь пока не делится своей статистикой');
      setCurrentActivityState({});
      setIsLoadingShared(false);
      return;
    }

    const cached = friendSharedCache[selectedUserId];
    if (cached) {
      setCurrentActivityState(cached.activityData);
      setSharedError(null);
      setIsLoadingShared(false);
      return;
    }

    let cancelled = false;
    setIsLoadingShared(true);
    setSharedError(null);

    void fetchSharedUserData(selectedUserId)
      .then((data) => {
        if (cancelled) {
          return;
        }
        setFriendSharedCache((prev) => ({
          ...prev,
          [selectedUserId]: data,
        }));
        setCurrentActivityState(data.activityData);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        console.error('Failed to load shared activity:', error);
        setSharedError(error instanceof Error ? error.message : 'Не удалось загрузить статистику друга');
        setCurrentActivityState({});
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingShared(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedUserId, activeUserId, socialState.friends, friendSharedCache]);

  const periodRange = useMemo(() => {
    const rangeStart = clampToToday(startDate, today);
    let rangeEnd = clampToToday(endDate, today);
    if (rangeEnd < rangeStart) {
      rangeEnd = rangeStart;
    }
    return { start: rangeStart, end: rangeEnd };
  }, [startDate, endDate, today]);

  const aggregatedData = useMemo(() => {
    const totals: Record<Exclude<ActivityType, null>, number> = {
      sleep: 0,
      productive: 0,
      rest: 0,
      procrastination: 0,
    };

    const totalDays =
      Math.floor((periodRange.end.getTime() - periodRange.start.getTime()) / (24 * 60 * 60 * 1000)) + 1;

    let totalMinutes = 0;
    let current = periodRange.start;
    while (current <= periodRange.end) {
      const dateKey = formatDate(current);
      const activity: DayActivity | undefined = currentActivityState[dateKey];
      if (activity) {
        const marks = activity.marks ?? [];
        const marksMap = new Map<string, TimeMark>();
        marks.forEach((mark) => {
          if (mark?.id) {
            marksMap.set(mark.id, mark);
          }
        });

        const getMinuteForMark = (markId: string): number => {
          if (markId === '__start_of_day__') {
            return 0;
          }
          if (markId === '__end_of_day__') {
            return DAY_MINUTES;
          }
          const mark = marksMap.get(markId);
          if (!mark) {
            return 0;
          }
          return Math.min(Math.max(mark.timestamp, 0), DAY_MINUTES);
        };

        (activity.intervals ?? []).forEach((interval) => {
          if (!interval.type) {
            return;
          }
          if (!(interval.type in totals)) {
            return;
          }
          const startMinute = getMinuteForMark(interval.startMarkId);
          const endMinute = getMinuteForMark(interval.endMarkId);
          if (endMinute <= startMinute) {
            return;
          }
          const duration = endMinute - startMinute;
          totals[interval.type] = (totals[interval.type] ?? 0) + duration;
          totalMinutes += duration;
        });
      }
      current = addDays(current, 1);
    }

    const dayCount = Math.max(totalDays, 1);

    const entries: ActivityPieChartEntry[] = (Object.entries(totals) as Array<[Exclude<ActivityType, null>, number]>)
      .filter(([, minutes]) => minutes > 0)
      .map(([type, minutes]) => {
        const percentage = totalMinutes > 0 ? (minutes / totalMinutes) * 100 : 0;
        return {
          type,
          minutes,
          percentage,
          averagePerDay: minutes / dayCount,
        };
      })
      .sort((a, b) => b.minutes - a.minutes);

    return { entries, dayCount, totalMinutes };
  }, [currentActivityState, periodRange]);

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

  // Загружаем имя пользователя из API, если оно не доступно в URL или activeUser
  useEffect(() => {
    const { fullName } = getUserNameFromMax();
    if (activeUser.userId && activeUser.userId !== DEFAULT_USER_ID && !fullName && !activeUser.name && !userName && !userNameLoading) {
      setUserNameLoading(true);
      const apiBase = process.env.MINIAPP_API_BASE || window.location.origin;
      fetch(`${apiBase}/api/user/${activeUser.userId}/name`)
        .then((response) => {
          if (!response.ok) {
            throw new Error('Failed to fetch user name');
          }
          return response.json() as Promise<{ userId: string; name: string | null }>;
        })
        .then((data) => {
          if (data.name) {
            setUserName(data.name);
          }
        })
        .catch((error) => {
          console.error('Failed to fetch user name:', error);
        })
        .finally(() => {
          setUserNameLoading(false);
        });
    }
  }, [activeUser.userId, activeUser.name, userName, userNameLoading]);

  const { firstName, lastName, fullName } = getUserNameFromMax();
  const displayUserName = fullName || userName || activeUser.name || activeUser.username || null;

  const availableFriends: Friend[] = useMemo(
    () =>
      socialState.friends
        .slice()
        .sort((a, b) => (a.displayName || a.userId).localeCompare(b.displayName || b.userId)),
    [socialState.friends],
  );

  const handleSelectedUserChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedUserId(event.target.value);
  };

  const openCalendarForBoundary = (mode: 'start' | 'end') => {
    setCalendarMode(mode);
  };

  const handleCalendarSelect = (date: Date) => {
    const selected = clampToToday(getStartOfDay(date), today);
    if (calendarMode === 'start') {
      setStartDate(selected);
      if (selected > endDate) {
        setEndDate(selected);
      }
    } else if (calendarMode === 'end') {
      setEndDate(selected);
      if (selected < startDate) {
        setStartDate(selected);
      }
    }
    setCalendarMode(null);
  };

  return (
    <div className="stats-page">
      <div className="stats-header">
        <h2 className="stats-title">Статистика</h2>
      </div>

      <div className="stats-user-selector">
        <label className="stats-user-selector__label" htmlFor="stats-user-select">
          Чья статистика
        </label>
        <select
          id="stats-user-select"
          className="stats-user-selector__select"
          value={selectedUserId}
          onChange={handleSelectedUserChange}
        >
          <option value={activeUserId}>
            {userNameLoading && !displayUserName 
              ? 'Загрузка... (Вы)' 
              : (displayUserName || activeUser.userId || 'Пользователь') + ' (Вы)'}
          </option>
          {availableFriends.map((friend) => (
            <option key={friend.userId} value={friend.userId} disabled={!friend.shareTheirStatsWithMe}>
              {friend.displayName || friend.userId}
              {!friend.shareTheirStatsWithMe ? ' — нет доступа' : ''}
            </option>
          ))}
        </select>
        {selectedUserId !== activeUserId && (
          <div className="stats-user-selector__hint">
            {isLoadingShared && <span>Загружаем данные друга…</span>}
            {sharedError && <span className="stats-user-selector__error">{sharedError}</span>}
            {!isLoadingShared && !sharedError && (
              <span>Статистика доступна с разрешения друга</span>
            )}
          </div>
        )}
      </div>

      <div className="stats-summary">
        <button
          className="stats-summary__item stats-summary__item--interactive"
          onClick={() => openCalendarForBoundary('start')}
        >
          <span className="stats-summary__label">Начало</span>
          <span className="stats-summary__value">{formatDate(periodRange.start)}</span>
        </button>
        <button
          className="stats-summary__item stats-summary__item--interactive"
          onClick={() => openCalendarForBoundary('end')}
        >
          <span className="stats-summary__label">Конец</span>
          <span className="stats-summary__value">{formatDate(periodRange.end)}</span>
        </button>
      </div>

      <div className="stats-chart-card">
        {isLoadingShared ? (
          <div className="stats-empty">
            <p>Загружаем данные…</p>
          </div>
        ) : sharedError ? (
          <div className="stats-empty">
            <p>{sharedError}</p>
          </div>
        ) : aggregatedData.entries.length > 0 ? (
          <ActivityPieChart data={aggregatedData.entries} dayCount={aggregatedData.dayCount} />
        ) : (
          <div className="stats-empty">
            <p>Для выбранного периода нет данных.</p>
          </div>
        )}
      </div>

      {calendarMode && (
        <CalendarModal
          anchorDate={calendarMode === 'start' ? periodRange.start : periodRange.end}
          onSelectDate={handleCalendarSelect}
          onClose={() => setCalendarMode(null)}
        />
      )}
    </div>
  );
};

export default StatsPage;

