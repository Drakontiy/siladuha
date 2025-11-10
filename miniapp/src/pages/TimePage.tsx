import React, { useState, useEffect, useRef, useCallback } from 'react';
import { formatDate, addDays, getStartOfDay, getDateKey } from '../utils/dateUtils';
import {
  getDayActivity,
  saveTimeMark,
  deleteTimeMark,
  saveActivityInterval,
  getIntervalBetweenMarks,
  loadActivityData,
  saveActivityData,
  deleteIntervalsBetweenMarks,
} from '../utils/storage';
import { TimeMark, ActivityInterval, ActivityType } from '../types';
import ActivityChart from '../components/ActivityChart';
import TimePicker from '../components/TimePicker';
import MarkModal from '../components/MarkModal';
import ActivityTypePicker from '../components/ActivityTypePicker';
import CalendarModal from '../components/CalendarModal';
import './TimePage.css';

const VIRTUAL_BOUNDARIES = [
  { id: '__start_of_day__', timestamp: 0 },
  { id: '__end_of_day__', timestamp: 23 * 60 + 59 },
];

const VIRTUAL_MARK_TIMESTAMPS = VIRTUAL_BOUNDARIES.map(boundary => boundary.timestamp);
const VIRTUAL_ID_BY_TIMESTAMP = new Map(VIRTUAL_BOUNDARIES.map(boundary => [boundary.timestamp, boundary.id]));
const START_OF_DAY_ID = VIRTUAL_BOUNDARIES[0].id;
const END_OF_DAY_ID = VIRTUAL_BOUNDARIES[VIRTUAL_BOUNDARIES.length - 1].id;

const getVirtualMarkId = (timestamp: number): string => {
  return VIRTUAL_ID_BY_TIMESTAMP.get(timestamp) ?? '';
};

const getVirtualMarkIdForTimeStart = (timestamp: number): string => {
  for (let i = VIRTUAL_MARK_TIMESTAMPS.length - 1; i >= 0; i -= 1) {
    if (timestamp >= VIRTUAL_MARK_TIMESTAMPS[i]) {
      return VIRTUAL_ID_BY_TIMESTAMP.get(VIRTUAL_MARK_TIMESTAMPS[i]) ?? START_OF_DAY_ID;
    }
  }
  return START_OF_DAY_ID;
};

const getVirtualMarkIdForTimeEnd = (timestamp: number): string => {
  for (let i = 0; i < VIRTUAL_MARK_TIMESTAMPS.length; i += 1) {
    if (timestamp < VIRTUAL_MARK_TIMESTAMPS[i]) {
      return VIRTUAL_ID_BY_TIMESTAMP.get(VIRTUAL_MARK_TIMESTAMPS[i]) ?? END_OF_DAY_ID;
    }
  }
  return END_OF_DAY_ID;
};

const WORK_DURATION_MINUTES = 30;
const REST_DURATION_MINUTES = 5;
const DAY_END_MINUTE = 23 * 60 + 59;

const clampMinute = (minute: number) => Math.max(0, Math.min(DAY_END_MINUTE, minute));

