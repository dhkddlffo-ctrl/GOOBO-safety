import React, { useState } from 'react';
import { HqCategory } from '../types';
import { addHqCategory, deleteHqCategory, getHqPosts, updateHqCategory } from '../utils/hqStorage';

interface HqCategoryManagerProps {
  categories: HqCategory[];
  onClose: () => void;
}

const COLOR_PRESETS = [
  '#dc2626',
  '#1d4ed8',
  '#0891b2',
  '#7c3aed',
  '#16a34a',
  '#ea580c',
  '#6b7280',
  '#db2777',
  '#0d9488',
  '#f59e0b',
];

const ICON_PRESETS = ['📢', '📕', '📋', '⚖️', '🎓', '🔧', '📎', '📘', '📗', '🗂️', '✅', '🛠️'];

type Mode = 'list' | 'add' | 'edit';

const HqCategoryManager: React.FC<HqCategoryManagerProps> = ({ categories, onClose }) => {
  const [mode, setMode] = useState<Mode>('list');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState({ key: '', icon: '📎', color: '#6b7280', desc: '' });
  const [error, setError] = useState('');

  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [reassignTo, setReassignTo] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const postCount = (key: string) => getHqPosts().filter(p => p.category === key).length;

  const startAdd = () => {
    setMode('add');
    setEditingKey(null);
    setDraft({ key: '', icon: '📎', color: '#6b7280', desc: '' });
    setError('');
  };

  const startEdit = (category: HqCategory) => {
    setMode('edit');
    setEditingKey(category.key);
    setDraft({
      key: category.key,
      icon: category.icon,
      color: category.color,
      desc: category.desc || '',
    });
    setError('');
  };

  const saveDraft = () => {
    const result =
      mode === 'edit' && editingKey ? updateHqCategory(editingKey, draft) : addHqCategory(draft);

    if (!result.ok) {
      setError(result.error || '저장하지 못했습니다.');
      return;
    }
    setMode('list');
    setEditingKey(null);
    setError('');
  };

  const startDelete = (key: string) => {
    setDeletingKey(key);
    setReassignTo('');
    setDeleteError('');
  };

  const confirmDelete = () => {
    if (!deletingKey) return;
    const result = deleteHqCategory(deletingKey, reassignTo || undefined);
    if (!result.ok) {
      setDeleteError(result.error || '삭제하지 못했습니다.');
      return;
    }
    setDeletingKey(null);
    setReassignTo('');
    setDeleteError('');
  };

  return (
    <div className="hq-modal-backdrop" role="presentation">
      <div className="hq-modal hq-modal-narrow" role="dialog" aria-modal="true">
        <div className="hq-modal-head">
          <h2>본사 게시판 분류 관리</h2>
          <button type="button" className="hq-modal-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="hq-modal-body">
          {mode === 'list' && (
            <>
              <div className="hq-cat-manage-head">
                <span className="hq-field-label">분류 {categories.length}개</span>
                <button
                  type="button"
                  className="hq-btn hq-btn-sm hq-btn-primary"
                  onClick={startAdd}
                >
                  ＋ 분류 추가
                </button>
              </div>

              <ul className="hq-cat-manage__list">
                {categories.map(category => {
                  const count = postCount(category.key);
                  return (
                    <li key={category.key} className="hq-cat-manage__item">
                      <span
                        className="hq-cat-manage__icon"
                        style={{ background: `${category.color}18`, color: category.color }}
                      >
                        {category.icon}
                      </span>
                      <div className="hq-cat-manage__info">
                        <span className="hq-cat-manage__name">{category.key}</span>
                        <span className="hq-cat-manage__desc">
                          {category.desc || '설명 없음'} · 글 {count}건
                        </span>
                      </div>
                      <div className="hq-cat-manage__actions">
                        <button
                          type="button"
                          className="hq-mini-btn"
                          onClick={() => startEdit(category)}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="hq-mini-btn hq-mini-danger"
                          onClick={() => startDelete(category.key)}
                          disabled={categories.length <= 1}
                        >
                          삭제
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {(mode === 'add' || mode === 'edit') && (
            <>
              {error && <div className="hq-form-error">{error}</div>}

              <label className="hq-field">
                <span className="hq-field-label">분류명 *</span>
                <input
                  className="hq-input"
                  value={draft.key}
                  onChange={e => setDraft(d => ({ ...d, key: e.target.value }))}
                  placeholder="예: 안전보건교육 자료"
                  maxLength={20}
                />
              </label>

              <div className="hq-field">
                <span className="hq-field-label">아이콘</span>
                <div className="hq-preset-row">
                  {ICON_PRESETS.map(icon => (
                    <button
                      key={icon}
                      type="button"
                      className={`hq-preset-btn${draft.icon === icon ? ' is-on' : ''}`}
                      onClick={() => setDraft(d => ({ ...d, icon }))}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              <div className="hq-field">
                <span className="hq-field-label">색상</span>
                <div className="hq-preset-row">
                  {COLOR_PRESETS.map(color => (
                    <button
                      key={color}
                      type="button"
                      className={`hq-color-btn${draft.color === color ? ' is-on' : ''}`}
                      style={{ background: color }}
                      onClick={() => setDraft(d => ({ ...d, color }))}
                      aria-label={color}
                    />
                  ))}
                </div>
              </div>

              <label className="hq-field">
                <span className="hq-field-label">설명</span>
                <input
                  className="hq-input"
                  value={draft.desc}
                  onChange={e => setDraft(d => ({ ...d, desc: e.target.value }))}
                  placeholder="예: 방침서 · 매뉴얼 · 절차서"
                />
              </label>

              <div className="hq-modal-actions hq-modal-actions-inline">
                <button type="button" className="hq-btn" onClick={() => setMode('list')}>
                  ← 목록
                </button>
                <button type="button" className="hq-btn hq-btn-primary" onClick={saveDraft}>
                  {mode === 'edit' ? '수정 저장' : '추가'}
                </button>
              </div>
            </>
          )}

          {deletingKey && (
            <div className="hq-confirm">
              <p className="hq-confirm-title">“{deletingKey}” 분류를 삭제할까요?</p>
              {postCount(deletingKey) > 0 ? (
                <>
                  <p className="hq-confirm-text">
                    이 분류의 글 <b>{postCount(deletingKey)}건</b>을 옮길 분류를 선택해주세요.
                  </p>
                  <select
                    className="hq-select"
                    value={reassignTo}
                    onChange={e => setReassignTo(e.target.value)}
                  >
                    <option value="">— 이동할 분류 선택 —</option>
                    {categories
                      .filter(c => c.key !== deletingKey)
                      .map(c => (
                        <option key={c.key} value={c.key}>
                          {c.icon} {c.key}
                        </option>
                      ))}
                  </select>
                </>
              ) : (
                <p className="hq-confirm-text">이 분류에는 글이 없습니다.</p>
              )}
              {deleteError && <div className="hq-form-error">{deleteError}</div>}
              <div className="hq-modal-actions hq-modal-actions-inline">
                <button
                  type="button"
                  className="hq-btn"
                  onClick={() => {
                    setDeletingKey(null);
                    setDeleteError('');
                  }}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="hq-btn hq-btn-danger"
                  onClick={confirmDelete}
                  disabled={postCount(deletingKey) > 0 && !reassignTo}
                >
                  삭제
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HqCategoryManager;
