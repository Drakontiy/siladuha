import React, { useMemo, useState } from 'react';
import './CalendarModal.css';
import { addDays, formatDate, getDateKey, getStartOfDay, isToday } from '../utils/dateUtils';
import { loadHomeState, calculateProductiveMinutes } from '../utils/homeStorage';

type DayStatus = 'no_goal' | 'failed' | 'completed';

interface CalendarDayInfo {
  date: Date;
  inCurrentMonth: boolean;
  status: DayStatus;
  productiveMinutes: number;
  goalMinutes: number;
}

interface CalendarModalProps {
  anchorDate: Date;
  onSelectDate: (date: Date) => void;
  onClose: () => void;
}

const MAX_PRODUCTIVE_MINUTES_FOR_INTENSITY = 12 * 60;

const getBlueShade = (productiveMinutes: number): string => {
  const intensity = Math.min(productiveMinutes / MAX_PRODUCTIVE_MINUTES_FOR_INTENSITY, 1);
  const startColor = { r: 219, g: 234, b: 254 }; // #DBEAFE (очень светлый)
  const endColor = { r: 30, g: 64, b: 175 }; // #1E40AF (насыщенный синий)

  const mix = (start: number, end: number) => Math.round(start + (end - start) * intensity);
  const r = mix(startColor.r, endColor.r);
  const g = mix(startColor.g, endColor.g);
  const b = mix(startColor.b, endColor.b);
  return `rgb(${r}, ${g}, ${b})`;
};

const getStatusColor = (info: CalendarDayInfo): string => {
  switch (info.status) {
    case 'no_goal':
      return '#FFFFFF';
    case 'failed':
      return '#FCA5A5';
    case 'completed':
      return getBlueShade(info.productiveMinutes);
    default:
      return '#FFFFFF';
  }
};

const formatMonthLabel = (date: Date): string => {
  return date.toLocaleDateString('ru-RU', {
    month: 'long',
    year: 'numeric',
  });
};

const getStartOfMonth = (date: Date): Date => {
  const result = getStartOfDay(new Date(date.getFullYear(), date.getMonth(), 1));
  return result;
};

const getCalendarMatrix = (monthDate: Date): CalendarDayInfo[][] => {
  const homeState = loadHomeState();
  const startOfMonth = getStartOfMonth(monthDate);
  const endOfMonth = getStartOfDay(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0));

  const firstDayOfWeek = (startOfMonth.getDay() + 6) % 7; // 0 = Monday
  const calendarStart = addDays(startOfMonth, -firstDayOfWeek);

  const weeks: CalendarDayInfo[][] = [];
  let current = calendarStart;

  const maxIterations = 6 * 7;
  for (let i = 0; i < maxIterations; i += 1) {
    const currentDate = getStartOfDay(current);
    const dateKey = getDateKey(currentDate);
    const goal = homeState.goals[dateKey];
    const goalMinutes = goal?.targetMinutes ?? 0;
    const productiveMinutes = calculateProductiveMinutes(currentDate);

    let status: DayStatus = 'no_goal';
    if (goalMinutes > 0) {
      status = productiveMinutes >= goalMinutes ? 'completed' : 'failed';
    }

    const info: CalendarDayInfo = {
      date: new Date(currentDate),
      inCurrentMonth:
        currentDate.getMonth() === monthDate.getMonth() &&
        currentDate.getFullYear() === monthDate.getFullYear(),
      status,
      productiveMinutes,
      goalMinutes,
    };

    const weekIndex = Math.floor(i / 7);
    if (!weeks[weekIndex]) {
      weeks[weekIndex] = [];
    }
    weeks[weekIndex].push(info);

    current = addDays(current, 1);

    if (
      currentDate > endOfMonth &&
      i >= 28 &&
      currentDate.getDay() === 0 // Sunday (since addDays increments)
    ) {
      break;
    }
  }

  return weeks;
};

const formatProductiveHours = (minutes: number): string => {
  const hours = minutes / 60;
  if (hours === 0) {
    return '';
  }
  if (hours >= 1) {
    return `${hours.toFixed(hours >= 5 ? 0 : 1)} ч`;
  }
  return `${minutes} мин`;
};

const CalendarModal: React.FC<CalendarModalProps> = ({ anchorDate, onSelectDate, onClose }) => {
  const [visibleMonth, setVisibleMonth] = useState<Date>(getStartOfMonth(anchorDate));

  const calendarMatrix = useMemo(() => getCalendarMatrix(visibleMonth), [visibleMonth]);

  const handleDayClick = (info: CalendarDayInfo) => {
    onSelectDate(info.date);
  };

  const handlePrevMonth = () => {
    setVisibleMonth(getStartOfMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1)));
  };

  const handleNextMonth = () => {
    setVisibleMonth(getStartOfMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1)));
  };

  return (
    <div className="calendar-modal-backdrop" role="dialog" aria-modal="true">
      <div className="calendar-modal">
        <div className="calendar-header">
          <button className="calendar-nav-button" onClick={handlePrevMonth} aria-label="Предыдущий месяц">
            ◀
          </button>
          <div className="calendar-title">{formatMonthLabel(visibleMonth)}</div>
          <button className="calendar-nav-button" onClick={handleNextMonth} aria-label="Следующий месяц">
            ▶
          </button>
        </div>

        <div className="calendar-weekdays">
          {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((label) => (
            <div key={label} className="calendar-weekday">
              {label}
            </div>
          ))}
        </div>

        <div className="calendar-grid">
          {calendarMatrix.map((week, weekIndex) => (
            <div className="calendar-week" key={`week-${weekIndex}`}>
              {week.map((day) => {
                const isCurrentDay = formatDate(day.date) === formatDate(anchorDate);
                const today = isToday(day.date);
                const classes = [
                  'calendar-day',
                  day.inCurrentMonth ? 'calendar-day--current-month' : 'calendar-day--other-month',
                  day.status === 'failed' ? 'calendar-day--failed' : '',
                  day.status === 'completed' ? 'calendar-day--completed' : '',
                  isCurrentDay ? 'calendar-day--selected' : '',
                  today ? 'calendar-day--today' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                const background = getStatusColor(day);
                const label = `${day.date.getDate()}`;
                const hint =
                  day.status === 'no_goal'
                    ? 'Цель не поставлена'
                    : day.status === 'failed'
                    ? `Цель ${day.goalMinutes} мин — выполнено ${day.productiveMinutes} мин`
                    : `Выполнено ${day.productiveMinutes} мин`;
                const productiveText =
                  day.status === 'completed' ? formatProductiveHours(day.productiveMinutes) : '';

                return (
                  <button
                    key={formatDate(day.date)}
                    className={classes}
                    style={{ background }}
                    onClick={() => handleDayClick(day)}
                    title={hint}
                  >
                    <span className="calendar-day__number">{label}</span>
                    {productiveText && (
                      <span className="calendar-day__productive">{productiveText}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="calendar-footer">
          <div className="calendar-legend">
            <span className="calendar-legend__item">
              <span className="calendar-legend__color" style={{ background: '#FFFFFF' }} />
              <span>Цель не задана</span>
            </span>
            <span className="calendar-legend__item">
              <span className="calendar-legend__color" style={{ background: '#FCA5A5' }} />
              <span>Цель не выполнена</span>
            </span>
            <span className="calendar-legend__item">
              <span
                className="calendar-legend__color"
                style={{ background: getBlueShade(MAX_PRODUCTIVE_MINUTES_FOR_INTENSITY) }}
              />
              <span>Цель выполнена</span>
            </span>
          </div>
          <button className="calendar-close-button" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};

export default CalendarModal;


