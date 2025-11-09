/**
 * Метка времени (активность пользователя)
 */
export interface TimeMark {
  id: string;
  hour: number;
  minute: number;
  timestamp: number; // для сортировки
}

/**
 * Тип активности интервала
 */
export type ActivityType = 'sleep' | 'productive' | 'rest' | 'procrastination' | null;

/**
 * Интервал активности между метками
 */
export interface ActivityInterval {
  id: string;
  startMarkId: string; // ID метки начала
  endMarkId: string; // ID метки конца
  type: ActivityType;
}

/**
 * Данные активности по дате
 */
export interface DayActivity {
  date: string; // DD.MM.YYYY
  marks: TimeMark[];
  intervals: ActivityInterval[];
}

/**
 * Интервал времени суток
 */
export interface TimeInterval {
  label: string;
  start: number; // час начала (0-23)
  end: number; // час конца (0-23)
  startMinute: number; // минута начала (0-59)
  endMinute: number; // минута конца (0-59)
}

/**
 * Цвета для типов активности
 */
export const ACTIVITY_COLORS: Record<Exclude<ActivityType, null>, string> & { null: string } = {
  sleep: '#BF52EF',
  productive: '#82EF52',
  rest: '#52D1EF',
  procrastination: '#EF7052',
  null: 'transparent',
};

/**
 * Названия типов активности
 */
export const ACTIVITY_NAMES: Record<Exclude<ActivityType, null>, string> & { null: string } = {
  sleep: 'Сон',
  productive: 'Продуктивная работа',
  rest: 'Отдых',
  procrastination: 'Прокрастинация',
  null: 'Не отмечено',
};

