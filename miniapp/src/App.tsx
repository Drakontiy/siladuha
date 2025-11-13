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
    let intervalId: NodeJS.Timeout | null = null;
    let isChecking = false;
    let shouldStop = false;
    
    const checkAuth = async () => {
      // Предотвращаем параллельные проверки
      if (isChecking || shouldStop) {
        return;
      }
      
      isChecking = true;
      
      try {
        const user = getActiveUser();
        const isAuth = user.userId !== DEFAULT_USER_ID && user.userId !== 'local';
        
        // Если уже авторизован, останавливаем проверку
        if (isAuth) {
          setIsAuthenticated(true);
          shouldStop = true;
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
          isChecking = false;
          return;
        }
        
        // Если есть код, проверяем его статус
        if (authCode && !shouldStop) {
          try {
            const apiBase = process.env.MINIAPP_API_BASE || window.location.origin;
            const response = await fetch(`${apiBase}/api/auth/check-code/${authCode}`, {
              cache: 'no-store',
              headers: {
                'Cache-Control': 'no-cache',
              },
            });
            
            if (response.ok) {
              const data = await response.json() as { bound: boolean; userId: string | null };
              if (data.bound && data.userId && !shouldStop) {
                // Код привязан, сохраняем user_id в localStorage и обновляем URL
                try {
                  shouldStop = true;
                  
                  localStorage.setItem('max_last_user_id', data.userId);
                  
                  // Обновляем URL с user_id
                  const url = new URL(window.location.href);
                  url.searchParams.set('user_id', data.userId);
                  window.history.replaceState({}, '', url.toString());
                  
                  // Останавливаем интервал перед перезагрузкой
                  if (intervalId) {
                    clearInterval(intervalId);
                    intervalId = null;
                  }
                  
                  // Обновляем userIdentity
                  const { initializeUserIdentity } = await import('./utils/userIdentity');
                  initializeUserIdentity();
                  
                  // Устанавливаем авторизованный статус перед перезагрузкой
                  setIsAuthenticated(true);
                  
                  // Перезагружаем страницу для применения изменений
                  setTimeout(() => {
                    window.location.reload();
                  }, 100);
                  isChecking = false;
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
        
        // Если не авторизован, устанавливаем статус
        if (!shouldStop) {
          setIsAuthenticated(false);
        }
      } finally {
        isChecking = false;
      }
    };

    // Проверяем сразу
    checkAuth();
    
    // Запускаем интервал только если есть код
    if (authCode && !shouldStop) {
      intervalId = setInterval(() => {
        if (!shouldStop) {
          checkAuth();
        } else {
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
        }
      }, 2000);
    }
    
    return () => {
      shouldStop = true;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
  }, [authCode]);

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


