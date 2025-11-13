import React, { useEffect, useState } from 'react';
import './App.css';
import TimePage from './pages/TimePage';
import StatsPage from './pages/StatsPage';
import PeoplePage from './pages/PeoplePage';
import SubjectsPage from './pages/SubjectsPage';
import HomePage from './pages/HomePage';
import AuthPage from './pages/AuthPage';
import Navigation from './components/Navigation';
import SyncStatusBadge from './components/SyncStatusBadge';
import { DEFAULT_USER_ID, getActiveUser } from './utils/userIdentity';

type Page = 'home' | 'stats' | 'time' | 'people' | 'subjects';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [authCode, setAuthCode] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const user = getActiveUser();
      const isAuth = user.userId !== DEFAULT_USER_ID && user.userId !== 'local';
      
      if (!isAuth && authCode) {
        // Проверяем, привязан ли код
        try {
          const apiBase = process.env.MINIAPP_API_BASE || window.location.origin;
          const response = await fetch(`${apiBase}/api/auth/check-code/${authCode}`);
          
          if (response.ok) {
            const data = await response.json() as { bound: boolean; userId: string | null };
            if (data.bound && data.userId) {
              // Код привязан, сохраняем user_id в localStorage и обновляем URL
              try {
                localStorage.setItem('max_last_user_id', data.userId);
                
                // Обновляем URL с user_id
                const url = new URL(window.location.href);
                url.searchParams.set('user_id', data.userId);
                window.history.replaceState({}, '', url.toString());
                
                // Обновляем userIdentity
                const { initializeUserIdentity } = await import('./utils/userIdentity');
                initializeUserIdentity();
                
                // Перезагружаем страницу для применения изменений
                window.location.reload();
                return;
              } catch (err) {
                console.error('Failed to save user_id:', err);
              }
            }
          }
        } catch (error) {
          console.error('Failed to check code:', error);
        }
      }
      
      setIsAuthenticated(isAuth);
    };

    checkAuth();
    
    // Проверяем каждые 2 секунды, если не авторизован
    if (!isAuthenticated) {
      const interval = setInterval(checkAuth, 2000);
      return () => clearInterval(interval);
    }
  }, [authCode, isAuthenticated]);

  const handleCodeGenerated = (code: string) => {
    setAuthCode(code);
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage />;
      case 'stats':
        return <StatsPage />;
      case 'time':
        return <TimePage />;
      case 'people':
        return <PeoplePage />;
      case 'subjects':
        return <SubjectsPage />;
      default:
        return <TimePage />;
    }
  };

  // Показываем экран авторизации, если не авторизован
  if (isAuthenticated === false) {
    return (
      <div className="app">
        <AuthPage onCodeGenerated={handleCodeGenerated} />
      </div>
    );
  }

  // Показываем загрузку, пока проверяем авторизацию
  if (isAuthenticated === null) {
    return (
      <div className="app">
        <div className="app-loading">
          Загружаем данные…
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="app-content">
        {renderPage()}
      </div>
      <Navigation currentPage={currentPage} onNavigate={setCurrentPage} />
      <SyncStatusBadge />
    </div>
  );
};

export default App;


