import React, { useEffect, useMemo, useState } from 'react';
import './StatsPage.css';
import { formatDate, getStartOfDay, addDays } from '../utils/dateUtils';
import CalendarModal from '../components/CalendarModal';
import { DAY_MINUTES } from '../utils/constants';
import { getActivityState, subscribeToUserStateChanges } from '../utils/userStateSync';
import { DayActivity } from '../types';
import ActivityPieChart, { ActivityPieChartEntry } from '../components/ActivityPieChart';
import { ActivityType } from '../types';

type PeriodOption = 'day' | 'week' | 'month' | 'all';

interface PeriodDefinition {
  label: string;
  value: PeriodOption;
}

const PERIOD_OPTIONS: PeriodDefinition[] = [
  { label: 'День', value: 'day' },
  { label: 'Неделя', value: 'week' },
  { label: 'Месяц', value: 'month' },
  { label: 'Всё время', value: 'all' },
];

const getOffsetForPeriod = (option: PeriodOption): number | null => {
  switch (option) {
    case 'day':
      return 0;
    case 'week':
      return 6;
    case 'month':
      return 29;
    default:
      return null;
  }
};

const clampToToday = (date: Date, today: Date): Date => {
  return date > today ? today : date;
};

const calculateEndDate = (start: Date, option: PeriodOption, today: Date): Date => {
  const offset = getOffsetForPeriod(option);
  if (offset === null) {
    return today;
  }
  let result = addDays(start, offset);
  if (result < start) {
    result = start;
  }
  return clampToToday(result, today);
};

const calculateStartDateFromEnd = (end: Date, option: PeriodOption, today: Date): Date => {
  const offset = getOffsetForPeriod(option);
  const clampedEnd = clampToToday(end, today);
  if (offset === null) {
    return clampedEnd;
  }
  let result = addDays(clampedEnd, -offset);
  if (result > clampedEnd) {
    result = clampedEnd;
  }
  return result;
};

const StatsPage: React.FC = () => {
  const today = useMemo(() => getStartOfDay(new Date()), []);
  const defaultStart = today;
  const defaultEnd = calculateEndDate(defaultStart, 'week', today);

  const [period, setPeriod] = useState<PeriodOption>('week');
  const [startDate, setStartDate] = useState<Date>(defaultStart);
  const [endDate, setEndDate] = useState<Date>(defaultEnd);
  const [calendarMode, setCalendarMode] = useState<'start' | 'end' | null>(null);
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribeToUserStateChanges(() => {
      setDataVersion((prev) => prev + 1);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (calendarMode) {
      return;
    }
    if (period === 'all') {
      const clampedEnd = clampToToday(endDate, today);
      const clampedStart = clampToToday(startDate, today);
      if (clampedEnd < clampedStart) {
        setEndDate(clampedStart);
      } else {
        if (clampedStart !== startDate) {
          setStartDate(clampedStart);
        }
        if (clampedEnd !== endDate) {
          setEndDate(clampedEnd);
        }
      }
      return;
    }

    const clampedStart = clampToToday(startDate, today);
    const computedEnd = calculateEndDate(clampedStart, period, today);
    if (clampedStart !== startDate || computedEnd !== endDate) {
      setStartDate(clampedStart);
      setEndDate(computedEnd);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const activityState = getActivityState();

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

    let current = periodRange.start;
    while (current <= periodRange.end) {
      const dateKey = formatDate(current);
      const activity: DayActivity | undefined = activityState[dateKey];
      if (activity) {
        activity.intervals.forEach((interval) => {
          if (!interval.type) {
            return;
          }
          const startMark = activity.marks.find((m) => m.id === interval.startMarkId);
          const endMark = activity.marks.find((m) => m.id === interval.endMarkId);
          if (!startMark || !endMark) {
            return;
          }
          const duration = Math.max(0, endMark.timestamp - startMark.timestamp);
          totals[interval.type] = (totals[interval.type] ?? 0) + duration;
        });
      }
      current = addDays(current, 1);
    }

    const dayCount = Math.max(totalDays, 1);

    const entries: ActivityPieChartEntry[] = (Object.entries(totals) as Array<[Exclude<ActivityType, null>, number]>)
      .filter(([, minutes]) => minutes > 0)
      .map(([type, minutes]) => {
        const percentage = (minutes / (DAY_MINUTES * dayCount)) * 100;
        return {
          type,
          minutes,
          percentage,
          averagePerDay: minutes / dayCount,
        };
      })
      .sort((a, b) => b.minutes - a.minutes);

    return { entries, dayCount };
  }, [activityState, periodRange, dataVersion]);

  const openCalendarForBoundary = (mode: 'start' | 'end') => {
    setCalendarMode(mode);
  };

  const handleCalendarSelect = (date: Date) => {
    const selected = clampToToday(getStartOfDay(date), today);
    if (calendarMode === 'start') {
      if (period === 'all') {
        setStartDate(selected);
        if (selected > endDate) {
          setEndDate(selected);
        }
      } else {
        setStartDate(selected);
        setEndDate(calculateEndDate(selected, period, today));
      }
    } else if (calendarMode === 'end') {
      if (period === 'all') {
        const clampedEnd = selected;
        setEndDate(clampedEnd);
        if (clampedEnd < startDate) {
          setStartDate(clampedEnd);
        }
      } else {
        setEndDate(selected);
        setStartDate(calculateStartDateFromEnd(selected, period, today));
      }
    }
    setCalendarMode(null);
  };

  const handlePeriodChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value as PeriodOption;
    setPeriod(next);
  };

  return (
    <div className="stats-page">
      <div className="stats-header">
        <select
          className="stats-period-select"
          value={period}
          onChange={handlePeriodChange}
        >
          {PERIOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="stats-summary">
        <div className="stats-summary__item">
          <span className="stats-summary__label">Дней в периоде</span>
          <span className="stats-summary__value">{aggregatedData.dayCount}</span>
        </div>
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
          <ActivityPieChart data={aggregatedData.entries} />
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

