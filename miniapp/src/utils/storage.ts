import { DayActivity, TimeMark, ActivityInterval } from '../types';
import { getDateKey } from './dateUtils';
import { getActivityState, setActivityState } from './userStateSync';
import { updateCurrencyForProductiveIntervals, calculateProductiveMinutes } from './homeStorage';

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
    // Проверяем, были ли удаляемые интервалы продуктивными
    const intervalsToDelete = allData[dateKey].intervals?.filter(
      interval => interval.startMarkId === markId || interval.endMarkId === markId
    ) || [];
    const hadProductiveIntervals = intervalsToDelete.some(i => i.type === 'productive');
    
    // Сохраняем предыдущее количество продуктивных минут
    const previousProductiveMinutes = hadProductiveIntervals ? calculateProductiveMinutes(date) : null;
    
    allData[dateKey].marks = allData[dateKey].marks.filter(m => m.id !== markId);
    // Удаляем интервалы, связанные с этой меткой
    if (allData[dateKey].intervals) {
      allData[dateKey].intervals = allData[dateKey].intervals.filter(
        interval => interval.startMarkId !== markId && interval.endMarkId !== markId
      );
    }
    saveActivityData(allData);
    
    // Обновляем газ, если удаленные интервалы были продуктивными
    if (hadProductiveIntervals && previousProductiveMinutes !== null) {
      updateCurrencyForProductiveIntervals(date, previousProductiveMinutes);
    }
  }
}

/**
 * Сохраняет или обновляет интервал активности
 */
export function saveActivityInterval(date: Date, interval: ActivityInterval): void {
  const dateKey = getDateKey(date);
  const allData = loadActivityData();
  
  // Сохраняем предыдущее количество продуктивных минут для сравнения
  let previousProductiveMinutes: number | null = null;
  const isProductive = interval.type === 'productive';
  
  // Проверяем, был ли интервал продуктивным до изменения
  let wasProductive = false;
  if (allData[dateKey]?.intervals) {
    const existingInterval = allData[dateKey].intervals.find(i => i.id === interval.id);
    wasProductive = existingInterval?.type === 'productive' || false;
    
    // Если интервал был продуктивным или стал продуктивным, нужно пересчитать
    if (wasProductive || isProductive) {
      previousProductiveMinutes = calculateProductiveMinutes(date);
    }
  }
  
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
  
  // Обновляем газ, если интервал продуктивный или был продуктивным
  if (isProductive || wasProductive) {
    updateCurrencyForProductiveIntervals(date, previousProductiveMinutes);
  }
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
    // Проверяем, был ли удаляемый интервал продуктивным
    const intervalToDelete = allData[dateKey].intervals.find(i => i.id === intervalId);
    const wasProductive = intervalToDelete?.type === 'productive';
    
    // Сохраняем предыдущее количество продуктивных минут
    const previousProductiveMinutes = wasProductive ? calculateProductiveMinutes(date) : null;
    
    allData[dateKey].intervals = allData[dateKey].intervals.filter(i => i.id !== intervalId);
    saveActivityData(allData);
    
    // Обновляем газ, если удаленный интервал был продуктивным
    if (wasProductive && previousProductiveMinutes !== null) {
      updateCurrencyForProductiveIntervals(date, previousProductiveMinutes);
    }
  }
}

/**
 * Удаляет все интервалы между двумя метками и возвращает удаленные интервалы
 */
export function deleteIntervalsBetweenMarks(
  date: Date,
  startMarkId: string,
  endMarkId: string
): ActivityInterval[] {
  const dateKey = getDateKey(date);
  const allData = loadActivityData();

  if (!allData[dateKey] || !allData[dateKey].intervals) {
    return [];
  }

  const removed: ActivityInterval[] = [];
  // Проверяем, были ли удаляемые интервалы продуктивными
  const hadProductiveIntervals = allData[dateKey].intervals.some(
    (interval) => interval.startMarkId === startMarkId && 
                  interval.endMarkId === endMarkId && 
                  interval.type === 'productive'
  );
  
  // Сохраняем предыдущее количество продуктивных минут
  const previousProductiveMinutes = hadProductiveIntervals ? calculateProductiveMinutes(date) : null;
  
  allData[dateKey].intervals = allData[dateKey].intervals.filter((interval) => {
    const matches = interval.startMarkId === startMarkId && interval.endMarkId === endMarkId;
    if (matches) {
      removed.push(interval);
    }
    return !matches;
  });

  if (removed.length > 0) {
    saveActivityData(allData);
    
    // Обновляем газ, если удаленные интервалы были продуктивными
    if (hadProductiveIntervals && previousProductiveMinutes !== null) {
      updateCurrencyForProductiveIntervals(date, previousProductiveMinutes);
    }
  }

  return removed;
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

