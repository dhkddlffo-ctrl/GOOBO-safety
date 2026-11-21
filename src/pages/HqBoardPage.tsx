import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { HqPost, Site } from '../types';
import { isAuthenticated } from '../utils/auth';
import { getSites } from '../utils/storage';
import { useHqCategories } from '../hooks/useHqCategories';
import {
  countNewHqPosts,
  deleteHqPost,
  filterHqPosts,
  formatHqDate,
  getActiveHqPosts,
  getHqAcks,
  getHqFavorites,
  getHqPost,
  getHqSeries,
  getRecentHqPosts,
  HQ_CHANGED_EVENT,
  HQ_SORT_LABELS,
  HqSortKey,
  increaseHqViews,
  markHqSeen,
  resolveHqCategoryMeta,
  toggleHqFavorite,
} from '../utils/hqStorage';
import HqPostEditor from '../components/HqPostEditor';
import HqPostViewer from '../components/HqPostViewer';
import HqCategoryManager from '../components/HqCategoryManager';
import './HqBoardPage.css';

interface HqBoardPageProps {
  onNavigate: (page: string, siteId?: number) => void;
}

type ViewMode = 'all' | 'favorite' | 'recent' | 'ack';

const HqBoardPage: React.FC<HqBoardPageProps> = ({ onNavigate }) => {
  const categories = useHqCategories();
  const [posts, setPosts] = useState<HqPost[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [canManage, setCanManage] = useState(false);

  const [activeCategory, setActiveCategory] = useState('전체');
  const [keyword, setKeyword] = useState('');
  const [sort, setSort] = useState<HqSortKey>('latest');
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [favorites, setFavorites] = useState<string[]>([]);

  /* 글 보기 — 목록을 덮어쓰는 전체화면 글 */
  const [viewPost, setViewPost] = useState<HqPost | null>(null);
  /* 등록/수정 모달 */
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<HqPost | null>(null);
  /* 분류 관리 모달 */
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  /* 삭제 확인 */
  const [deleteTarget, setDeleteTarget] = useState<HqPost | null>(null);

  const refresh = useCallback(() => {
    setPosts(getActiveHqPosts());
    setFavorites(getHqFavorites());
  }, []);

  useEffect(() => {
    setCanManage(isAuthenticated());
    setSites(getSites());
    refresh();
    window.addEventListener(HQ_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(HQ_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [refresh]);

  /* 목록을 실제로 본 뒤에 '새 소식' 을 읽음 처리 */
  useEffect(() => {
    const timer = window.setTimeout(() => markHqSeen(), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  const ackPostIds = useMemo(() => {
    const ids = new Set(getHqAcks().map(a => a.postId));
    return ids;
  }, [posts]);

  const scoped = useMemo(() => {
    switch (viewMode) {
      case 'favorite':
        return posts.filter(p => favorites.includes(p.id));
      case 'recent':
        return getRecentHqPosts(20);
      case 'ack':
        return posts.filter(p => p.requireAck && !ackPostIds.has(p.id));
      default:
        return posts;
    }
  }, [posts, viewMode, favorites, ackPostIds]);

  const visible = useMemo(
    () => filterHqPosts(scoped, { category: activeCategory, keyword, sort }),
    [scoped, activeCategory, keyword, sort],
  );

  /* 고정 글도 표에 그대로 남깁니다.
     filterHqPosts 가 이미 맨 위로 정렬해 주므로, 표에서는 📌 표시로만 구분합니다.
     (예전에는 표에서 빼고 띠로만 보여줘서, 고정 글 1건만 있으면 "자료 없음" 으로 보였습니다) */
  const rowPosts = visible;

  const pinnedPosts = useMemo(
    () => (viewMode === 'all' ? visible.filter(p => p.pinned) : []),
    [visible, viewMode],
  );

  const countByCategory = (key: string) =>
    scoped.filter(p => key === '전체' || p.category === key).length;

  const newCount = useMemo(() => countNewHqPosts(), [posts]);

  /* ------------------------------ 동작 ------------------------------ */

  const openPost = (post: HqPost) => {
    increaseHqViews(post.id);
    const fresh = getHqPost(post.id) || post;
    setViewPost(fresh);
    setPosts(getActiveHqPosts());
  };

  const closeViewer = () => setViewPost(null);

  const startCreate = () => {
    setEditingPost(null);
    setEditorOpen(true);
  };

  const startEdit = (post: HqPost) => {
    setEditingPost(post);
    setViewPost(null);
    setEditorOpen(true);
  };

  const handleSaved = (post: HqPost) => {
    setEditorOpen(false);
    setEditingPost(null);
    refresh();
    setViewPost(getHqPost(post.id) || post);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteHqPost(deleteTarget.id);
    setDeleteTarget(null);
    setViewPost(null);
    refresh();
  };

  const handleFavoriteRow = (post: HqPost, event: React.MouseEvent) => {
    event.stopPropagation();
    toggleHqFavorite(post.id);
    setFavorites(getHqFavorites());
  };

  const openSeries = (post: HqPost) => {
    const fresh = getHqPost(post.id) || post;
    setViewPost(fresh);
  };

  /* ------------------------------ 글 보기 ------------------------------ */

  if (viewPost) {
    const series = getHqSeries(viewPost.seriesId);
    return (
      <div className="hq-page">
        <div className="container">
          <HqPostViewer
            post={viewPost}
            series={series}
            sites={sites}
            canManage={canManage}
            onClose={closeViewer}
            onEdit={startEdit}
            onDelete={post => setDeleteTarget(post)}
            onOpenSeries={openSeries}
            onRefresh={refresh}
          />
        </div>
        {deleteTarget && (
          <div className="hq-modal-backdrop" role="presentation">
            <div className="hq-modal hq-modal-narrow" role="dialog" aria-modal="true">
              <div className="hq-modal-head">
                <h2>자료 삭제</h2>
              </div>
              <div className="hq-modal-body">
                <p className="hq-confirm-title">“{deleteTarget.title}” 을(를) 삭제할까요?</p>
                <p className="hq-confirm-text">
                  첨부파일과 필독 확인 기록도 함께 지워지며 되돌릴 수 없습니다.
                </p>
              </div>
              <div className="hq-modal-actions">
                <button type="button" className="hq-btn" onClick={() => setDeleteTarget(null)}>
                  취소
                </button>
                <button
                  type="button"
                  className="hq-btn hq-btn-danger"
                  onClick={() => void confirmDelete()}
                >
                  삭제
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ------------------------------ 목록 ------------------------------ */

  return (
    <div className="hq-page">
      <div className="container">
        <div className="page-header">
          <button className="back-button" onClick={() => onNavigate('home')}>
            ← 뒤로가기
          </button>
          <h1>본사 게시판</h1>
          <p>공지사항 · 안전보건경영매뉴얼 · 각종 양식을 본사에서 배포합니다.</p>
        </div>

        {/* 요약 */}
        <div className="hq-stats">
          <div className="hq-stat">
            <span className="hq-stat-icon">📚</span>
            <div>
              <div className="hq-stat-value">{posts.length}</div>
              <div className="hq-stat-label">전체 자료</div>
            </div>
          </div>
          <div className="hq-stat">
            <span className="hq-stat-icon">🔔</span>
            <div>
              <div className="hq-stat-value">{posts.filter(p => p.requireAck).length}</div>
              <div className="hq-stat-label">필독 자료</div>
            </div>
          </div>
          <div className="hq-stat">
            <span className="hq-stat-icon">📌</span>
            <div>
              <div className="hq-stat-value">{posts.filter(p => p.pinned).length}</div>
              <div className="hq-stat-label">고정 자료</div>
            </div>
          </div>
          <div className="hq-stat">
            <span className="hq-stat-icon">🆕</span>
            <div>
              <div className="hq-stat-value">{newCount}</div>
              <div className="hq-stat-label">새 소식</div>
            </div>
          </div>
        </div>

        {/* 도구 모음 */}
        <div className="hq-toolbar">
          <div className="hq-toolbar-left">
            <div className="hq-search">
              <span className="hq-search-icon">🔍</span>
              <input
                className="hq-search-input"
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                placeholder="제목 · 본문 · 태그 · 첨부파일명 검색"
              />
              {keyword && (
                <button type="button" className="hq-search-clear" onClick={() => setKeyword('')}>
                  ✕
                </button>
              )}
            </div>
            <select
              className="hq-select"
              value={sort}
              onChange={e => setSort(e.target.value as HqSortKey)}
            >
              {(Object.keys(HQ_SORT_LABELS) as HqSortKey[]).map(key => (
                <option key={key} value={key}>
                  {HQ_SORT_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
          <div className="hq-toolbar-right">
            <button
              type="button"
              className={`hq-tab${viewMode === 'all' ? ' is-on' : ''}`}
              onClick={() => setViewMode('all')}
            >
              전체
            </button>
            <button
              type="button"
              className={`hq-tab${viewMode === 'ack' ? ' is-on' : ''}`}
              onClick={() => setViewMode('ack')}
            >
              🔔 필독
            </button>
            <button
              type="button"
              className={`hq-tab${viewMode === 'favorite' ? ' is-on' : ''}`}
              onClick={() => setViewMode('favorite')}
            >
              ★ 즐겨찾기
            </button>
            <button
              type="button"
              className={`hq-tab${viewMode === 'recent' ? ' is-on' : ''}`}
              onClick={() => setViewMode('recent')}
            >
              🕘 최근 본
            </button>
            {canManage && (
              <>
                <button
                  type="button"
                  className="hq-btn hq-btn-sm"
                  onClick={() => setCategoryManagerOpen(true)}
                >
                  분류 관리
                </button>
                <button type="button" className="hq-btn hq-btn-primary" onClick={startCreate}>
                  ＋ 자료 등록
                </button>
              </>
            )}
          </div>
        </div>

        {/* 분류 칩 */}
        <div className="hq-chips">
          <button
            type="button"
            className={`hq-chip${activeCategory === '전체' ? ' is-on' : ''}`}
            onClick={() => setActiveCategory('전체')}
          >
            전체 <span className="hq-chip-count">{countByCategory('전체')}</span>
          </button>
          {categories.map(category => (
            <button
              key={category.key}
              type="button"
              className={`hq-chip${activeCategory === category.key ? ' is-on' : ''}`}
              style={
                activeCategory === category.key
                  ? {
                      background: `${category.color}14`,
                      color: category.color,
                      borderColor: category.color,
                    }
                  : undefined
              }
              onClick={() => setActiveCategory(category.key)}
            >
              {category.icon} {category.key}{' '}
              <span className="hq-chip-count">{countByCategory(category.key)}</span>
            </button>
          ))}
        </div>

        {/* 고정 글 */}
        {pinnedPosts.length > 0 && (
          <div className="hq-pinned-strip">
            {pinnedPosts.map(post => {
              const cat = resolveHqCategoryMeta(post.category);
              return (
                <button
                  key={post.id}
                  type="button"
                  className="hq-pinned-card"
                  onClick={() => openPost(post)}
                >
                  <span className="hq-pinned-label">📌 고정</span>
                  <span className="hq-pinned-title">{post.title}</span>
                  <span className="hq-pinned-cat" style={{ color: cat.color }}>
                    {cat.icon} {post.category}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* 표 목록 */}
        <div className="hq-table-wrap">
          <table className="hq-table">
            <colgroup>
              <col style={{ width: '6%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '37%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '8%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>번호</th>
                <th>분류</th>
                <th>제목</th>
                <th>첨부</th>
                <th>버전</th>
                <th>조회</th>
                <th>등록일</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {rowPosts.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="hq-empty">
                      <span className="hq-empty-icon">📭</span>
                      <p className="hq-empty-title">
                        {keyword
                          ? '검색 결과가 없습니다.'
                          : viewMode === 'favorite'
                            ? '즐겨찾기한 자료가 없습니다.'
                            : viewMode === 'recent'
                              ? '최근 본 자료가 없습니다.'
                              : viewMode === 'ack'
                                ? '미확인 필독 자료가 없습니다.'
                                : '등록된 자료가 없습니다.'}
                      </p>
                      {canManage && viewMode === 'all' && !keyword && (
                        <button
                          type="button"
                          className="hq-btn hq-btn-primary"
                          onClick={startCreate}
                        >
                          첫 자료 등록하기
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                rowPosts.map((post, index) => {
                  const cat = resolveHqCategoryMeta(post.category);
                  const fav = favorites.includes(post.id);
                  const series = getHqSeries(post.seriesId);
                  return (
                    <tr
                      key={post.id}
                      className={`hq-tr${post.pinned ? ' is-pinned' : ''}`}
                      onClick={() => openPost(post)}
                    >
                      <td className="hq-c-no">
                        {viewMode === 'all' ? rowPosts.length - index : '-'}
                      </td>
                      <td>
                        <div className="hq-cell hq-cell-cat">
                          <span
                            className="hq-cat-badge"
                            style={{ background: `${cat.color}14`, color: cat.color }}
                          >
                            {cat.icon} {post.category}
                          </span>
                          {post.subcategory && (
                            <span className="hq-sub-badge">{post.subcategory}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="hq-cell hq-cell-title">
                          {post.pinned && (
                            <span className="hq-mark-pin" title="상단 고정">
                              📌
                            </span>
                          )}
                          {post.important && <span className="hq-mark-important">❗</span>}
                          {post.requireAck && (
                            <span className="hq-mark-ack" title="필독">
                              🔔
                            </span>
                          )}
                          <button
                            type="button"
                            className="hq-title-btn"
                            onClick={e => {
                              e.stopPropagation();
                              openPost(post);
                            }}
                          >
                            {post.title}
                          </button>
                          {series.length > 1 && (
                            <span className="hq-rev-count">개정 {series.length}판</span>
                          )}
                          {post.tags && post.tags.length > 0 && (
                            <span className="hq-row-tags">
                              {post.tags.slice(0, 3).map(tag => (
                                <span key={tag} className="hq-row-tag">
                                  #{tag}
                                </span>
                              ))}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="hq-c-attach">
                        {post.attachments.length > 0 ? `📎 ${post.attachments.length}` : '-'}
                      </td>
                      <td className="hq-c-ver">
                        <span className="hq-ver-badge">{post.version}</span>
                      </td>
                      <td className="hq-c-views">{post.views}</td>
                      <td className="hq-c-date">{formatHqDate(post.createdAt)}</td>
                      <td>
                        <div className="hq-cell hq-cell-actions">
                          <button
                            type="button"
                            className={`hq-star-btn${fav ? ' is-on' : ''}`}
                            onClick={e => handleFavoriteRow(post, e)}
                            title={fav ? '즐겨찾기 해제' : '즐겨찾기'}
                          >
                            {fav ? '★' : '☆'}
                          </button>
                          {canManage && (
                            <>
                              <button
                                type="button"
                                className="hq-mini-btn"
                                onClick={e => {
                                  e.stopPropagation();
                                  startEdit(post);
                                }}
                              >
                                수정
                              </button>
                              <button
                                type="button"
                                className="hq-mini-btn hq-mini-danger"
                                onClick={e => {
                                  e.stopPropagation();
                                  setDeleteTarget(post);
                                }}
                              >
                                삭제
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editorOpen && (
        <HqPostEditor
          categories={categories}
          editing={editingPost}
          series={editingPost ? getHqSeries(editingPost.seriesId) : []}
          author="본사 안전팀"
          onClose={() => {
            setEditorOpen(false);
            setEditingPost(null);
          }}
          onSaved={handleSaved}
        />
      )}

      {categoryManagerOpen && (
        <HqCategoryManager categories={categories} onClose={() => setCategoryManagerOpen(false)} />
      )}

      {deleteTarget && !viewPost && (
        <div className="hq-modal-backdrop" role="presentation">
          <div className="hq-modal hq-modal-narrow" role="dialog" aria-modal="true">
            <div className="hq-modal-head">
              <h2>자료 삭제</h2>
            </div>
            <div className="hq-modal-body">
              <p className="hq-confirm-title">“{deleteTarget.title}” 을(를) 삭제할까요?</p>
              <p className="hq-confirm-text">
                첨부파일과 필독 확인 기록도 함께 지워지며 되돌릴 수 없습니다.
              </p>
            </div>
            <div className="hq-modal-actions">
              <button type="button" className="hq-btn" onClick={() => setDeleteTarget(null)}>
                취소
              </button>
              <button
                type="button"
                className="hq-btn hq-btn-danger"
                onClick={() => void confirmDelete()}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HqBoardPage;
