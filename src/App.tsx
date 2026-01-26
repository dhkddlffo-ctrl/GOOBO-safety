import React, { useState } from 'react';
import HomePage from './pages/HomePage';
import SuggestionPage from './pages/SuggestionPage';
import WorkStopPage from './pages/WorkStopPage';
import AdminPage from './pages/AdminPage';

type Page = 'home' | 'suggestion' | 'work-stop' | 'admin';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [preselectedSiteId, setPreselectedSiteId] = useState<number | undefined>();

  const navigate = (page: string, siteId?: number) => {
    setCurrentPage(page as Page);
    setPreselectedSiteId(siteId);
    window.scrollTo(0, 0);
  };

  return (
    <div className="app">
      {currentPage === 'home' && <HomePage onNavigate={navigate} />}
      {currentPage === 'suggestion' && (
        <SuggestionPage onNavigate={navigate} preselectedSiteId={preselectedSiteId} />
      )}
      {currentPage === 'work-stop' && (
        <WorkStopPage onNavigate={navigate} preselectedSiteId={preselectedSiteId} />
      )}
      {currentPage === 'admin' && <AdminPage onNavigate={navigate} />}
    </div>
  );
}

export default App;
