import { useState, useEffect } from 'react';
import HomePage from './pages/HomePage';
import SuggestionPage from './pages/SuggestionPage';
import WorkStopPage from './pages/WorkStopPage';
import AccidentCasePage from './pages/AccidentCasePage';
import SiteDocumentPage from './pages/SiteDocumentPage';
import SiteDetailPage from './pages/SiteDetailPage';
import AdminPage from './pages/AdminPage';
import LoginModal from './components/LoginModal';
import { isAuthenticated, logout } from './utils/auth';
import './App.css';

type Page =
  | 'home'
  | 'suggestion'
  | 'work-stop'
  | 'accident-case'
  | 'documents'
  | 'site-detail'
  | 'admin';

/** URL 별칭: site-detail 은 짧게 'site' 로 노출 (#/site/3) */
const PAGE_TO_SLUG: Record<Page, string> = {
  home: '',
  suggestion: 'suggestion',
  'work-stop': 'work-stop',
  'accident-case': 'accident-case',
  documents: 'documents',
  'site-detail': 'site',
  admin: 'admin',
};

const SLUG_TO_PAGE: Record<string, Page> = {
  suggestion: 'suggestion',
  'work-stop': 'work-stop',
  'accident-case': 'accident-case',
  documents: 'documents',
  site: 'site-detail',
  'site-detail': 'site-detail',
  admin: 'admin',
};

/** 해시(#/site/3) → 페이지/현장ID 해석 */
const parseHash = (hash: string): { page: Page; siteId?: number } | null => {
  const clean = hash.replace(/^#\/?/, '');
  if (!clean) return { page: 'home' };

  const [slug, param] = clean.split('/');
  const page = SLUG_TO_PAGE[slug];
  if (!page) return null;

  const siteId = param && !Number.isNaN(Number(param)) ? Number(param) : undefined;
  return { page, siteId };
};

/** 페이지/현장ID → 해시 문자열 */
const buildHash = (page: Page, siteId?: number): string => {
  const slug = PAGE_TO_SLUG[page];
  if (!slug) return '#/';
  if (siteId) return `#/${slug}/${siteId}`;
  return `#/${slug}`;
};

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [preselectedSiteId, setPreselectedSiteId] = useState<number | undefined>();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    setIsLoggedIn(isAuthenticated());

    // 최초 진입 시 해시 복원 (현장별 페이지 북마크/공유 지원)
    const initial = parseHash(window.location.hash);
    if (initial) {
      setCurrentPage(initial.page);
      setPreselectedSiteId(initial.siteId);
    }

    // 브라우저 뒤로가기/앞으로가기 대응
    const onHashChange = () => {
      const parsed = parseHash(window.location.hash);
      if (parsed) {
        setCurrentPage(parsed.page);
        setPreselectedSiteId(parsed.siteId);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = (page: string, siteId?: number) => {
    if (page === 'admin' && !isLoggedIn) {
      setShowLoginModal(true);
      return;
    }
    setCurrentPage(page as Page);
    setPreselectedSiteId(siteId);

    const nextHash = buildHash(page as Page, siteId);
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }

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
        {currentPage === 'documents' && (
          <SiteDocumentPage onNavigate={navigate} preselectedSiteId={preselectedSiteId} />
        )}
        {currentPage === 'site-detail' && (
          <SiteDetailPage onNavigate={navigate} siteId={preselectedSiteId} />
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
