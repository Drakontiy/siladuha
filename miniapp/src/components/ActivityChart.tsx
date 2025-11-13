import React, { useEffect, useRef } from 'react';
import { TimeMark, ActivityInterval, ACTIVITY_COLORS, ActivityType } from '../types';
import './ActivityChart.css';

interface ActivityChartProps {
  marks: TimeMark[];
  intervals: ActivityInterval[];
  onMarkClick: (mark: TimeMark) => void;
  onIntervalLongPress: (startMarkId: string, endMarkId: string) => void;
  onLineClick: (absoluteMinutes: number) => void;
  activeOverlay?: {
    startMinute: number;
    endMinute: number;
    type: ActivityType;
  } | null;
  currentMinute?: number | null;
  focusMinute?: number | null;
}

const DAY_TOTAL_MINUTES = 24 * 60;
const DAY_END_MINUTE = DAY_TOTAL_MINUTES - 1;
const PIXELS_PER_MINUTE = 2;
const LONG_PRESS_DELAY = 450;

const HOUR_TICKS = Array.from({ length: 25 }, (_, index) => index); // 0...24

const VIRTUAL_BOUNDARIES = [
  { id: '__start_of_day__', minute: 0 },
  { id: '__end_of_day__', minute: DAY_END_MINUTE },
] as const;

const minutesToPercent = (minutes: number) => (minutes / DAY_TOTAL_MINUTES) * 100;

const makeTimeMark = (boundary: typeof VIRTUAL_BOUNDARIES[number]): TimeMark => ({
  id: boundary.id,
  hour: Math.floor(boundary.minute / 60),
  minute: boundary.minute % 60,
  timestamp: boundary.minute,
});

