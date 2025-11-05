import React from 'react';
import './App.css';

const App: React.FC = () => {
  const handleButtonClick = () => {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.showAlert('🎉 Привет из Mini App!');
    } else {
      alert('🎉 Привет из Mini App!');
    }
  };

  return (
    <div className="app">
      <div className="container">
        <h1>🚀 Mini App</h1>
        <p>Это простое тестовое мини-приложение</p>
        <button onClick={handleButtonClick} className="button">
          Нажми меня!
        </button>
      </div>
    </div>
  );
};

export default App;