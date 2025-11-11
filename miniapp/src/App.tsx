import React, { useEffect, useState } from 'react';
import './App.css';
import TimePage from './pages/TimePage';
import StatsPage from './pages/StatsPage';
import PeoplePage from './pages/PeoplePage';
import SubjectsPage from './pages/SubjectsPage';
import HomePage from './pages/HomePage';
import Navigation from './components/Navigation';
import SyncStatusBadge from './components/SyncStatusBadge';
import { ensureAchievementsUpToDate, processPendingDays, loadHomeState, saveHomeState } from './utils/homeStorage';

type Page = 'home' | 'stats' | 'time' | 'people' | 'subjects';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [maintenanceToken, setMaintenanceToken] = useState(0);

  const runMaintenanceIfNeeded = () => {
    const referenceDate = new Date();
    const state = loadHomeState();
    const processed = processPendingDays(state, referenceDate);
    let nextState = processed.state;
    let changed = processed.changed;
    const ensured = ensureAchievementsUpToDate(nextState, referenceDate);
    if (ensured.changed) {
      nextState = ensured.state;
      changed = true;
    }
    if (changed) {
      saveHomeState(nextState);
      setMaintenanceToken((token) => token + 1);
    }
  };

  useEffect(() => {
    runMaintenanceIfNeeded();
  }, [currentPage]);

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage maintenanceToken={maintenanceToken} />;
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


