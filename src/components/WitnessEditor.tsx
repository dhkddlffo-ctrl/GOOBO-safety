import React, { useState } from 'react';
import { WitnessStatement } from '../types';
import './WitnessEditor.css';

interface WitnessEditorProps {
  /** 목격자 진술서 목록 */
  value: WitnessStatement[];
  /** 목록 변경 시 호출 */
  onChange: (next: WitnessStatement[]) => void;
}

const createId = (): string =>
  `w-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const emptyDraft = () => ({
  name: '',
  phone: '',
  jobType: '',
  relation: '',
  statement: '',
  statementDate: '',
  confirmed: false,
});

type Draft = ReturnType<typeof emptyDraft>;

/**
 * 목격자 진술서 작성기
 *
 * 여러 명의 목격자를 등록하고, 각 진술서를 카드 형태로 관리합니다.
 * 등록된 진술서는 사고보고서에 '목격자 진술서' 장으로 함께 인쇄됩니다.
 */
const WitnessEditor: React.FC<WitnessEditorProps> = ({ value, onChange }) => {
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [error, setError] = useState('');

  const setField = <K extends keyof Draft>(key: K, v: Draft[K]) => {
    setDraft(prev => ({ ...prev, [key]: v }));
    if (error) setError('');
  };

  const handleAdd = () => {
    if (!draft.name.trim()) {
      setError('목격자 성명을 입력해주세요.');
      return;
    }
    if (!draft.statement.trim()) {
      setError('진술 내용을 입력해주세요.');
      return;
    }

    const next: WitnessStatement = {
      id: createId(),
      name: draft.name.trim(),
      phone: draft.phone.trim() || undefined,
      jobType: draft.jobType.trim() || undefined,
      relation: draft.relation.trim() || undefined,
      statement: draft.statement.trim(),
      statementDate: draft.statementDate || undefined,
      confirmed: draft.confirmed,
    };

    onChange([...value, next]);
    setDraft(emptyDraft());
    setError('');
  };

  const handleRemove = (id: string) => {
    if (!window.confirm('이 목격자 진술서를 삭제하시겠습니까?')) return;
    onChange(value.filter(w => w.id !== id));
  };

  return (
    <div className="witness-editor">
      {/* 등록된 진술서 */}
      {value.length > 0 && (
        <ul className="witness-list">
          {value.map((w, idx) => (
            <li key={w.id} className="witness-item">
              <div className="witness-item-head">
                <span className="witness-no">진술 {idx + 1}</span>
                <strong className="witness-name">{w.name}</strong>
                {w.confirmed && <span className="witness-badge">사실과 같음 확인</span>}
                <button
                  type="button"
                  className="witness-remove"
                  onClick={() => handleRemove(w.id)}
                  title="삭제"
                >
                  ✕
                </button>
              </div>
              <div className="witness-meta">
                {w.jobType && <span>직종: {w.jobType}</span>}
                {w.relation && <span>관계: {w.relation}</span>}
                {w.phone && <span>연락처: {w.phone}</span>}
                {w.statementDate && <span>작성일: {w.statementDate}</span>}
              </div>
              <p className="witness-statement">{w.statement}</p>
            </li>
          ))}
        </ul>
      )}

      {/* 입력 폼 */}
      <div className="witness-form">
        <div className="witness-form-title">
          ✍️ 목격자 진술서 추가
          {value.length > 0 && <span className="witness-count">등록 {value.length}건</span>}
        </div>

        <div className="witness-grid">
          <div className="witness-field">
            <label htmlFor="witnessName">목격자 성명 *</label>
            <input
              type="text"
              id="witnessName"
              value={draft.name}
              onChange={e => setField('name', e.target.value)}
              placeholder="예: 김목격"
            />
          </div>
          <div className="witness-field">
            <label htmlFor="witnessPhone">연락처</label>
            <input
              type="tel"
              id="witnessPhone"
              value={draft.phone}
              onChange={e => setField('phone', e.target.value)}
              placeholder="010-0000-0000"
            />
          </div>
          <div className="witness-field">
            <label htmlFor="witnessJobType">직종</label>
            <input
              type="text"
              id="witnessJobType"
              value={draft.jobType}
              onChange={e => setField('jobType', e.target.value)}
              placeholder="예: 철근공"
            />
          </div>
          <div className="witness-field">
            <label htmlFor="witnessRelation">피해자와의 관계</label>
            <input
              type="text"
              id="witnessRelation"
              value={draft.relation}
              onChange={e => setField('relation', e.target.value)}
              placeholder="예: 동료, 반장"
            />
          </div>
          <div className="witness-field">
            <label htmlFor="witnessDate">진술 작성일</label>
            <input
              type="date"
              id="witnessDate"
              value={draft.statementDate}
              onChange={e => setField('statementDate', e.target.value)}
            />
          </div>
        </div>

        <div className="witness-field">
          <label htmlFor="witnessStatement">진술 내용 *</label>
          <textarea
            id="witnessStatement"
            value={draft.statement}
            onChange={e => setField('statement', e.target.value)}
            rows={4}
            placeholder="목격한 사고 상황을 시간 순서대로 구체적으로 기술해주세요."
          />
        </div>

        <label className="witness-confirm">
          <input
            type="checkbox"
            checked={draft.confirmed}
            onChange={e => setField('confirmed', e.target.checked)}
          />
          <span>위 진술 내용이 사실과 같음을 확인합니다.</span>
        </label>

        {error && <p className="witness-error">{error}</p>}

        <div className="witness-form-actions">
          <button type="button" className="btn btn-secondary btn-witness-add" onClick={handleAdd}>
            + 목격자 진술서 추가
          </button>
        </div>
      </div>
    </div>
  );
};

export default WitnessEditor;
