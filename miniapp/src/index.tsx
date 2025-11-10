import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initializeUserIdentity } from './utils/userIdentity';
import { initializeUserStateSync } from './utils/userStateSync';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);

const renderApp = () => {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
};

const renderLoading = () => {
  root.render(
    <div className="app-loading">
      Загружаем данные…
    </div>,
  );
};

const bootstrap = async () => {
  renderLoading();

  await initializeUserIdentity();

  try {
    await initializeUserStateSync();
  } catch (error) {
    console.error('Failed to initialize user state sync:', error);
  }

  renderApp();
};

void bootstrap();