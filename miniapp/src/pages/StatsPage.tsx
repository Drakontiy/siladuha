import React, { useEffect, useMemo, useState } from 'react';
import './StatsPage.css';
import { formatDate, getStartOfDay, addDays } from '../utils/dateUtils';
import CalendarModal from '../components/CalendarModal';
import { getActivityState, subscribeToUserStateChanges } from '../utils/userStateSync';
import { DayActivity, ActivityType, TimeMark } from '../types';
import { DAY_MINUTES } from '../utils/constants';
import ActivityPieChart, { ActivityPieChartEntry } from '../components/ActivityPieChart';

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

  useEffect(() => {
    const unsubscribe = subscribeToUserStateChanges(() => {
      setDataVersion((prev) => prev + 1);
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
      const activity: DayActivity | undefined = activityState[dateKey];
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
  }, [activityState, periodRange, dataVersion]);

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
        {aggregatedData.entries.length > 0 ? (
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

