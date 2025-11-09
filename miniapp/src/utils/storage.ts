import { DayActivity, TimeMark, ActivityInterval } from '../types';
import { getDateKey } from './dateUtils';
import { getActivityState, setActivityState } from './userStateSync';

/**
 * Получает активность для конкретной даты
 */
export function getDayActivity(date: Date): DayActivity {
  const dateKey = getDateKey(date);
  const allData = loadActivityData();
  return allData[dateKey] || { date: dateKey, marks: [], intervals: [] };
}

/**
 * Сохраняет метку времени для даты
 */
export function saveTimeMark(date: Date, mark: TimeMark): void {
  const dateKey = getDateKey(date);
  const allData = loadActivityData();
  
  if (!allData[dateKey]) {
    allData[dateKey] = { date: dateKey, marks: [], intervals: [] };
  }
  
  if (!allData[dateKey].intervals) {
    allData[dateKey].intervals = [];
  }
  
  // Проверяем, нет ли уже такой метки
  const existingIndex = allData[dateKey].marks.findIndex(m => m.id === mark.id);
  if (existingIndex >= 0) {
    allData[dateKey].marks[existingIndex] = mark;
  } else {
    allData[dateKey].marks.push(mark);
  }
  
  // Сортируем метки по времени
  allData[dateKey].marks.sort((a, b) => a.timestamp - b.timestamp);
  
  saveActivityData(allData);
}

/**
 * Удаляет метку времени
 */
export function deleteTimeMark(date: Date, markId: string): void {
  const dateKey = getDateKey(date);
  const allData = loadActivityData();
  
  if (allData[dateKey]) {
    allData[dateKey].marks = allData[dateKey].marks.filter(m => m.id !== markId);
    // Удаляем интервалы, связанные с этой меткой
    if (allData[dateKey].intervals) {
      allData[dateKey].intervals = allData[dateKey].intervals.filter(
        interval => interval.startMarkId !== markId && interval.endMarkId !== markId
      );
    }
    saveActivityData(allData);
  }
}

/**
 * Сохраняет или обновляет интервал активности
 */
export function saveActivityInterval(date: Date, interval: ActivityInterval): void {
  const dateKey = getDateKey(date);
  const allData = loadActivityData();
  
  if (!allData[dateKey]) {
    allData[dateKey] = { date: dateKey, marks: [], intervals: [] };
  }
  
  if (!allData[dateKey].intervals) {
    allData[dateKey].intervals = [];
  }
  
  const existingIndex = allData[dateKey].intervals.findIndex(i => i.id === interval.id);
  if (existingIndex >= 0) {
    allData[dateKey].intervals[existingIndex] = interval;
  } else {
    allData[dateKey].intervals.push(interval);
  }
  
  saveActivityData(allData);
}

/**
 * Получает интервал между двумя метками
 */
export function getIntervalBetweenMarks(
  date: Date,
  startMarkId: string,
  endMarkId: string
): ActivityInterval | null {
  const dateKey = getDateKey(date);
  const allData = loadActivityData();
  
  if (allData[dateKey] && allData[dateKey].intervals) {
    return allData[dateKey].intervals.find(
      interval => interval.startMarkId === startMarkId && interval.endMarkId === endMarkId
    ) || null;
  }
  
  return null;
}

/**
 * Удаляет интервал активности
 */
export function deleteActivityInterval(date: Date, intervalId: string): void {
  const dateKey = getDateKey(date);
  const allData = loadActivityData();
  
  if (allData[dateKey] && allData[dateKey].intervals) {
    allData[dateKey].intervals = allData[dateKey].intervals.filter(i => i.id !== intervalId);
    saveActivityData(allData);
  }
}

/**
 * Загружает данные активности из памяти/сервера
 */
export function loadActivityData(): Record<string, DayActivity> {
  return getActivityState();
}

/**
 * Сохраняет данные активности и инициирует синхронизацию
 */
export function saveActivityData(data: Record<string, DayActivity>): void {
  setActivityState(data);
}

