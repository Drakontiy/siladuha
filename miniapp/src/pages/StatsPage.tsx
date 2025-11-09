import React, { useMemo, useState } from 'react';
import './StatsPage.css';
import { formatDate, getStartOfDay, addDays } from '../utils/dateUtils';
import CalendarModal from '../components/CalendarModal';
import { DAY_MINUTES } from '../utils/constants';
import { getActivityState } from '../utils/userStateSync';
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

const getPeriodEndDate = (start: Date, option: PeriodOption): Date => {
  switch (option) {
    case 'day':
      return start;
    case 'week':
      return addDays(start, 6);
    case 'month':
      return addDays(start, 29);
    case 'all':
      return getStartOfDay(new Date());
    default:
      return start;
  }
};

const StatsPage: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<Date>(getStartOfDay(new Date()));
  const [period, setPeriod] = useState<PeriodOption>('week');
  const [isCalendarOpen, setCalendarOpen] = useState(false);

  const activityState = getActivityState();

  const periodRange = useMemo(() => {
    const start = getStartOfDay(selectedDate);
    const end = getPeriodEndDate(start, period);
    const today = getStartOfDay(new Date());

    if (period === 'all' && selectedDate > today) {
      return { start, end: today };
    }

    return { start, end: end > today ? today : end };
  }, [selectedDate, period]);

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
  }, [activityState, periodRange]);

  const handleDateClick = () => {
    setCalendarOpen(true);
  };

  const handlePrevDay = () => {
    setSelectedDate(addDays(selectedDate, -1));
  };

  const handleNextDay = () => {
    const today = getStartOfDay(new Date());
    const next = addDays(selectedDate, 1);
    if (next > today) {
      return;
    }
    setSelectedDate(next);
  };

  const handleCalendarSelect = (date: Date) => {
    setSelectedDate(getStartOfDay(date));
    setCalendarOpen(false);
  };

  const handlePeriodChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value as PeriodOption;
    setPeriod(next);
  };

  return (
    <div className="stats-page">
      <div className="stats-header">
        <button className="stats-date-arrow" onClick={handlePrevDay} aria-label="Предыдущий день">
          ◀
        </button>
        <button className="stats-date-button" onClick={handleDateClick} aria-label="Открыть календарь">
          {formatDate(selectedDate)}
        </button>
        <button className="stats-date-arrow" onClick={handleNextDay} aria-label="Следующий день">
          ▶
        </button>
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
        <div className="stats-summary__item">
          <span className="stats-summary__label">Начало</span>
          <span className="stats-summary__value">{formatDate(periodRange.start)}</span>
        </div>
        <div className="stats-summary__item">
          <span className="stats-summary__label">Конец</span>
          <span className="stats-summary__value">{formatDate(periodRange.end)}</span>
        </div>
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

      {isCalendarOpen && (
        <CalendarModal
          anchorDate={selectedDate}
          onSelectDate={handleCalendarSelect}
          onClose={() => setCalendarOpen(false)}
        />
      )}
    </div>
  );
};

export default StatsPage;