const formatRemainingTime = (ms: number) => {
  if (ms <= 0) {
    return '00:00';
  }
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

type ActiveTimerState = {
  id: string;
  kind: 'work' | 'rest';
  startMinute: number;
  durationMinutes: number;
  startTimestamp: number;
  startMarkId: string;
  activityType: Exclude<ActivityType, null>;
};

type TimerPrompt =
  | { type: 'rest'; startMinute: number; startMarkId: string }
  | { type: 'resume' };

const TimePage: React.FC = () => {
  const [currentDate, setCurrentDate] = useState<Date>(getStartOfDay(new Date()));
  const [marks, setMarks] = useState<TimeMark[]>([]);
  const [intervals, setIntervals] = useState<ActivityInterval[]>([]);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timePickerInitial, setTimePickerInitial] = useState<{ hour: number; minute: number } | null>(null);
  const [selectedMark, setSelectedMark] = useState<TimeMark | null>(null);
  const [editingMark, setEditingMark] = useState<TimeMark | null>(null);
  const [selectedInterval, setSelectedInterval] = useState<{ startMarkId: string; endMarkId: string } | null>(null);
  const [currentMinute, setCurrentMinute] = useState<number | null>(null);
  const [focusMinute, setFocusMinute] = useState<number | null>(null);
  const [activeTimer, setActiveTimer] = useState<ActiveTimerState | null>(null);
  const [activeOverlay, setActiveOverlay] = useState<{ startMinute: number; endMinute: number; type: ActivityType } | null>(null);
  const [timerRemainingMs, setTimerRemainingMs] = useState<number>(0);
  const [timerPrompt, setTimerPrompt] = useState<TimerPrompt | null>(null);
  const initialFocusDoneRef = useRef(false);
  const [confirmStopVisible, setConfirmStopVisible] = useState(false);
  const [isCalendarOpen, setCalendarOpen] = useState(false);

  const todayKey = getDateKey(getStartOfDay(new Date()));
  const currentDateKey = getDateKey(currentDate);
  const isToday = currentDateKey === todayKey;

  const getMinuteWithinCurrentDay = useCallback((date: Date) => {
    return clampMinute(Math.floor((date.getTime() - currentDate.getTime()) / 60000));
  }, [currentDate]);

  const getNowMinuteWithinCurrentDay = useCallback(() => {
    return getMinuteWithinCurrentDay(new Date());
  }, [getMinuteWithinCurrentDay]);

  const upsertMarkAtMinute = useCallback((minute: number): TimeMark => {
    const clamped = clampMinute(minute);
    const existing = marks.find(m => m.timestamp === clamped);
    if (existing) {
      return existing;
    }

    const hour = Math.floor(clamped / 60);
    const minuteValue = clamped % 60;
    const newMark: TimeMark = {
      id: `${Date.now()}-${Math.random()}`,
      hour,
      minute: minuteValue,
      timestamp: clamped,
    };

    saveTimeMark(currentDate, newMark);
    setMarks((prev) => {
      const already = prev.find(m => m.timestamp === clamped);
      if (already) {
        return prev;
      }
      return [...prev, newMark].sort((a, b) => a.timestamp - b.timestamp);
    });
    return newMark;
  }, [marks, currentDate]);

  const addIntervalToState = useCallback((interval: ActivityInterval) => {
    setIntervals((prev) => {
      const filtered = prev.filter(i => !(i.startMarkId === interval.startMarkId && i.endMarkId === interval.endMarkId));
      return [...filtered, interval];
    });
  }, []);

  const startWorkTimer = useCallback(() => {
    if (!isToday || activeTimer) {
      return;
    }
    const minute = getNowMinuteWithinCurrentDay();
    const startMark = upsertMarkAtMinute(minute);
    const timer: ActiveTimerState = {
      id: `timer-${Date.now()}`,
      kind: 'work',
      startMinute: startMark.timestamp,
      durationMinutes: WORK_DURATION_MINUTES,
      startTimestamp: Date.now(),
      startMarkId: startMark.id,
      activityType: 'productive',
    };
    setActiveTimer(timer);
    setActiveOverlay({
      startMinute: startMark.timestamp,
      endMinute: startMark.timestamp,
      type: 'productive',
    });
    setTimerRemainingMs(timer.durationMinutes * 60_000);
    setTimerPrompt(null);
    setConfirmStopVisible(false);
    setFocusMinute(startMark.timestamp);
  }, [activeTimer, getNowMinuteWithinCurrentDay, isToday, upsertMarkAtMinute]);

  const stopActiveTimer = useCallback((finalMinute?: number) => {
    if (!activeTimer) {
      return;
    }
    const endMinute = clampMinute(finalMinute ?? getNowMinuteWithinCurrentDay());
    const endMark = upsertMarkAtMinute(endMinute);
    const interval: ActivityInterval = {
      id: `${Date.now()}-${Math.random()}`,
      startMarkId: activeTimer.startMarkId,
      endMarkId: endMark.id,
      type: activeTimer.activityType,
    };
    saveActivityInterval(currentDate, interval);
    addIntervalToState(interval);
    setActiveOverlay(null);
    setActiveTimer(null);
    setTimerRemainingMs(0);
    setTimerPrompt(null);
    setFocusMinute(endMinute);
    setConfirmStopVisible(false);
  }, [activeTimer, addIntervalToState, currentDate, getNowMinuteWithinCurrentDay, upsertMarkAtMinute]);

  const startRestTimer = useCallback((startMinute: number, startMarkId: string) => {
    if (activeTimer) {
      return;
    }
    if (!isToday) {
      setTimerPrompt(null);
      return;
    }
    const startMarkExisting = marks.find(m => m.id === startMarkId);
    const baseMinute = startMarkExisting ? startMarkExisting.timestamp : startMinute;
    const startMark = upsertMarkAtMinute(baseMinute);
    const timer: ActiveTimerState = {
      id: `timer-${Date.now()}`,
      kind: 'rest',
      startMinute: startMark.timestamp,
      durationMinutes: REST_DURATION_MINUTES,
      startTimestamp: Date.now(),
      startMarkId: startMark.id,
      activityType: 'rest',
    };
    setActiveTimer(timer);
    setActiveOverlay({
      startMinute: startMark.timestamp,
      endMinute: startMark.timestamp,
      type: 'rest',
    });
    setTimerRemainingMs(timer.durationMinutes * 60_000);
    setTimerPrompt(null);
    setConfirmStopVisible(false);
    setFocusMinute(startMark.timestamp);
  }, [activeTimer, isToday, marks, upsertMarkAtMinute]);

  const handleRestPromptConfirm = useCallback(() => {
    if (timerPrompt?.type !== 'rest') {
      return;
    }
    startRestTimer(timerPrompt.startMinute, timerPrompt.startMarkId);
  }, [startRestTimer, timerPrompt]);

  const handleResumePromptClose = useCallback(() => {
    setTimerPrompt(null);
  }, []);

  const handleStartButtonClick = useCallback(() => {
    if (activeTimer) {
      setConfirmStopVisible(true);
    } else {
      startWorkTimer();
    }
  }, [activeTimer, startWorkTimer]);

  const handleStopConfirmed = useCallback(() => {
    stopActiveTimer();
  }, [stopActiveTimer]);

  const handleStopCancelled = useCallback(() => {
    setConfirmStopVisible(false);
  }, []);

  // Загружаем метки и интервалы при изменении даты
  useEffect(() => {
    const activity = getDayActivity(currentDate);
    setMarks(activity.marks || []);
    setIntervals(activity.intervals || []);
    initialFocusDoneRef.current = false;
    if (!initialFocusDoneRef.current) {
      setFocusMinute(null);
    }
    setActiveTimer(null);
    setActiveOverlay(null);
    setTimerRemainingMs(0);
    setTimerPrompt(null);
    setConfirmStopVisible(false);
  }, [currentDate]);

  useEffect(() => {
    const updateCurrentMinute = () => {
      if (!isToday) {
        setCurrentMinute(null);
        return;
      }
      setCurrentMinute(getNowMinuteWithinCurrentDay());
    };

    updateCurrentMinute();

    const timerId = window.setInterval(updateCurrentMinute, 60_000);
    return () => window.clearInterval(timerId);
}, [getNowMinuteWithinCurrentDay, isToday]);

  useEffect(() => {
    if (!activeTimer) {
      return;
    }

    let cancelled = false;
    let intervalId: number;
    const targetEndMinute = clampMinute(activeTimer.startMinute + activeTimer.durationMinutes);

    const finalizeTimer = () => {
      if (cancelled) {
        return;
      }
      cancelled = true;
      window.clearInterval(intervalId);
      const endMinute = clampMinute(targetEndMinute);
      const endMark = upsertMarkAtMinute(endMinute);
      const interval: ActivityInterval = {
        id: `${Date.now()}-${Math.random()}`,
        startMarkId: activeTimer.startMarkId,
        endMarkId: endMark.id,
        type: activeTimer.activityType,
      };
      saveActivityInterval(currentDate, interval);
      addIntervalToState(interval);
      setActiveOverlay(null);
      setActiveTimer(null);
      setTimerRemainingMs(0);
      setFocusMinute(endMinute);
      setConfirmStopVisible(false);
      if (activeTimer.kind === 'work') {
        setTimerPrompt({ type: 'rest', startMinute: endMinute, startMarkId: endMark.id });
      } else {
        setTimerPrompt({ type: 'resume' });
      }
    };

    const updateOverlay = () => {
      if (cancelled) {
        return;
      }
      const now = Date.now();
      const elapsedMs = now - activeTimer.startTimestamp;
      const elapsedMinutes = Math.floor(elapsedMs / 60000);
      const progressMinute = clampMinute(activeTimer.startMinute + elapsedMinutes);
      const displayMinute = Math.min(progressMinute, targetEndMinute);
      setActiveOverlay({
        startMinute: activeTimer.startMinute,
        endMinute: displayMinute,
        type: activeTimer.activityType,
      });
      setTimerRemainingMs(Math.max(0, activeTimer.durationMinutes * 60_000 - elapsedMs));
      if (elapsedMinutes >= activeTimer.durationMinutes || displayMinute >= targetEndMinute) {
        finalizeTimer();
      }
    };

    updateOverlay();
    intervalId = window.setInterval(updateOverlay, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeTimer, addIntervalToState, currentDate, upsertMarkAtMinute]);

  useEffect(() => {
    if (!initialFocusDoneRef.current && isToday && currentMinute !== null) {
      setFocusMinute(currentMinute);
      initialFocusDoneRef.current = true;
    }
  }, [isToday, currentMinute]);

  useEffect(() => {
    if (isToday) {
      return;
    }
    if (marks.length > 0) {
      setFocusMinute(marks[0].timestamp);
    } else {
      setFocusMinute(0);
    }
  }, [isToday, marks]);

  const handlePreviousDay = () => {
    setCurrentDate(addDays(currentDate, -1));
  };

  const handleNextDay = () => {
    setCurrentDate(addDays(currentDate, 1));
  };

  const handleDateDisplayClick = () => {
    setCalendarOpen(true);
  };

  const handleCalendarDateSelect = (date: Date) => {
    setCurrentDate(getStartOfDay(date));
    setCalendarOpen(false);
  };

  const handleCalendarClose = () => {
    setCalendarOpen(false);
  };

  const handleTimelineClick = (absoluteMinutes: number) => {
    const hour = Math.floor(absoluteMinutes / 60);
    const minute = absoluteMinutes % 60;
    setEditingMark(null);
    setTimePickerInitial({ hour, minute });
    setShowTimePicker(true);
    setFocusMinute(absoluteMinutes);
  };

  const handleTimeSelect = (hour: number, minute: number) => {
    if (editingMark) {
      // Обновляем существующую метку
      const updatedMark: TimeMark = {
        ...editingMark,
        hour,
        minute,
        timestamp: hour * 60 + minute,
      };
      saveTimeMark(currentDate, updatedMark);
      setMarks(marks.map(m => m.id === editingMark.id ? updatedMark : m).sort((a, b) => a.timestamp - b.timestamp));
      setEditingMark(null);
    } else {
      // Создаем новую метку
      const newMark: TimeMark = {
        id: `${Date.now()}-${Math.random()}`,
        hour,
        minute,
        timestamp: hour * 60 + minute,
      };
      
      // Сохраняем метку сначала
      saveTimeMark(currentDate, newMark);
      const sortedMarks = [...marks, newMark].sort((a, b) => a.timestamp - b.timestamp);
      setMarks(sortedMarks);

      // Проверяем, попадает ли новая метка в существующий интервал
      const newMarkIndex = sortedMarks.findIndex(m => m.id === newMark.id);
      let prevMarkId: string;
      let nextMarkId: string;
      
      // Определяем предыдущую метку (реальную или виртуальную)
      if (newMarkIndex > 0) {
        const prevMark = sortedMarks[newMarkIndex - 1];
        // Проверяем, есть ли виртуальная метка между предыдущей и новой меткой
        const relevantVirtualMark = VIRTUAL_MARK_TIMESTAMPS
          .filter(vm => vm > prevMark.timestamp && vm < newMark.timestamp)
          .sort((a, b) => b - a)[0]; // Берем ближайшую виртуальную метку перед новой
        
        if (relevantVirtualMark !== undefined) {
          prevMarkId = getVirtualMarkId(relevantVirtualMark) || prevMark.id;
        } else {
          prevMarkId = prevMark.id;
        }
      } else {
        // Проверяем, какая виртуальная метка должна быть перед новой меткой
        prevMarkId = getVirtualMarkIdForTimeStart(newMark.timestamp);
      }
      
      // Определяем следующую метку (реальную или виртуальную)
      if (newMarkIndex < sortedMarks.length - 1) {
        const nextMark = sortedMarks[newMarkIndex + 1];
        // Проверяем, есть ли виртуальная метка между новой и следующей меткой
        const relevantVirtualMark = VIRTUAL_MARK_TIMESTAMPS
          .filter(vm => vm > newMark.timestamp && vm < nextMark.timestamp)
          .sort((a, b) => a - b)[0]; // Берем ближайшую виртуальную метку после новой
        
        if (relevantVirtualMark !== undefined) {
          nextMarkId = getVirtualMarkId(relevantVirtualMark) || nextMark.id;
        } else {
          nextMarkId = nextMark.id;
        }
      } else {
        // Проверяем, какая виртуальная метка должна быть после новой метки
        nextMarkId = getVirtualMarkIdForTimeEnd(newMark.timestamp);
      }
      
      // Ищем интервал, который нужно разделить
      let intervalToSplit: ActivityInterval | null = getIntervalBetweenMarks(
        currentDate,
        prevMarkId,
        nextMarkId
      );

      // Удаляем все интервалы с такими границами и используем информацию о типе активности
      const removedIntervals = deleteIntervalsBetweenMarks(currentDate, prevMarkId, nextMarkId);
      if (!intervalToSplit) {
        intervalToSplit = removedIntervals.find(interval => interval.type !== null) ?? null;
      }

      if (intervalToSplit) {
        const activityType = intervalToSplit.type;

        const removedIntervalIds = new Set(removedIntervals.map(interval => interval.id));
        if (intervalToSplit.id) {
          removedIntervalIds.add(intervalToSplit.id);
        }

        // Удаляем локально все старые интервалы между выбранными метками
        const updatedIntervals = intervals.filter(
          i =>
            !(i.startMarkId === prevMarkId && i.endMarkId === nextMarkId) &&
            !removedIntervalIds.has(i.id)
        );

        // Создаем два новых интервала с тем же цветом
        const leftInterval: ActivityInterval = {
          id: `${Date.now()}-${Math.random()}`,
          startMarkId: prevMarkId,
          endMarkId: newMark.id,
          type: activityType,
        };

        const rightInterval: ActivityInterval = {
          id: `${Date.now()}-${Math.random()}-2`,
          startMarkId: newMark.id,
          endMarkId: nextMarkId,
          type: activityType,
        };

        updatedIntervals.push(leftInterval);
        updatedIntervals.push(rightInterval);

        saveActivityInterval(currentDate, leftInterval);
        saveActivityInterval(currentDate, rightInterval);

        setIntervals(updatedIntervals);
      }
    }
    setShowTimePicker(false);
    setTimePickerInitial(null);
    setFocusMinute(hour * 60 + minute);
  };

  const handleCancelTimePicker = () => {
    setShowTimePicker(false);
    setEditingMark(null);
    setTimePickerInitial(null);
  };

  const handleMarkClick = (mark: TimeMark) => {
    setSelectedMark(mark);
  };

  const handleMarkEdit = () => {
    if (selectedMark) {
      setEditingMark(selectedMark);
      setTimePickerInitial({ hour: selectedMark.hour, minute: selectedMark.minute });
      setSelectedMark(null);
      setShowTimePicker(true);
    }
  };

  const handleMarkDelete = () => {
    if (selectedMark) {
      deleteTimeMark(currentDate, selectedMark.id);
      setMarks(marks.filter(m => m.id !== selectedMark.id));
      setSelectedMark(null);
    }
  };

  const handleIntervalLongPress = (startMarkId: string, endMarkId: string) => {
    setSelectedInterval({ startMarkId, endMarkId });
  };

  const handleActivityTypeSelect = (type: ActivityType) => {
    if (selectedInterval) {
      const existingInterval = getIntervalBetweenMarks(
        currentDate,
        selectedInterval.startMarkId,
        selectedInterval.endMarkId
      );

      // Если выбран "не отмечено", удаляем интервал
      if (type === null) {
        if (existingInterval) {
          const updatedIntervals = intervals.filter(i => i.id !== existingInterval.id);
          setIntervals(updatedIntervals);
          
          // Удаляем из storage
          const dateKey = getDateKey(currentDate);
          const allData = loadActivityData();
          if (allData[dateKey] && allData[dateKey].intervals) {
            allData[dateKey].intervals = allData[dateKey].intervals.filter(i => i.id !== existingInterval.id);
            saveActivityData(allData);
          }
        }
      } else {
        // Создаем или обновляем интервал
        const interval: ActivityInterval = existingInterval || {
          id: `${Date.now()}-${Math.random()}`,
          startMarkId: selectedInterval.startMarkId,
          endMarkId: selectedInterval.endMarkId,
          type: type,
        };

        if (existingInterval) {
          interval.type = type;
        }

        saveActivityInterval(currentDate, interval);
        setIntervals(
          existingInterval
            ? intervals.map(i => i.id === existingInterval.id ? interval : i)
            : [...intervals, interval]
        );
      }
      setSelectedInterval(null);
    }
  };

  return (
    <div className="time-page">
      {/* Верхняя часть с датой и стрелками */}
      <div className="date-header">
        <button className="date-arrow" onClick={handlePreviousDay} aria-label="Предыдущий день">
          ◀
        </button>
        <button className="date-display" onClick={handleDateDisplayClick} aria-label="Открыть календарь">
          {formatDate(currentDate)}
        </button>
        <button className="date-arrow" onClick={handleNextDay} aria-label="Следующий день">
          ▶
        </button>
      </div>

      {/* Графики активности */}
      <ActivityChart
        marks={marks}
        intervals={intervals}
        onMarkClick={handleMarkClick}
        onIntervalLongPress={handleIntervalLongPress}
        onLineClick={handleTimelineClick}
        activeOverlay={activeOverlay}
        currentMinute={isToday ? currentMinute : null}
        focusMinute={focusMinute}
      />

      {isToday && (
        <div className="work-start-container">
          <button
            className={`work-start-button ${activeTimer ? 'work-start-button--active' : ''}`}
            onClick={handleStartButtonClick}
          >
            {activeTimer ? (
              <>
                <span className="work-start-button__countdown">{formatRemainingTime(timerRemainingMs)}</span>
                <span className="work-start-button__caption">
                  Нажмите, чтобы остановить
                </span>
              </>
            ) : (
              <>
                <span>Начать работу</span>
                <span className="work-start-button__caption">
                  {timerPrompt?.type === 'resume' ? 'Готовы к новому фокусу?' : '30 минут концентрации'}
                </span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Пicker времени */}
      {showTimePicker && (
        <TimePicker
          onTimeSelect={handleTimeSelect}
          onCancel={handleCancelTimePicker}
          initialHour={timePickerInitial?.hour ?? editingMark?.hour}
          initialMinute={timePickerInitial?.minute ?? editingMark?.minute}
        />
      )}

      {/* Модальное окно метки */}
      {selectedMark && (
        <MarkModal
          hour={selectedMark.hour}
          minute={selectedMark.minute}
          onEdit={handleMarkEdit}
          onDelete={handleMarkDelete}
          onClose={() => setSelectedMark(null)}
        />
      )}

      {/* Выбор типа активности */}
      {selectedInterval && (
        <ActivityTypePicker
          onSelect={handleActivityTypeSelect}
          onClose={() => setSelectedInterval(null)}
        />
      )}

      {timerPrompt?.type === 'rest' && (
        <div className="timer-modal">
          <div className="timer-modal-content">
            <p>Вы хорошо поработали и заслужили 5 минут отдыха.</p>
            <div className="timer-modal-actions">
              <button className="timer-modal-button" onClick={handleRestPromptConfirm}>Спасибо!</button>
            </div>
          </div>
        </div>
      )}

      {timerPrompt?.type === 'resume' && (
        <div className="timer-modal">
          <div className="timer-modal-content">
            <p>Не пора ли вернуться к работе? :)</p>
            <div className="timer-modal-actions">
              <button className="timer-modal-button" onClick={handleResumePromptClose}>Вернуться</button>
            </div>
          </div>
        </div>
      )}

      {confirmStopVisible && activeTimer && (
        <div className="timer-modal">
          <div className="timer-modal-content">
            <p>Остановить текущий фокус раньше времени?</p>
            <div className="timer-modal-actions">
              <button className="timer-modal-button timer-modal-button--secondary" onClick={handleStopCancelled}>
                Продолжить
              </button>
              <button className="timer-modal-button timer-modal-button--danger" onClick={handleStopConfirmed}>
                Остановить
              </button>
            </div>
          </div>
        </div>
      )}

      {isCalendarOpen && (
        <CalendarModal
          anchorDate={currentDate}
          onSelectDate={handleCalendarDateSelect}
          onClose={handleCalendarClose}
        />
      )}
    </div>
  );
};

export default TimePage;

