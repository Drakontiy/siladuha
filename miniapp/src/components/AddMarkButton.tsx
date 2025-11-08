import React from 'react';
import './AddMarkButton.css';

interface AddMarkButtonProps {
  onClick: () => void;
  isTimePickerOpen?: boolean;
}

const AddMarkButton: React.FC<AddMarkButtonProps> = ({ onClick, isTimePickerOpen = false }) => {
  return (
    <button
      className={`add-mark-button ${isTimePickerOpen ? 'picker-open' : ''}`}
      onClick={onClick}
      aria-label="Добавить метку"
    >
      {!isTimePickerOpen && (
        <span className="add-mark-text">Добавить метку</span>
      )}
      {isTimePickerOpen && (
        <span className="add-mark-clock">🕐</span>
      )}
    </button>
  );
};

export default AddMarkButton;

