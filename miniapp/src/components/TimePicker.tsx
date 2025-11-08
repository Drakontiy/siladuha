import React, { useState, useRef, useEffect } from 'react';
import './TimePicker.css';

interface TimePickerProps {
  onTimeSelect: (hour: number, minute: number) => void;
  onCancel: () => void;
  initialHour?: number;
  initialMinute?: number;
}

const TimePicker: React.FC<TimePickerProps> = ({ onTimeSelect, onCancel, initialHour, initialMinute }) => {
  const [selectedHour, setSelectedHour] = useState<number>(initialHour ?? new Date().getHours());
  const [selectedMinute, setSelectedMinute] = useState<number>(initialMinute ?? 0);
  const hourScrollRef = useRef<HTMLDivElement>(null);
  const minuteScrollRef = useRef<HTMLDivElement>(null);

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 60 }, (_, i) => i);

  // Обновляем значения при изменении начальных значений
  useEffect(() => {
    if (initialHour !== undefined) {
      setSelectedHour(initialHour);
    }
    if (initialMinute !== undefined) {
      setSelectedMinute(initialMinute);
    }
  }, [initialHour, initialMinute]);

  // Прокрутка к выбранному значению при открытии
  useEffect(() => {
    if (hourScrollRef.current) {
      const hourElement = hourScrollRef.current.querySelector(`[data-hour="${selectedHour}"]`);
      if (hourElement) {
        hourElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    if (minuteScrollRef.current) {
      const minuteElement = minuteScrollRef.current.querySelector(`[data-minute="${selectedMinute}"]`);
      if (minuteElement) {
        minuteElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [selectedHour, selectedMinute]);

  const handleHourChange = (hour: number) => {
    setSelectedHour(hour);
  };

  const handleMinuteChange = (minute: number) => {
    setSelectedMinute(minute);
  };

  const handleConfirm = () => {
    onTimeSelect(selectedHour, selectedMinute);
  };

  return (
    <div className="time-picker-overlay" onClick={onCancel}>
      <div className="time-picker" onClick={(e) => e.stopPropagation()}>
        <div className="time-picker-content">
          <div className="time-picker-scrolls">
            <div className="time-picker-scroll" ref={hourScrollRef}>
              {hours.map((hour) => (
                <div
                  key={hour}
                  data-hour={hour}
                  className={`time-picker-item ${selectedHour === hour ? 'selected' : ''}`}
                  onClick={() => handleHourChange(hour)}
                >
                  {String(hour).padStart(2, '0')}
                </div>
              ))}
            </div>
            <div className="time-picker-scroll" ref={minuteScrollRef}>
              {minutes.map((minute) => (
                <div
                  key={minute}
                  data-minute={minute}
                  className={`time-picker-item ${selectedMinute === minute ? 'selected' : ''}`}
                  onClick={() => handleMinuteChange(minute)}
                >
                  {String(minute).padStart(2, '0')}
                </div>
              ))}
            </div>
          </div>
          <div className="time-picker-actions">
            <button className="time-picker-cancel" onClick={onCancel}>
              Отмена
            </button>
            <button className="time-picker-confirm" onClick={handleConfirm}>
              Готово
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TimePicker;

