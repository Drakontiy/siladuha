import React from 'react';
import { ActivityType, ACTIVITY_COLORS, ACTIVITY_NAMES } from '../types';
import './ActivityTypePicker.css';

interface ActivityTypePickerProps {
  onSelect: (type: ActivityType) => void;
  onClose: () => void;
}

const ActivityTypePicker: React.FC<ActivityTypePickerProps> = ({ onSelect, onClose }) => {
  const activityTypes: ActivityType[] = ['sleep', 'productive', 'rest', 'procrastination', null];

  return (
    <div className="activity-type-picker-overlay" onClick={onClose}>
      <div className="activity-type-picker" onClick={(e) => e.stopPropagation()}>
        <div className="activity-type-picker-content">
          {activityTypes.map((type) => (
            <button
              key={type || 'none'}
              className={`activity-type-option ${type === null ? 'activity-type-none' : ''}`}
              style={type !== null ? { backgroundColor: ACTIVITY_COLORS[type] } : {}}
              onClick={() => {
                onSelect(type);
                onClose();
              }}
            >
              {type === null ? 'Не отмечено' : ACTIVITY_NAMES[type]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ActivityTypePicker;

