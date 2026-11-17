import React, { useState } from 'react';
import { CategoryMeta } from '../types';
import { isAuthenticated } from '../utils/auth';
import {
  addCategory,
  updateCategory,
  deleteCategory,
  moveCategory,
  resetCategories,
  CATEGORY_COLOR_PRESETS,
  CATEGORY_ICON_PRESETS,
  MAX_CATEGORY_NAME,
  MAX_CATEGORIES,
} from '../utils/categoryStorage';
import { countDocumentsByCategory } from '../utils/documentStorage';
import './CategoryManager.css';

interface CategoryManagerProps {
  categories: CategoryMeta[];
  /** 분류 삭제 시 문서를 옮길 후보 목록 */
  onClose: () => void;
}

type Mode = 'list' | 'add' | 'edit';

const CategoryManager: React.FC<CategoryManagerProps> = ({ categories, onClose }) => {
  const [mode, setMode] = useState<Mode>('list');
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const [draft, setDraft] = useState({
    key: '',
    icon: '📎',
    color: '#2563eb',
    desc: '',
  });
  const [error, setError] = useState('');

  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [reassignTo, setReassignTo] = useState('');

  const canManage = isAuthenticated();

  /* ---------------- 폼 ---------------- */
  const startAdd = () => {
    setDraft({ key: '', icon: '📎', color: '#2563eb', desc: '' });
    setEditingKey(null);
    setError('');
    setMode('add');
  };

  const startEdit = (cat: CategoryMeta) => {
    setDraft({ key: cat.key, icon: cat.icon, color: cat.color, desc: cat.desc });
    setEditingKey(cat.key);
    setError('');
    setMode('edit');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const result =
      mode === 'edit' && editingKey
        ? updateCategory(editingKey, {
            key: draft.key,
            icon: draft.icon,
            color: draft.color,
            desc: draft.desc,
          })
        : addCategory({
            key: draft.key,
            icon: draft.icon,
            color: draft.color,
            desc: draft.desc,
          });

    if (!result.ok) {
      setError(result.error || '저장에 실패했습니다.');
      return;
    }
    setMode('list');
    setEditingKey(null);
  };

  /* ---------------- 삭제 ---------------- */
  const startDelete = (cat: CategoryMeta) => {
    setDeletingKey(cat.key);
    setError('');
    const fallback = categories.find(c => c.key === '기타')?.key || categories.find(c => c.key !== cat.key)?.key || '';
    setReassignTo(fallback);
  };

  const confirmDelete = () => {
    if (!deletingKey) return;
    const docCount = countDocumentsByCategory(deletingKey);
    const result = deleteCategory(deletingKey, docCount > 0 ? reassignTo : undefined);
    if (!result.ok) {
      setError(result.error || '삭제에 실패했습니다.');
      return;
    }
    setDeletingKey(null);
    setError('');
  };

  const handleReset = () => {
    if (!confirm('분류 목록을 기본값으로 되돌리시겠습니까?\n직접 추가한 분류는 사라집니다.')) return;
    resetCategories();
    setMode('list');
    setError('');
  };

  /* ---------------- 렌더 ---------------- */
  return (
    <div className="cm-backdrop" onClick={onClose}>
      <div className="cm-panel" onClick={e => e.stopPropagation()}>
        <div className="cm-head">
          <div>
            <h2>문서 분류 관리</h2>
            <p className="cm-sub">
              {categories.length} / {MAX_CATEGORIES}개
            </p>
          </div>
          <button className="cm-close" onClick={onClose} title="닫기">
            ✕
          </button>
        </div>

        {!canManage ? (
          <div className="cm-body">
            <div className="cm-locked">
              <div className="cm-locked-icon">🔒</div>
              <h3>관리자만 이용할 수 있습니다</h3>
              <p>문서 분류를 추가·수정·삭제하려면 관리자로 로그인해주세요.</p>
              <button className="btn btn-secondary" onClick={onClose}>
                확인
              </button>
            </div>
          </div>
        ) : mode === 'list' ? (
          <>
            <div className="cm-body">
              <div className="cm-list">
                {categories.map((cat, index) => {
                  const count = countDocumentsByCategory(cat.key);
                  return (
                    <div key={cat.key} className="cm-item">
                      <span
                        className="cm-item-icon"
                        style={{ background: `${cat.color}1a`, color: cat.color }}
                      >
                        {cat.icon}
                      </span>

                      <div className="cm-item-body">
                        <div className="cm-item-name">
                          {cat.key}
                          <span className="cm-item-count">{count}건</span>
                        </div>
                        {cat.desc && <div className="cm-item-desc">{cat.desc}</div>}
                      </div>

                      <div className="cm-item-actions">
                        <button
                          className="cm-icon-btn"
                          title="위로"
                          onClick={() => moveCategory(cat.key, 'up')}
                          disabled={index === 0}
                        >
                          ↑
                        </button>
                        <button
                          className="cm-icon-btn"
                          title="아래로"
                          onClick={() => moveCategory(cat.key, 'down')}
                          disabled={index === categories.length - 1}
                        >
                          ↓
                        </button>
                        <button className="cm-icon-btn" title="수정" onClick={() => startEdit(cat)}>
                          ✏️
                        </button>
                        <button
                          className="cm-icon-btn cm-icon-danger"
                          title="삭제"
                          onClick={() => startDelete(cat)}
                          disabled={categories.length <= 1}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {error && <div className="cm-error">{error}</div>}
            </div>

            <div className="cm-foot">
              <button className="btn btn-secondary cm-reset" onClick={handleReset}>
                기본값 복원
              </button>
              <div className="cm-foot-right">
                <button className="btn btn-secondary" onClick={onClose}>
                  닫기
                </button>
                <button className="btn btn-primary" onClick={startAdd}>
                  ＋ 분류 추가
                </button>
              </div>
            </div>
          </>
        ) : (
          /* ---------------- 추가 / 수정 폼 ---------------- */
          <form className="cm-body" onSubmit={submit}>
            <div className="cm-form-preview">
              <span
                className="cm-preview-icon"
                style={{ background: `${draft.color}1a`, color: draft.color }}
              >
                {draft.icon}
              </span>
              <div>
                <div className="cm-preview-name">{draft.key || '분류명 미리보기'}</div>
                <div className="cm-preview-desc">{draft.desc || '설명 없음'}</div>
              </div>
            </div>

            <div className="cm-field">
              <label htmlFor="cmName">분류명 *</label>
              <input
                id="cmName"
                type="text"
                value={draft.key}
                onChange={e => setDraft(d => ({ ...d, key: e.target.value }))}
                placeholder="예: 안전보건관리대장, TBM일지, MSDS"
                maxLength={MAX_CATEGORY_NAME}
                autoFocus
              />
              <span className="cm-counter">
                {draft.key.length} / {MAX_CATEGORY_NAME}
              </span>
            </div>

            <div className="cm-field">
              <label>아이콘</label>
              <div className="cm-icon-picker">
                {CATEGORY_ICON_PRESETS.map(icon => (
                  <button
                    key={icon}
                    type="button"
                    className={`cm-icon-option ${draft.icon === icon ? 'active' : ''}`}
                    onClick={() => setDraft(d => ({ ...d, icon }))}
                  >
                    {icon}
                  </button>
                ))}
              </div>
              <input
                type="text"
                className="cm-icon-input"
                value={draft.icon}
                onChange={e => setDraft(d => ({ ...d, icon: e.target.value }))}
                placeholder="직접 입력 (이모지)"
                maxLength={4}
              />
            </div>

            <div className="cm-field">
              <label>색상</label>
              <div className="cm-color-picker">
                {CATEGORY_COLOR_PRESETS.map(color => (
                  <button
                    key={color}
                    type="button"
                    className={`cm-color-option ${draft.color === color ? 'active' : ''}`}
                    style={{ background: color }}
                    onClick={() => setDraft(d => ({ ...d, color }))}
                    title={color}
                  />
                ))}
              </div>
            </div>

            <div className="cm-field">
              <label htmlFor="cmDesc">설명 (선택)</label>
              <input
                id="cmDesc"
                type="text"
                value={draft.desc}
                onChange={e => setDraft(d => ({ ...d, desc: e.target.value }))}
                placeholder="예: 일일·주간·월간 안전점검 결과"
                maxLength={40}
              />
            </div>

            {mode === 'edit' && editingKey && draft.key.trim() !== editingKey && (
              <div className="cm-notice">
                ⚠️ 분류명을 변경하면 이 분류를 사용하는 문서{' '}
                <strong>{countDocumentsByCategory(editingKey)}건</strong>도 함께 새 이름으로 이동합니다.
              </div>
            )}

            {error && <div className="cm-error">{error}</div>}

            <div className="cm-foot cm-foot-form">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setMode('list');
                  setError('');
                }}
              >
                취소
              </button>
              <button type="submit" className="btn btn-primary">
                {mode === 'edit' ? '수정 저장' : '추가하기'}
              </button>
            </div>
          </form>
        )}

        {/* ---------------- 삭제 확인 ---------------- */}
        {deletingKey && (
          <div className="cm-confirm-backdrop" onClick={() => setDeletingKey(null)}>
            <div className="cm-confirm" onClick={e => e.stopPropagation()}>
              <h3>분류 삭제</h3>
              <p>
                <strong>“{deletingKey}”</strong> 분류를 삭제하시겠습니까?
              </p>

              {countDocumentsByCategory(deletingKey) > 0 ? (
                <>
                  <div className="cm-confirm-warn">
                    이 분류의 문서 <strong>{countDocumentsByCategory(deletingKey)}건</strong>이 있습니다.
                    아래 분류로 이동한 뒤 삭제됩니다.
                  </div>
                  <div className="cm-field">
                    <label htmlFor="cmReassign">이동할 분류</label>
                    <select
                      id="cmReassign"
                      value={reassignTo}
                      onChange={e => setReassignTo(e.target.value)}
                    >
                      {categories
                        .filter(c => c.key !== deletingKey)
                        .map(c => (
                          <option key={c.key} value={c.key}>
                            {c.icon} {c.key}
                          </option>
                        ))}
                    </select>
                  </div>
                </>
              ) : (
                <p className="cm-confirm-ok">이 분류를 사용하는 문서가 없습니다.</p>
              )}

              {error && <div className="cm-error">{error}</div>}

              <div className="cm-confirm-actions">
                <button className="btn btn-secondary" onClick={() => setDeletingKey(null)}>
                  취소
                </button>
                <button className="btn btn-danger" onClick={confirmDelete}>
                  삭제
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CategoryManager;
