import React from 'react';
import './MarkModal.css';

interface MarkModalProps {
  hour: number;
  minute: number;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const MarkModal: React.FC<MarkModalProps> = ({ hour, minute, onEdit, onDelete, onClose }) => {
  const timeString = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  return (
    <div className="mark-modal-overlay" onClick={onClose}>
      <div className="mark-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mark-modal-content">
          <div className="mark-modal-time">{timeString}</div>
          <div className="mark-modal-actions">
            <button className="mark-modal-button edit" onClick={onEdit}>
              Изменить
            </button>
            <button className="mark-modal-button delete" onClick={onDelete}>
              Удалить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarkModal;





