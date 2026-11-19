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
  /* 서식 FWP-006-3.01 본인사항 */
  permanentAddress: '',
  address: '',
  residentId: '',
  affiliation: '',
  /* 서식 FWP-006-3.01 작업사항 */
  victimTask: '',
  witnessTask: '',
  coworker: '',
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
      /* 서식 FWP-006-3.01 본인사항 */
      permanentAddress: draft.permanentAddress.trim() || undefined,
      address: draft.address.trim() || undefined,
      residentId: draft.residentId.trim() || undefined,
      affiliation: draft.affiliation.trim() || undefined,
      /* 서식 FWP-006-3.01 작업사항 */
      victimTask: draft.victimTask.trim() || undefined,
      witnessTask: draft.witnessTask.trim() || undefined,
      coworker: draft.coworker.trim() || undefined,
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

        {/* 서식 FWP-006-3.01 · 본인사항 */}
        <div className="witness-section-label">본인사항</div>
        <div className="witness-grid">
          <div className="witness-field">
            <label htmlFor="witnessPermanentAddress">본적</label>
            <input
              type="text"
              id="witnessPermanentAddress"
              value={draft.permanentAddress}
              onChange={e => setField('permanentAddress', e.target.value)}
              placeholder="예: 서울특별시 종로구 청운동"
            />
          </div>
          <div className="witness-field">
            <label htmlFor="witnessAddress">주소</label>
            <input
              type="text"
              id="witnessAddress"
              value={draft.address}
              onChange={e => setField('address', e.target.value)}
              placeholder="예: 서울시 종로구 새문안로 236"
            />
          </div>
          <div className="witness-field">
            <label htmlFor="witnessResidentId">주민등록번호</label>
            <input
              type="text"
              id="witnessResidentId"
              value={draft.residentId}
              onChange={e => setField('residentId', e.target.value)}
              placeholder="000000-0000000"
            />
          </div>
          <div className="witness-field">
            <label htmlFor="witnessAffiliation">소속</label>
            <input
              type="text"
              id="witnessAffiliation"
              value={draft.affiliation}
              onChange={e => setField('affiliation', e.target.value)}
              placeholder="예: 구보공영"
            />
          </div>
        </div>

        {/* 서식 FWP-006-3.01 · 작업사항 */}
        <div className="witness-section-label">작업사항</div>
        <div className="witness-grid">
          <div className="witness-field">
            <label htmlFor="witnessVictimTask">사고자가 하던 일</label>
            <input
              type="text"
              id="witnessVictimTask"
              value={draft.victimTask}
              onChange={e => setField('victimTask', e.target.value)}
              placeholder="예: 관 교체 반복 타설전 점검중"
            />
          </div>
          <div className="witness-field">
            <label htmlFor="witnessWitnessTask">목격자가 하던 일</label>
            <input
              type="text"
              id="witnessWitnessTask"
              value={draft.witnessTask}
              onChange={e => setField('witnessTask', e.target.value)}
              placeholder="예: 상층 작업 동향후"
            />
          </div>
          <div className="witness-field">
            <label htmlFor="witnessCoworker">같이 일하던 사람</label>
            <input
              type="text"
              id="witnessCoworker"
              value={draft.coworker}
              onChange={e => setField('coworker', e.target.value)}
              placeholder="예: 김철수, 이영희"
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
