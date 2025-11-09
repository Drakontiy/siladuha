import React, { useState } from 'react';
import './App.css';
import TimePage from './pages/TimePage';
import StatsPage from './pages/StatsPage';
import PeoplePage from './pages/PeoplePage';
import CalendarPage from './pages/CalendarPage';
import HomePage from './pages/HomePage';
import Navigation from './components/Navigation';
import SyncStatusBadge from './components/SyncStatusBadge';

type Page = 'home' | 'stats' | 'time' | 'people' | 'calendar';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('time');

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
      case 'calendar':
        return <CalendarPage />;
      default:
        return <TimePage />;
    }
  };

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