const ActivityChart: React.FC<ActivityChartProps> = ({
  marks,
  intervals,
  onMarkClick,
  onIntervalLongPress,
  onLineClick,
  activeOverlay = null,
  currentMinute = null,
  focusMinute = null,
}) => {
  const timelineBarRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const longPressSuppressedClickRef = useRef(false);
  const timelineBarPointerStateRef = useRef<Map<number, {
    startX: number;
    initialMinutes: number;
  }>>(new Map());
  const pointerStateRef = useRef<Map<number, { 
    timerId: number; 
    longPress: boolean;
    startX: number;
    initialMinutes: number;
  }>>(new Map());

  const timelineWidth = (DAY_TOTAL_MINUTES + 1) * PIXELS_PER_MINUTE;

  const virtualMarks = VIRTUAL_BOUNDARIES.map(makeTimeMark);

  const allMarksMap = new Map<string, TimeMark>();
  virtualMarks.forEach(mark => allMarksMap.set(mark.id, mark));
  marks.forEach(mark => allMarksMap.set(mark.id, mark));
  const orderedMarks = Array.from(allMarksMap.values()).sort((a, b) => a.timestamp - b.timestamp);

  const getIntervalColor = (startMarkId: string, endMarkId: string): string => {
    const interval = intervals.find(
      i => i.startMarkId === startMarkId && i.endMarkId === endMarkId
    );
    if (!interval || interval.type === null) {
      return 'transparent';
    }
    return ACTIVITY_COLORS[interval.type];
  };

  const getIntervalStyle = (startMinute: number, endMinute: number): { left: string; width: string } | null => {
    const clampedStart = Math.max(0, Math.min(startMinute, DAY_TOTAL_MINUTES));
    const clampedEnd = Math.max(0, Math.min(endMinute, DAY_TOTAL_MINUTES));

    if (clampedEnd <= clampedStart) {
      return null;
    }

    const leftPercent = minutesToPercent(clampedStart);
    const widthPercent = ((clampedEnd - clampedStart) / DAY_TOTAL_MINUTES) * 100;

    return {
      left: `${leftPercent}%`,
      width: `${widthPercent}%`,
    };
  };

  const minutesFromClientX = (clientX: number) => {
    const bar = timelineBarRef.current;
    if (!bar) {
      return 0;
    }
    const rect = bar.getBoundingClientRect();
    const offsetX = clientX - rect.left;
    const ratio = rect.width === 0 ? 0 : Math.min(Math.max(offsetX / rect.width, 0), 1);
    return Math.round(ratio * DAY_TOTAL_MINUTES);
  };

  const clampMinute = (minute: number) => Math.max(0, Math.min(DAY_END_MINUTE, minute));

  const handleTimelinePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // Предотвращаем скролл при касании линии
    event.preventDefault();
    event.stopPropagation();
    
    // Блокируем скролл контейнера программно
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const scrollLeft = container.scrollLeft;
      const scrollTop = container.scrollTop;
      
      // Запоминаем текущий скролл и блокируем его
      container.style.overflowX = 'hidden';
      container.style.overflowY = 'hidden';
      
      // Восстанавливаем позицию скролла после небольшой задержки
      requestAnimationFrame(() => {
        if (container) {
          container.scrollLeft = scrollLeft;
          container.scrollTop = scrollTop;
        }
      });
    }
    
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const rect = timelineBarRef.current?.getBoundingClientRect();
    
    if (!rect) {
      return;
    }

    const startMinutes = clampMinute(minutesFromClientX(startX));

    timelineBarPointerStateRef.current.set(pointerId, {
      startX,
      initialMinutes: startMinutes,
    });

    // Устанавливаем метку сразу при касании
    if (!longPressSuppressedClickRef.current) {
      onLineClick(startMinutes);
    }
  };

  const handleTimelinePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    // Предотвращаем скролл при движении по линии
    event.preventDefault();
    event.stopPropagation();
    
    // Продолжаем блокировать скролл
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.overflowX = 'hidden';
      scrollContainerRef.current.style.overflowY = 'hidden';
    }
  };

  const handleTimelinePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    // Предотвращаем скролл при отпускании линии
    event.preventDefault();
    event.stopPropagation();
    
    // Восстанавливаем скролл контейнера
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.overflowX = 'auto';
      scrollContainerRef.current.style.overflowY = 'hidden';
    }

    const pointerId = event.pointerId;
    const state = timelineBarPointerStateRef.current.get(pointerId);
    
    if (state) {
      timelineBarPointerStateRef.current.delete(pointerId);
    }
    
    if (longPressSuppressedClickRef.current) {
      longPressSuppressedClickRef.current = false;
    }
  };

  const handleTimelinePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    // Восстанавливаем скролл контейнера
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.overflowX = 'auto';
      scrollContainerRef.current.style.overflowY = 'hidden';
    }
    
    const pointerId = event.pointerId;
    timelineBarPointerStateRef.current.delete(pointerId);
    
    if (longPressSuppressedClickRef.current) {
      longPressSuppressedClickRef.current = false;
    }
  };

  const handleSegmentPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    startMarkId: string,
    endMarkId: string,
  ) => {
    // Предотвращаем скролл при касании сегмента
    event.preventDefault();
    event.stopPropagation();
    
    // Блокируем скролл контейнера программно
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const scrollLeft = container.scrollLeft;
      const scrollTop = container.scrollTop;
      
      container.style.overflowX = 'hidden';
      container.style.overflowY = 'hidden';
      
      requestAnimationFrame(() => {
        if (container) {
          container.scrollLeft = scrollLeft;
          container.scrollTop = scrollTop;
        }
      });
    }
    
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const rect = timelineBarRef.current?.getBoundingClientRect();
    
    if (!rect) {
      return;
    }

    const startMinutes = clampMinute(minutesFromClientX(startX));

    const newState = {
      timerId: window.setTimeout(() => {
        const currentState = pointerStateRef.current.get(pointerId);
        if (!currentState) {
          return;
        }
        currentState.longPress = true;
        longPressSuppressedClickRef.current = true;
        onIntervalLongPress(startMarkId, endMarkId);
      }, LONG_PRESS_DELAY),
      longPress: false,
      startX,
      initialMinutes: startMinutes,
    };

    pointerStateRef.current.set(pointerId, newState);
  };

  const handleSegmentPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    
    // Восстанавливаем скролл контейнера
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.overflowX = 'auto';
      scrollContainerRef.current.style.overflowY = 'hidden';
    }
    
    const pointerId = event.pointerId;
    const state = pointerStateRef.current.get(pointerId);
    if (!state) {
      return;
    }

    window.clearTimeout(state.timerId);
    pointerStateRef.current.delete(pointerId);

    if (state.longPress) {
      longPressSuppressedClickRef.current = true;
    } else {
      // Если не было долгого нажатия - это обычный клик
      longPressSuppressedClickRef.current = false;
      onLineClick(state.initialMinutes);
    }
  };

  const handleSegmentPointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    // Восстанавливаем скролл контейнера
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.overflowX = 'auto';
      scrollContainerRef.current.style.overflowY = 'hidden';
    }
    
    const pointerId = event.pointerId;
    const state = pointerStateRef.current.get(pointerId);
    if (!state) {
      return;
    }
    window.clearTimeout(state.timerId);
    pointerStateRef.current.delete(pointerId);
    longPressSuppressedClickRef.current = false;
  };

  const renderIntervalSegment = (startMark: TimeMark, endMark: TimeMark) => {
    const startMinute = startMark.timestamp;
    const endMinute = endMark.id === '__end_of_day__' ? DAY_TOTAL_MINUTES : endMark.timestamp;
    const style = getIntervalStyle(startMinute, endMinute);
    if (!style) {
      return null;
    }

    const intervalColor = getIntervalColor(startMark.id, endMark.id);
    const className =
      intervalColor !== 'transparent' ? 'activity-interval-segment' : 'interval-clickable-zone';

    return (
      <div
        key={`interval-${startMark.id}-${endMark.id}`}
        className={className}
        style={{
          ...style,
          ...(intervalColor !== 'transparent' ? { backgroundColor: intervalColor } : {}),
        }}
        onPointerDown={(pointerEvent) => handleSegmentPointerDown(pointerEvent, startMark.id, endMark.id)}
        onPointerUp={handleSegmentPointerUp}
        onPointerLeave={handleSegmentPointerCancel}
        onPointerCancel={handleSegmentPointerCancel}
      />
    );
  };

  useEffect(() => {
    if (focusMinute === null) {
      return;
    }
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    const targetX = (focusMinute / DAY_TOTAL_MINUTES) * timelineWidth;
    const centeredX = targetX - container.clientWidth / 2;
    container.scrollTo({
      left: Math.max(0, centeredX),
      behavior: 'smooth',
    });
  }, [focusMinute, timelineWidth]);

  return (
    <div className="activity-chart">
      <div className="timeline-scroll-container" ref={scrollContainerRef}>
        <div className="timeline-scroll-track">
          <div
            className="timeline-content"
            style={{ width: `${timelineWidth}px` }}
          >
            <div
              className="timeline-bar"
              ref={timelineBarRef}
              onPointerDown={handleTimelinePointerDown}
              onPointerMove={handleTimelinePointerMove}
              onPointerUp={handleTimelinePointerUp}
              onPointerCancel={handleTimelinePointerCancel}
            >
            {currentMinute !== null && (
              <div
                className="current-time-marker"
                style={{ left: `${minutesToPercent(currentMinute)}%` }}
              >
                <span className="current-time-line" />
              </div>
            )}

            {activeOverlay && (() => {
              const style = getIntervalStyle(activeOverlay.startMinute, activeOverlay.endMinute);
              if (!style) {
                return null;
              }
              const color =
                activeOverlay.type === null
                  ? ACTIVITY_COLORS.null
                  : ACTIVITY_COLORS[activeOverlay.type];
              return (
                <div
                  className="active-overlay-segment"
                  style={{
                    ...style,
                    backgroundColor: color,
                  }}
                />
              );
            })()}

            {orderedMarks.map((mark, index) => {
              if (index >= orderedMarks.length - 1) {
                return null;
              }
              const nextMark = orderedMarks[index + 1];
              return renderIntervalSegment(mark, nextMark);
            })}

            {HOUR_TICKS.map((hour) => (
              <div
                key={`tick-${hour}`}
                className="timeline-hour-tick"
                style={{ left: `${minutesToPercent(hour * 60)}%` }}
              />
            ))}

            {marks.map((mark) => (
              <div
                key={mark.id}
                className="time-mark"
                style={{ left: `${minutesToPercent(mark.timestamp)}%` }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onPointerUp={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onMarkClick(mark);
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onMarkClick(mark);
                }}
              >
                <span className="time-mark-core" />
              </div>
            ))}
            </div>

            <div className="timeline-labels">
              {HOUR_TICKS.map((hour) => {
                const label = `${String(hour % 24).padStart(2, '0')}:00`;
                const leftPercent = minutesToPercent(hour * 60);
                const alignmentClass = hour === 24 ? 'timeline-hour-label end' : 'timeline-hour-label';
                return (
                  <div
                    key={`label-${hour}`}
                    className={alignmentClass}
                    style={{ left: `${leftPercent}%` }}
                  >
                    {hour === 24 ? '23:59' : label}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ActivityChart;

