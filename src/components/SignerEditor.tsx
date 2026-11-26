import React from 'react';
import { AccidentSigner } from '../types';
import { DEFAULT_SIGNER_ROLES } from '../utils/accidentReport';
import './SignerEditor.css';

interface SignerEditorProps {
  /** 서명란 목록 */
  value: AccidentSigner[];
  /** 목록 변경 시 호출 */
  onChange: (next: AccidentSigner[]) => void;
}

const createId = (): string => `signer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** 빠른 추가 후보 — 기본 4개 + 자주 쓰는 직책 */
const QUICK_ROLE_CANDIDATES = [
  ...DEFAULT_SIGNER_ROLES,
  '현장소장',
  '안전보건총괄책임자',
  '관리감독자',
  '안전담당자',
  '감리원',
  '시공사 담당',
];

/**
 * 서명란 편집기
 *
 * 사고원인 및 대책 보고서(FWP-006)의 서명란을 직접 추가·삭제합니다.
 * 행을 추가하면 직책과 성명을 입력할 수 있고, 인쇄 시 2열로 배치됩니다.
 */
const SignerEditor: React.FC<SignerEditorProps> = ({ value, onChange }) => {
  const update = (id: string, patch: Partial<AccidentSigner>) => {
    onChange(value.map(s => (s.id === id ? { ...s, ...patch } : s)));
  };

  const handleAdd = () => {
    onChange([...value, { id: createId(), role: '', name: '' }]);
  };

  const handleRemove = (id: string) => {
    const target = value.find(s => s.id === id);
    const label = target?.role?.trim() || target?.name?.trim() || '이 서명란';
    if (!window.confirm(`'${label}' 서명란을 삭제하시겠습니까?`)) return;
    onChange(value.filter(s => s.id !== id));
  };

  const handleMove = (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= value.length) return;
    const copy = [...value];
    [copy[index], copy[next]] = [copy[next], copy[index]];
    onChange(copy);
  };

  /** 자주 쓰는 직책을 빠르게 채워 넣기 */
  const usedRoles = new Set(value.map(s => s.role.trim()));
  const quickRoles = QUICK_ROLE_CANDIDATES.filter(r => !usedRoles.has(r));

  return (
    <div className="signer-editor">
      {value.length === 0 ? (
        <p className="signer-empty">
          등록된 서명란이 없습니다. 아래 <strong>+ 서명란 추가</strong> 버튼으로 추가해 주세요.
        </p>
      ) : (
        <ul className="signer-list">
          {value.map((s, idx) => (
            <li key={s.id} className="signer-row">
              <span className="signer-no">{idx + 1}</span>

              <input
                type="text"
                className="signer-role-input"
                value={s.role}
                onChange={e => update(s.id, { role: e.target.value })}
                placeholder="직책 (예: 안전관리자)"
                aria-label={`서명란 ${idx + 1} 직책`}
              />

              <input
                type="text"
                className="signer-name-input"
                value={s.name ?? ''}
                onChange={e => update(s.id, { name: e.target.value })}
                placeholder="성명 (선택)"
                aria-label={`서명란 ${idx + 1} 성명`}
              />

              <div className="signer-actions">
                <button
                  type="button"
                  className="signer-icon-btn"
                  onClick={() => handleMove(idx, -1)}
                  disabled={idx === 0}
                  title="위로 이동"
                  aria-label="위로 이동"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="signer-icon-btn"
                  onClick={() => handleMove(idx, 1)}
                  disabled={idx === value.length - 1}
                  title="아래로 이동"
                  aria-label="아래로 이동"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="signer-icon-btn is-danger"
                  onClick={() => handleRemove(s.id)}
                  title="삭제"
                  aria-label="삭제"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="signer-foot">
        <button type="button" className="btn btn-secondary signer-add" onClick={handleAdd}>
          + 서명란 추가
        </button>

        {quickRoles.length > 0 && (
          <div className="signer-quick">
            <span className="signer-quick-label">빠른 추가</span>
            {quickRoles.map(role => (
              <button
                key={role}
                type="button"
                className="signer-quick-btn"
                onClick={() => onChange([...value, { id: createId(), role, name: '' }])}
              >
                {role}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="signer-hint">
        서명란은 보고서에 <strong>2열</strong>로 인쇄됩니다. 직책만 입력해도 되고, 성명을 비우면
        수기 서명용 여백으로 인쇄됩니다.
      </p>
    </div>
  );
};

export default SignerEditor;
