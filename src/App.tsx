import React, { useState, useEffect } from 'react';
import HomePage from './pages/HomePage';
import SuggestionPage from './pages/SuggestionPage';
import WorkStopPage from './pages/WorkStopPage';
import AccidentCasePage from './pages/AccidentCasePage';
import AdminPage from './pages/AdminPage';
import LoginModal from './components/LoginModal';
import { isAuthenticated, logout } from './utils/auth';
import './App.css';

type Page = 'home' | 'suggestion' | 'work-stop' | 'accident-case' | 'admin';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [preselectedSiteId, setPreselectedSiteId] = useState<number | undefined>();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    setIsLoggedIn(isAuthenticated());
  }, []);

  const navigate = (page: string, siteId?: number) => {
    if (page === 'admin' && !isLoggedIn) {
      setShowLoginModal(true);
      return;
    }
    setCurrentPage(page as Page);
    setPreselectedSiteId(siteId);
    window.scrollTo(0, 0);
  };

  const handleLoginSuccess = () => {
    setIsLoggedIn(true);
    setCurrentPage('admin');
  };

  const handleLogout = () => {
    logout();
    setIsLoggedIn(false);
    setCurrentPage('home');
  };

  return (
    <div className="app">
      {/* Header with Login/Logout */}
      <header className="app-header">
        <div className="container header-content">
          <div className="logo" onClick={() => navigate('home')}>
            구보공영(주)
          </div>
          <div className="auth-section">
            {isLoggedIn ? (
              <div className="user-menu">
                <span className="admin-badge">👤 관리자</span>
                <button className="btn-logout" onClick={handleLogout}>
                  로그아웃
                </button>
              </div>
            ) : (
              <button className="btn-login" onClick={() => setShowLoginModal(true)}>
                관리자 로그인
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="app-main">
        {currentPage === 'home' && <HomePage onNavigate={navigate} />}
        {currentPage === 'suggestion' && (
          <SuggestionPage onNavigate={navigate} preselectedSiteId={preselectedSiteId} />
        )}
        {currentPage === 'work-stop' && (
          <WorkStopPage onNavigate={navigate} preselectedSiteId={preselectedSiteId} />
        )}
        {currentPage === 'accident-case' && (
          <AccidentCasePage onNavigate={navigate} preselectedSiteId={preselectedSiteId} />
        )}
        {currentPage === 'admin' && <AdminPage onNavigate={navigate} isLoggedIn={isLoggedIn} />}
      </main>

      {/* Login Modal */}
      {showLoginModal && (
        <LoginModal
          onClose={() => setShowLoginModal(false)}
          onLoginSuccess={handleLoginSuccess}
        />
      )}
    </div>
  );
}

export default App;
