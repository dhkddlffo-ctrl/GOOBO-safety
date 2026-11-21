import { useState, useEffect } from 'react';
import HomePage from './pages/HomePage';
import SuggestionPage from './pages/SuggestionPage';
import WorkStopPage from './pages/WorkStopPage';
import AccidentCasePage from './pages/AccidentCasePage';
import SiteDocumentPage from './pages/SiteDocumentPage';
import SiteDetailPage from './pages/SiteDetailPage';
import HqBoardPage from './pages/HqBoardPage';
import AdminPage from './pages/AdminPage';
import LoginModal from './components/LoginModal';
import Icon from './components/Icon';
import { isAuthenticated, logout } from './utils/auth';
import { countNewHqPosts, HQ_CHANGED_EVENT, markHqSeen } from './utils/hqStorage';
import './App.css';

type Page =
  | 'home'
  | 'hq'
  | 'suggestion'
  | 'work-stop'
  | 'accident-case'
  | 'documents'
  | 'site-detail'
  | 'admin';

/** URL 별칭: site-detail 은 짧게 'site' 로 노출 (#/site/3) */
const PAGE_TO_SLUG: Record<Page, string> = {
  home: '',
  hq: 'hq',
  suggestion: 'suggestion',
  'work-stop': 'work-stop',
  'accident-case': 'accident-case',
  documents: 'documents',
  'site-detail': 'site',
  admin: 'admin',
};

const SLUG_TO_PAGE: Record<string, Page> = {
  hq: 'hq',
  suggestion: 'suggestion',
  'work-stop': 'work-stop',
  'accident-case': 'accident-case',
  documents: 'documents',
  site: 'site-detail',
  'site-detail': 'site-detail',
  admin: 'admin',
};

/** 해시(#/site/3/documents) → 페이지/현장ID/탭 해석 */
const parseHash = (hash: string): { page: Page; siteId?: number; tab?: string } | null => {
  const clean = hash.replace(/^#\/?/, '');
  if (!clean) return { page: 'home' };

  const [slug, param, tab] = clean.split('/');
  const page = SLUG_TO_PAGE[slug];
  if (!page) return null;

  const siteId = param && !Number.isNaN(Number(param)) ? Number(param) : undefined;
  return { page, siteId, tab };
};

/** 페이지/현장ID → 해시 문자열 */
const buildHash = (page: Page, siteId?: number, tab?: string): string => {
  const slug = PAGE_TO_SLUG[page];
  if (!slug) return '#/';
  if (siteId && tab) return `#/${slug}/${siteId}/${tab}`;
  if (siteId) return `#/${slug}/${siteId}`;
  return `#/${slug}`;
};

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [preselectedSiteId, setPreselectedSiteId] = useState<number | undefined>();
  const [preselectedTab, setPreselectedTab] = useState<string | undefined>();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [newHqCount, setNewHqCount] = useState(0);

  useEffect(() => {
    setIsLoggedIn(isAuthenticated());

    // 본사 게시판 새 소식 배지
    const syncBadge = () => setNewHqCount(countNewHqPosts());
    syncBadge();
    window.addEventListener(HQ_CHANGED_EVENT, syncBadge);
    return () => window.removeEventListener(HQ_CHANGED_EVENT, syncBadge);
  }, []);

  useEffect(() => {
    // 최초 진입 시 해시 복원 (현장별 페이지/탭 북마크·공유 지원)
    const initial = parseHash(window.location.hash);
    if (initial) {
      setCurrentPage(initial.page);
      setPreselectedSiteId(initial.siteId);
      setPreselectedTab(initial.tab);
    }

    // 브라우저 뒤로가기/앞으로가기 대응
    const onHashChange = () => {
      const parsed = parseHash(window.location.hash);
      if (parsed) {
        setCurrentPage(parsed.page);
        setPreselectedSiteId(parsed.siteId);
        setPreselectedTab(parsed.tab);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  /* 본사 게시판을 열면 새 소식 배지를 지웁니다. */
  useEffect(() => {
    if (currentPage !== 'hq') return;
    const timer = window.setTimeout(() => {
      markHqSeen();
      setNewHqCount(countNewHqPosts());
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [currentPage]);

  const navigate = (page: string, siteId?: number, tab?: string) => {
    if (page === 'admin' && !isLoggedIn) {
      setShowLoginModal(true);
      return;
    }
    setCurrentPage(page as Page);
    setPreselectedSiteId(siteId);
    setPreselectedTab(tab);

    const nextHash = buildHash(page as Page, siteId, tab);
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
          <nav className="header-nav">
            <button
              className={`nav-link${currentPage === 'hq' ? ' is-active' : ''}`}
              onClick={() => navigate('hq')}
            >
              <Icon name="megaphone" size={15} />
              본사 게시판
              {newHqCount > 0 && <span className="nav-badge">{newHqCount}</span>}
            </button>
            <button
              className={`nav-link${currentPage === 'documents' ? ' is-active' : ''}`}
              onClick={() => navigate('documents')}
            >
              <Icon name="folder" size={15} />
              현장문서
            </button>
          </nav>
          <div className="auth-section">
            {isLoggedIn ? (
              <div className="user-menu">
                <span className="admin-badge">
                  <Icon name="shield" size={13} />
                  관리자
                </span>
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
        {currentPage === 'hq' && <HqBoardPage onNavigate={navigate} />}
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
          <SiteDetailPage
            onNavigate={navigate}
            siteId={preselectedSiteId}
            initialTab={preselectedTab}
          />
        )}
        {currentPage === 'admin' && <AdminPage onNavigate={navigate} isLoggedIn={isLoggedIn} />}
      </main>

      {/* Login Modal */}
      {showLoginModal && (
        <LoginModal onClose={() => setShowLoginModal(false)} onLoginSuccess={handleLoginSuccess} />
      )}
    </div>
  );
}

export default App;
