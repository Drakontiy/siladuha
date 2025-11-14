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
      // Сначала проверяем user_id из URL или localStorage
      const user = getActiveUser();
      let isAuth = user.userId !== DEFAULT_USER_ID && user.userId !== 'local';
      
      // Если уже авторизован, обновляем состояние и останавливаем проверку
      if (isAuth) {
        setIsAuthenticated(true);
        // Очищаем все старые коды после успешной авторизации
        localStorage.removeItem('max_auth_codes');
        return;
      }
      
      // Если не авторизован, проверяем коды
      // Получаем все сохраненные коды из localStorage
      const savedCodes = localStorage.getItem('max_auth_codes');
      let codes: string[] = savedCodes ? JSON.parse(savedCodes) : [];
      
      // Добавляем текущий код, если он есть и его еще нет в списке
      if (authCode && !codes.includes(authCode)) {
        codes.push(authCode);
        localStorage.setItem('max_auth_codes', JSON.stringify(codes));
      }
      
      // Если кодов нет, показываем экран авторизации
      if (codes.length === 0) {
        setIsAuthenticated(false);
        return;
      }
      
      // Проверяем каждый код на привязку
      const validCodes: string[] = [];
      let boundUserId: string | null = null;
      
      console.log(`🔍 Checking ${codes.length} auth codes for binding...`);
      
      for (const code of codes) {
        try {
          const apiBase = process.env.MINIAPP_API_BASE || window.location.origin;
          console.log(`🔍 Checking code: ${code}`);
          const response = await fetch(`${apiBase}/api/auth/check-code/${code}`);
          
          if (response.ok) {
            const data = await response.json() as { bound: boolean; userId: string | null; expiresAt?: number };
            console.log(`📋 Code ${code} status:`, data);
            
            // Если код истек, пропускаем его
            if (data.expiresAt && data.expiresAt < Date.now()) {
              console.log(`⏰ Code ${code} expired`);
              continue;
            }
            
            // Если код привязан, сохраняем user_id
            if (data.bound && data.userId) {
              console.log(`✅ Code ${code} is bound to userId: ${data.userId}`);
              boundUserId = data.userId;
              // Не добавляем привязанный код в список валидных кодов
              continue;
            }
            
            // Если код не привязан и не истек, добавляем его в список валидных
            console.log(`⏳ Code ${code} is not bound yet, keeping for next check`);
            validCodes.push(code);
          } else if (response.status === 404) {
            // Код не найден или истек, пропускаем его
            console.log(`❌ Code ${code} not found (404)`);
            continue;
          } else {
            console.log(`❌ Code ${code} check failed with status: ${response.status}`);
            // Если ошибка при проверке, оставляем код в списке для следующей проверки
            validCodes.push(code);
          }
        } catch (error) {
          console.error(`❌ Failed to check code ${code}:`, error);
          // Если ошибка при проверке, оставляем код в списке для следующей проверки
          validCodes.push(code);
        }
      }
      
      console.log(`📊 Check result: boundUserId=${boundUserId}, validCodes=${validCodes.length}`);
      
      // Обновляем список кодов в localStorage
      localStorage.setItem('max_auth_codes', JSON.stringify(validCodes));
      
      // Если нашли привязанный код, используем user_id
      if (boundUserId) {
        console.log(`🎉 Found bound userId: ${boundUserId}, applying...`);
        try {
          // Очищаем все коды перед сохранением user_id
          localStorage.removeItem('max_auth_codes');
          
          // Сохраняем user_id в localStorage
          localStorage.setItem('max_last_user_id', boundUserId);
          console.log(`💾 Saved userId to localStorage: ${boundUserId}`);
          
          // Обновляем URL с user_id
          const url = new URL(window.location.href);
          url.searchParams.set('user_id', boundUserId);
          window.history.replaceState({}, '', url.toString());
          console.log(`🔗 Updated URL with userId: ${url.toString()}`);
          
          // Обновляем userIdentity перед проверкой
          const { initializeUserIdentity } = await import('./utils/userIdentity');
          initializeUserIdentity();
          console.log(`🔄 User identity initialized`);
          
          // Перезагружаем страницу для применения изменений
          // После перезагрузки user_id будет загружен из localStorage
          console.log(`🔄 Reloading page...`);
          window.location.reload();
          return;
        } catch (err) {
          console.error('❌ Failed to save user_id:', err);
        }
      }
      
      // Если есть валидные коды (не привязанные), показываем экран авторизации
      // и продолжаем проверять их
      // Если кодов нет, также показываем экран авторизации
      setIsAuthenticated(false);
    };

    checkAuth();
    
    // Проверяем каждые 1 секунду только если не авторизован
    // Останавливаем проверку, если пользователь авторизован
    const intervalId = setInterval(() => {
      const user = getActiveUser();
      const isAuth = user.userId !== DEFAULT_USER_ID && user.userId !== 'local';
      
      // Если авторизован, останавливаем проверку
      if (isAuth) {
        setIsAuthenticated(true);
        localStorage.removeItem('max_auth_codes');
        clearInterval(intervalId);
        return;
      }
      
      checkAuth();
    }, 1000);
    
    return () => clearInterval(intervalId);
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


