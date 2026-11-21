import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HighGradeRecord, HighGradeRow } from '../types';
import { isAuthenticated } from '../utils/auth';
import { getRiskAssessments } from '../utils/riskAssessmentStorage';
import {
  createEmptyHighGradeRow,
  ensureHighGradeRecord,
  saveHighGradeRecord,
  collectHighGradeRows,
  summarizeHighGrade,
} from '../utils/highGradeStorage';
import './HighGradeControl.css';

interface HighGradeControlProps {
  siteId: number;
  siteName: string;
  /** 작성 마법사에서 열 때 바로 편집 모드로 시작 */
  autoEdit?: boolean;
  /** 마법사 안에 넣을 때 화면 전체 인쇄 버튼을 숨김 */
  embedded?: boolean;
  /**
   * 바깥(마법사)에서 수정을 잠글 때.
   *
   * 게시글로 등록되면 이 값이 true 가 되어 서식이 읽기 전용으로 바뀝니다.
   * [✏️ 수정]·[💾 저장]·행 추가 버튼도 함께 숨깁니다.
   */
  readOnly?: boolean;
}

/** yyyy-mm-dd → yyyy.mm.dd */
const formatDateKo = (ymd?: string): string => {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-');
  if (!y || !m || !d) return ymd;
  return `${y}.${m}.${d}`;
};

const HighGradeControl: React.FC<HighGradeControlProps> = ({
  siteId,
  siteName,
  autoEdit = false,
  embedded = false,
  readOnly = false,
}) => {
  const canManage = isAuthenticated();

  const [record, setRecord] = useState<HighGradeRecord>(() =>
    ensureHighGradeRecord(siteId, siteName),
  );
  const [draft, setDraft] = useState<HighGradeRecord | null>(() =>
    /* 마법사에서 열면 바로 편집 모드로 시작합니다. (잠긴 글이면 열지 않음) */
    autoEdit && !readOnly ? ensureHighGradeRecord(siteId, siteName) : null,
  );
  const [savedAt, setSavedAt] = useState('');
  const [notice, setNotice] = useState('');

  /* 바깥에서 잠그면 편집 중이던 내용도 즉시 닫습니다. */
  const editing = draft !== null && !readOnly;
  const view = editing ? draft : record;

  /** 직전 잠금 상태 — 잠금이 풀리는 순간을 알아채기 위해 기억합니다. */
  const wasReadOnly = useRef(readOnly);

  /** 바깥에서 잠글 때 편집 중이던 내용을 잃지 않도록 한 번 저장해 둡니다. */
  useEffect(() => {
    if (!readOnly || !draft) return;
    saveHighGradeRecord(draft);
    setRecord({ ...draft });
    setDraft(null);
  }, [readOnly, draft]);

  /** 마법사에서 [✏️ 수정]을 눌러 잠금이 풀리면 편집을 시작합니다. */
  useEffect(() => {
    const wasLocked = wasReadOnly.current;
    wasReadOnly.current = readOnly;
    if (!wasLocked || readOnly) return;
    setDraft({ ...record, rows: record.rows.map(r => ({ ...r })) });
  }, [readOnly, record]);

  const summary = useMemo(() => summarizeHighGrade(view), [view]);

  /* ---------------- 수정 / 저장 / 취소 ---------------- */
  const startEdit = () => {
    setDraft({ ...record, rows: record.rows.map(r => ({ ...r })) });
    setNotice('');
  };

  const cancelEdit = () => {
    setDraft(null);
    setNotice('');
  };

  const save = () => {
    if (!draft) return;
    saveHighGradeRecord(draft);
    setRecord({ ...draft });
    setDraft(null);
    setSavedAt(new Date().toLocaleTimeString('ko-KR'));
  };

  /* ---------------- 행 편집 ---------------- */
  const patchRow = (rowId: string, patch: Partial<HighGradeRow>) => {
    setDraft(d => {
      if (!d) return d;
      return {
        ...d,
        rows: d.rows.map(r => (r.id === rowId ? { ...r, ...patch } : r)),
      };
    });
  };

  const patchDoc = (patch: Partial<HighGradeRecord>) => {
    setDraft(d => (d ? { ...d, ...patch } : d));
  };

  const addRow = () => {
    setDraft(d => (d ? { ...d, rows: [...d.rows, createEmptyHighGradeRow()] } : d));
  };

  const removeRow = (rowId: string) => {
    setDraft(d => {
      if (!d || d.rows.length <= 1) return d;
      return { ...d, rows: d.rows.filter(r => r.id !== rowId) };
    });
  };

  /* ---------------- 등록부에서 상등급 불러오기 ---------------- */
  const importFromRegister = useCallback(() => {
    if (!draft) return;
    const assessments = getRiskAssessments(siteId);
    const added = collectHighGradeRows(assessments, draft.rows);
    if (added.length === 0) {
      setNotice('등록부에서 새로 가져올 상등급 항목이 없습니다. (이미 반영되었거나 상등급이 없음)');
      return;
    }
    /* 빈 행은 그대로 두고 뒤에 붙입니다. */
    const kept = draft.rows.filter(r => r.hazard.trim() !== '');
    const blanks = draft.rows.filter(r => r.hazard.trim() === '');
    setDraft({ ...draft, rows: [...kept, ...added, ...blanks] });
    setNotice(`상등급 ${added.length}건을 등록부에서 가져왔습니다.`);
  }, [draft, siteId]);

  /* ---------------- 인쇄 ---------------- */
  const print = () => {
    if (editing) {
      alert('먼저 저장한 뒤 출력해주세요.');
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print());
    });
  };

  return (
    <div className="hg">
      {/* ---------- 도구 모음 ---------- */}
      <div className="hg-toolbar">
        <div className="hg-summary">
          <span className="hg-sum-item">
            상등급 <b>{summary.filled}</b>건
          </span>
          <span className="hg-sum-item hg-sum-done">
            실천/완료 <b>{summary.done}</b>건
          </span>
          <span className="hg-sum-item hg-sum-pending">
            미이행 <b>{summary.pending}</b>건
          </span>
        </div>

        <div className="hg-toolbar-actions">
          {/* 마법사 안에서는 [수정/저장/취소]를 마법사가 담당하므로 숨깁니다. */}
          {!editing && canManage && !embedded && !readOnly && (
            <button className="btn btn-sm btn-primary" onClick={startEdit}>
              ✏️ 수정
            </button>
          )}
          {editing && !embedded && (
            <>
              <button className="btn btn-sm btn-primary" onClick={save}>
                💾 저장
              </button>
              <button className="btn btn-sm" onClick={cancelEdit}>
                취소
              </button>
            </>
          )}
          {editing && (
            <span className="hg-row-tools">
              <button className="btn btn-sm hg-btn-import" onClick={importFromRegister}>
                ⤓ 등록부에서 상등급 불러오기
              </button>
              <button className="btn btn-sm hg-btn-row-add" onClick={addRow}>
                ＋ 행 추가
              </button>
            </span>
          )}
          {/* 마법사 안에서는 전체 인쇄 버튼을 숨깁니다 (마법사가 한 번에 출력). */}
          {!editing && !embedded && (
            <button className="btn btn-sm hg-btn-print" onClick={print}>
              🖨️ A4 인쇄
            </button>
          )}
        </div>
      </div>

      {savedAt && !editing && <p className="hg-saved">✅ 저장되었습니다 ({savedAt})</p>}
      {notice && <p className="hg-notice">{notice}</p>}

      {/* ---------- 서식 (A4 가로) ---------- */}
      <div className="hg-doc">
        <section className="hg-sheet">
          <div className="hg-sheet-inner">
            {/* 제목 */}
            <div className="hg-title">위험성평가 상등급 관리</div>

            {/* 현장명 · 작성일 */}
            <table className="hg-meta-table">
              <colgroup>
                <col style={{ width: '10%' }} />
                <col style={{ width: '65%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '15%' }} />
              </colgroup>
              <tbody>
                <tr>
                  <th className="hg-meta-label">현장명</th>
                  <td className="hg-meta-value">{siteName}</td>
                  <th className="hg-meta-label">작성일</th>
                  <td className="hg-meta-date">
                    {editing ? (
                      <input
                        className="hg-in"
                        type="date"
                        value={view.writtenAt}
                        onChange={e => patchDoc({ writtenAt: e.target.value })}
                      />
                    ) : (
                      formatDateKo(view.writtenAt) || '-'
                    )}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* 본문 표 */}
            <table className="hg-table">
              <colgroup>
                <col style={{ width: '8%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '26%' }} />
                <col style={{ width: '24%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '8%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="hg-th-2">
                    작업
                    <br />
                    기간
                  </th>
                  <th className="hg-th-2">
                    작업
                    <br />
                    위치
                  </th>
                  <th className="hg-th-2">
                    위험요인
                    <br />
                    도출자
                  </th>
                  <th>
                    위험요인(Hazard)
                    <br />
                    <span className="hg-th-sub">(근본적인 원인 도출)</span>
                  </th>
                  <th>개선조치계획</th>
                  <th>실천/완료</th>
                  <th className="hg-th-2">
                    실천/완료
                    <br />
                    확인자
                  </th>
                </tr>
              </thead>
              <tbody>
                {view.rows.map((row, idx) => (
                  <tr key={row.id}>
                    <td className="hg-c-period">
                      {editing ? (
                        <>
                          <button
                            type="button"
                            className="hg-row-x"
                            onClick={() => removeRow(row.id)}
                            title={`${idx + 1}행 삭제`}
                            aria-label={`${idx + 1}행 삭제`}
                          >
                            ×
                          </button>
                          <input
                            className="hg-in"
                            value={row.workPeriod}
                            onChange={e => patchRow(row.id, { workPeriod: e.target.value })}
                            placeholder="26.11.20~"
                          />
                        </>
                      ) : (
                        <span className="hg-cell-text">{row.workPeriod}</span>
                      )}
                    </td>
                    <td className="hg-c-loc">
                      {editing ? (
                        <input
                          className="hg-in"
                          value={row.workLocation}
                          onChange={e => patchRow(row.id, { workLocation: e.target.value })}
                          placeholder="작업 위치"
                        />
                      ) : (
                        <span className="hg-cell-text">{row.workLocation}</span>
                      )}
                    </td>
                    <td className="hg-c-finder">
                      {editing ? (
                        <input
                          className="hg-in"
                          value={row.hazardFinder}
                          onChange={e => patchRow(row.id, { hazardFinder: e.target.value })}
                          placeholder="도출자"
                        />
                      ) : (
                        <span className="hg-cell-text">{row.hazardFinder}</span>
                      )}
                    </td>
                    <td className="hg-c-hazard">
                      {editing ? (
                        <textarea
                          className="hg-in hg-ta"
                          value={row.hazard}
                          onChange={e => patchRow(row.id, { hazard: e.target.value })}
                          placeholder="위험요인과 근본적인 원인"
                          rows={4}
                        />
                      ) : (
                        <span className="hg-cell-text">{row.hazard}</span>
                      )}
                    </td>
                    <td className="hg-c-plan">
                      {editing ? (
                        <textarea
                          className="hg-in hg-ta"
                          value={row.improvementPlan}
                          onChange={e => patchRow(row.id, { improvementPlan: e.target.value })}
                          placeholder="개선조치계획"
                          rows={4}
                        />
                      ) : (
                        <span className="hg-cell-text">{row.improvementPlan}</span>
                      )}
                    </td>
                    <td className="hg-c-result">
                      {editing ? (
                        <textarea
                          className="hg-in hg-ta"
                          value={row.actionResult}
                          onChange={e => patchRow(row.id, { actionResult: e.target.value })}
                          placeholder="실천 내용 / 완료 여부"
                          rows={4}
                        />
                      ) : (
                        <span className="hg-cell-text">{row.actionResult}</span>
                      )}
                    </td>
                    <td className="hg-c-confirm">
                      {editing ? (
                        <input
                          className="hg-in"
                          value={row.confirmer}
                          onChange={e => patchRow(row.id, { confirmer: e.target.value })}
                          placeholder="확인자"
                        />
                      ) : (
                        <span className="hg-cell-text">{row.confirmer}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 비고 */}
            <table className="hg-note-table">
              <tbody>
                <tr>
                  <th className="hg-note-label">비고</th>
                  <td className="hg-note-value">
                    {editing ? (
                      <input
                        className="hg-in"
                        value={view.note}
                        onChange={e => patchDoc({ note: e.target.value })}
                        placeholder="특기사항"
                      />
                    ) : (
                      <span className="hg-cell-text">{view.note}</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* 하단 */}
            <div className="hg-foot">
              <span>평가등급 상(중점관리) 항목 관리대장</span>
              <span className="hg-foot-company">구 보 공 영 (주)</span>
              <span>A4(297x210)</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default HighGradeControl;
