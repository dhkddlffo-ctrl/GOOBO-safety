import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { RiskAssessment as RiskAssessmentData, RiskRow, RiskAttachment, RiskScore } from '../types';
import { isAuthenticated } from '../utils/auth';
import {
  getRiskAssessments,
  getRiskAssessment,
  saveRiskAssessment,
  deleteRiskAssessment,
  createEmptyRiskAssessment,
  createEmptyRiskRow,
  evaluateRow,
  summarizeAssessment,
  scoreLabel,
  toggleScore,
  ROWS_PER_FIRST_PAGE,
  ROWS_PER_SECOND_PAGE,
  ACTION_FIELDS,
  ACCIDENT_TYPES,
  getRiskAttachments,
  saveRiskAttachment,
  deleteRiskAttachment,
  getRiskAttachmentFile,
} from '../utils/riskAssessmentStorage';
import { formatFileSize, isAllowedFile, MAX_FILE_SIZE } from '../utils/documentStorage';
import './RiskAssessment.css';

interface RiskAssessmentProps {
  siteId: number;
  siteName: string;
}

const formatDateKo = (ymd?: string): string => {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-');
  if (!y || !m || !d) return ymd;
  return `${y}.${m}.${d}`;
};

const RiskAssessment: React.FC<RiskAssessmentProps> = ({ siteId, siteName }) => {
  const canManage = isAuthenticated();

  const [list, setList] = useState<RiskAssessmentData[]>([]);
  const [currentId, setCurrentId] = useState<string>('');
  const [doc, setDoc] = useState<RiskAssessmentData | null>(null);
  const [draft, setDraft] = useState<RiskAssessmentData | null>(null);

  /* 첨부 (양식 10~13페이지) */
  const [attachments, setAttachments] = useState<RiskAttachment[]>([]);
  const [attTitle, setAttTitle] = useState('');
  const [attPeriod, setAttPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [attFile, setAttFile] = useState<File | null>(null);
  const [attBusy, setAttBusy] = useState(false);
  const [attError, setAttError] = useState('');

  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState('');

  const editing = draft !== null;
  const view = draft ?? doc;

  /* ---------------- 불러오기 ---------------- */
  const load = useCallback(() => {
    const all = getRiskAssessments(siteId);
    setList(all);
    setAttachments(getRiskAttachments(siteId));
    if (all.length > 0) {
      const pick = all.find(a => a.id === currentId) ?? all[0];
      setCurrentId(pick.id);
      setDoc(pick);
    } else {
      setCurrentId('');
      setDoc(null);
    }
  }, [siteId, currentId]);

  useEffect(() => {
    setDraft(null);
    setError('');
    setSavedAt('');
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  /* 목록에서 다른 평가를 고를 때 */
  const selectAssessment = (id: string) => {
    if (editing && !window.confirm('저장하지 않은 수정 내용이 있습니다. 버리고 이동할까요?')) {
      return;
    }
    const target = getRiskAssessment(id);
    setCurrentId(id);
    setDoc(target);
    setDraft(null);
    setError('');
  };

  /* ---------------- 새 평가 ---------------- */
  const addAssessment = () => {
    if (editing && !window.confirm('저장하지 않은 수정 내용이 있습니다. 버리고 새로 만들까요?')) {
      return;
    }
    const created = createEmptyRiskAssessment(siteId, siteName);
    saveRiskAssessment(created);
    setCurrentId(created.id);
    setDoc(created);
    setDraft({ ...created, rows: created.rows.map(r => ({ ...r })) });
    setSavedAt('');
    setList(getRiskAssessments(siteId));
  };

  /* ---------------- 수정 / 저장 / 취소 ---------------- */
  const startEdit = () => {
    if (!doc) return;
    setDraft({ ...doc, rows: doc.rows.map(r => ({ ...r })) });
    setError('');
  };

  const cancelEdit = () => {
    setDraft(null);
    setError('');
  };

  const save = () => {
    if (!draft) return;
    /* 필수값 검사: 위험요인이 하나도 없으면 저장하지 않습니다. */
    const filled = draft.rows.filter(r => r.hazard.trim() !== '');
    if (filled.length === 0) {
      setError('위험요인을 1개 이상 입력해주세요.');
      return;
    }
    saveRiskAssessment(draft);
    const saved = getRiskAssessment(draft.id);
    setDoc(saved);
    setDraft(null);
    setError('');
    setList(getRiskAssessments(siteId));
    setSavedAt(new Date().toLocaleTimeString('ko-KR'));
  };

  const remove = () => {
    if (!doc) return;
    if (!window.confirm('이 위험성평가표를 삭제할까요?\n삭제한 자료는 되돌릴 수 없습니다.')) return;
    deleteRiskAssessment(doc.id);
    setCurrentId('');
    setDoc(null);
    setDraft(null);
    load();
  };

  /* ---------------- 행 갱신 ---------------- */
  /**
   * 행 하나를 수정합니다.
   *
   * 조치/점검 항목(조치예정일 · 조치완료일 · 점검자)을 고치면, '아래 행에 함께 적용'이
   * 켜져 있을 때 아래 행들도 같은 값으로 이어집니다.
   *
   * 아래 행이라도 **사용자가 직접 고친 항목**(row.actionEdited 에 기록됨)은 건드리지 않아
   * 행마다 따로 값을 가질 수 있습니다.
   */
  const patchRow = (rowId: string, patch: Partial<RiskRow>) => {
    setDraft(d => {
      if (!d) return d;

      const index = d.rows.findIndex(r => r.id === rowId);
      if (index < 0) return d;

      const rows = d.rows.map(r => (r.id === rowId ? { ...r, ...patch } : r));

      /* 직접 고친 조치/점검 항목을 이 행의 '개별 수정' 목록에 남깁니다. */
      const touched = ACTION_FIELDS.filter(f => f in patch);
      if (touched.length > 0) {
        const own = rows[index].actionEdited ?? [];
        rows[index] = { ...rows[index], actionEdited: [...new Set([...own, ...touched])] };
      }

      /* '아래 행에 함께 적용' 체크가 꺼져 있으면 이 행만 수정합니다. */
      if (d.actionCascade === false || touched.length === 0) return { ...d, rows };

      touched.forEach(field => {
        const newValue = patch[field];

        for (let i = index + 1; i < rows.length; i += 1) {
          /* 아래 행이 이 항목을 직접 고쳐 두었다면 그대로 둡니다. */
          if (rows[i].actionEdited?.includes(field)) continue;

          rows[i] = {
            ...rows[i],
            [field]: newValue,
          } as RiskRow;
        }
      });

      return { ...d, rows };
    });
  };

  /* ---------------- 행 추가 / 삭제 ---------------- */
  /**
   * 등록부에 빈 행을 하나 더 붙입니다.
   * 기본 5행은 "1장에 들어가는 양"일 뿐 상한이 아니므로 계속 늘릴 수 있고,
   * 5행을 넘으면 2장이 자동으로 생깁니다.
   */
  const addRow = () => {
    setDraft(d => (d ? { ...d, rows: [...d.rows, createEmptyRiskRow()] } : d));
  };

  /**
   * 지정한 행을 삭제합니다. (최소 1행은 남깁니다)
   * 몇 행이든 자유롭게 지울 수 있고, 지운 뒤 번호는 자동으로 다시 매겨집니다.
   */
  const removeRow = (rowId: string) => {
    setDraft(d => {
      if (!d || d.rows.length <= 1) return d;
      return { ...d, rows: d.rows.filter(r => r.id !== rowId) };
    });
  };

  /** 맨 아래 행 삭제 — 여러 행을 빠르게 줄일 때 씁니다. (최소 1행 유지) */
  const removeLastRow = () => {
    setDraft(d => {
      if (!d || d.rows.length <= 1) return d;
      return { ...d, rows: d.rows.slice(0, -1) };
    });
  };

  const patchDoc = (patch: Partial<RiskAssessmentData>) => {
    setDraft(d => (d ? { ...d, ...patch } : d));
  };

  /* ---------------- 인쇄 ---------------- */
  const print = () => {
    if (editing) {
      alert('먼저 저장한 뒤 출력해주세요.');
      return;
    }
    if (!doc) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print());
    });
  };

  /* ---------------- 첨부 처리 ---------------- */
  const handleAttachPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setAttError('');
    if (!file) {
      setAttFile(null);
      return;
    }
    if (!isAllowedFile(file.name)) {
      setAttError('PDF, 한글, 엑셀, 이미지 등 문서 파일만 올릴 수 있습니다.');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setAttError(`파일 용량은 ${formatFileSize(MAX_FILE_SIZE)} 까지 가능합니다.`);
      e.target.value = '';
      return;
    }
    setAttFile(file);
    if (!attTitle.trim()) {
      /* 파일명에서 확장자를 뺀 값을 기본 문서명으로 사용 */
      setAttTitle(file.name.replace(/\.[^.]+$/, ''));
    }
  };

  const uploadAttachment = async () => {
    if (!attFile) {
      setAttError('올릴 파일을 선택해주세요.');
      return;
    }
    setAttBusy(true);
    setAttError('');
    try {
      await saveRiskAttachment(siteId, siteName, attFile, {
        title: attTitle,
        period: attPeriod,
        uploadedBy: canManage ? '관리자' : '작성자',
      });
      setAttachments(getRiskAttachments(siteId));
      setAttFile(null);
      setAttTitle('');
    } catch (err) {
      setAttError(err instanceof Error ? err.message : '파일을 저장하지 못했습니다.');
    } finally {
      setAttBusy(false);
    }
  };

  const downloadAttachment = async (att: RiskAttachment) => {
    const blob = await getRiskAttachmentFile(att);
    if (!blob) {
      alert('파일을 찾을 수 없습니다. (브라우저 저장소가 정리되었을 수 있습니다)');
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = att.fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const removeAttachment = async (att: RiskAttachment) => {
    if (!window.confirm(`'${att.title}' 첨부를 삭제할까요?`)) return;
    await deleteRiskAttachment(att.id);
    setAttachments(getRiskAttachments(siteId));
  };

  /* ---------------- 요약 ---------------- */
  const summary = useMemo(
    () => (view ? summarizeAssessment(view) : { filled: 0, high: 0, low: 0, done: 0 }),
    [view],
  );

  /**
   * 행을 인쇄 장 단위로 나눕니다.
   * 1장은 5행 + 하단 기입란으로 고정, 2장부터는 6행씩 이어집니다.
   * 행을 추가하면 장이 자동으로 늘어납니다.
   */
  const pageChunks = useMemo(() => {
    const rows = view?.rows ?? [];
    const chunks: { rows: RiskRow[]; start: number }[] = [
      { rows: rows.slice(0, ROWS_PER_FIRST_PAGE), start: 0 },
    ];
    for (let i = ROWS_PER_FIRST_PAGE; i < rows.length; i += ROWS_PER_SECOND_PAGE) {
      chunks.push({ rows: rows.slice(i, i + ROWS_PER_SECOND_PAGE), start: i });
    }
    return chunks;
  }, [view]);

  /* ---------------- 표 렌더 (보기/편집 공용) ---------------- */
  const tableRows = (rows: RiskRow[], startIndex: number) =>
    rows.map((row, i) => {
      const rowNo = startIndex + i + 1;
      const { total, grade } = evaluateRow(row);
      return (
        <tr key={row.id} className={grade === '상' ? 'ra-row-high' : undefined}>
          <td className="ra-c-no">
            <span className="ra-no-val">{rowNo}</span>
            {editing && (
              <button
                type="button"
                className="ra-row-x"
                onClick={() => removeRow(row.id)}
                title={`${rowNo}행 삭제`}
                aria-label={`${rowNo}행 삭제`}
              >
                ×
              </button>
            )}
          </td>
          <td>
            {editing ? (
              <input
                className="ra-in"
                value={row.workPeriod}
                onChange={e => patchRow(row.id, { workPeriod: e.target.value })}
                placeholder="예: 26.10.19~11.01"
              />
            ) : (
              <span className="ra-cell-text">{row.workPeriod}</span>
            )}
          </td>
          <td>
            {editing ? (
              <input
                className="ra-in"
                value={row.workLocation}
                onChange={e => patchRow(row.id, { workLocation: e.target.value })}
                placeholder="작업 위치"
              />
            ) : (
              <span className="ra-cell-text">{row.workLocation}</span>
            )}
          </td>
          <td>
            {editing ? (
              <input
                className="ra-in"
                value={row.hazardFinder}
                onChange={e => patchRow(row.id, { hazardFinder: e.target.value })}
                placeholder="도출자"
              />
            ) : (
              <span className="ra-cell-text">{row.hazardFinder}</span>
            )}
          </td>
          <td className="ra-c-hazard">
            {editing ? (
              <textarea
                className="ra-in ra-ta"
                value={row.hazard}
                onChange={e => patchRow(row.id, { hazard: e.target.value })}
                placeholder="위험요인과 근본적인 원인"
                rows={3}
              />
            ) : (
              <span className="ra-cell-text">{row.hazard}</span>
            )}
          </td>
          <td>
            {editing ? (
              <select
                className="ra-in"
                value={row.accidentType}
                onChange={e => patchRow(row.id, { accidentType: e.target.value })}
              >
                <option value="">선택</option>
                {ACCIDENT_TYPES.map(t => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            ) : (
              <span className="ra-cell-text">{row.accidentType}</span>
            )}
          </td>
          <td className="ra-c-score">
            {editing ? (
              <span className="ra-score-group">
                {([1, 2] as RiskScore[]).map(v => (
                  <button
                    key={v}
                    type="button"
                    className={`ra-score-btn${row.intensity === v ? ' active' : ''}`}
                    onClick={() => patchRow(row.id, { intensity: toggleScore(row.intensity, v) })}
                    title={`강도 ${v}${v === 1 ? '(하)' : '(상)'}`}
                  >
                    {v}
                  </button>
                ))}
              </span>
            ) : (
              <span className="ra-cell-text">{scoreLabel(row.intensity)}</span>
            )}
          </td>
          <td className="ra-c-score">
            {editing ? (
              <span className="ra-score-group">
                {([1, 2] as RiskScore[]).map(v => (
                  <button
                    key={v}
                    type="button"
                    className={`ra-score-btn${row.frequency === v ? ' active' : ''}`}
                    onClick={() => patchRow(row.id, { frequency: toggleScore(row.frequency, v) })}
                    title={`빈도 ${v}${v === 1 ? '(하)' : '(상)'}`}
                  >
                    {v}
                  </button>
                ))}
              </span>
            ) : (
              <span className="ra-cell-text">{scoreLabel(row.frequency)}</span>
            )}
          </td>
          <td className="ra-c-total">
            <span className={total ? 'ra-total-val' : 'ra-cell-text'}>{total || '-'}</span>
          </td>
          <td className="ra-c-grade">
            {grade ? (
              <span className={`ra-grade ${grade === '상' ? 'high' : 'low'}`}>{grade}</span>
            ) : (
              <span className="ra-cell-text">-</span>
            )}
          </td>
          <td>
            {editing ? (
              <select
                className="ra-in"
                value={row.manageRegistered}
                onChange={e =>
                  patchRow(row.id, {
                    manageRegistered: e.target.value as RiskRow['manageRegistered'],
                  })
                }
              >
                <option value="">-</option>
                <option value="O">O</option>
                <option value="X">X</option>
              </select>
            ) : (
              <span className="ra-cell-text">{row.manageRegistered}</span>
            )}
          </td>
          <td className="ra-c-plan">
            {editing ? (
              <textarea
                className="ra-in ra-ta"
                value={row.improvementPlan}
                onChange={e => patchRow(row.id, { improvementPlan: e.target.value })}
                placeholder="개선조치계획"
                rows={3}
              />
            ) : (
              <span className="ra-cell-text">{row.improvementPlan}</span>
            )}
          </td>
          <td className="ra-c-action">
            {editing ? (
              <span className="ra-action-edit">
                <input
                  className="ra-in ra-date"
                  type="date"
                  value={row.actionDueDate}
                  onChange={e => patchRow(row.id, { actionDueDate: e.target.value })}
                  title="조치예정일"
                />
                <input
                  className="ra-in ra-date"
                  type="date"
                  value={row.actionDoneDate}
                  onChange={e => patchRow(row.id, { actionDoneDate: e.target.value })}
                  title="조치완료일"
                />
                <input
                  className="ra-in"
                  value={row.inspector}
                  onChange={e => patchRow(row.id, { inspector: e.target.value })}
                  placeholder="점검 담당자"
                />
              </span>
            ) : row.actionDueDate || row.actionDoneDate || row.inspector ? (
              <span className="ra-cell-text ra-action-view">
                <span>{formatDateKo(row.actionDueDate) || '-'}</span>
                <span>{formatDateKo(row.actionDoneDate) || '-'}</span>
                <span>{row.inspector || '-'}</span>
              </span>
            ) : (
              <span className="ra-cell-text">-</span>
            )}
          </td>
        </tr>
      );
    });

  /* 테이블 머리글 (1페이지용: 상단 제목 포함 / 2페이지용: 반복 머리글) */
  const tableHead = (compact: boolean) => (
    <thead>
      {!compact && (
        <tr>
          <th colSpan={6} rowSpan={2} className="ra-th-title">
            위험성평가표 / 등록부
          </th>
          <th colSpan={5} className="ra-th-sign">
            결 재
          </th>
          <th colSpan={2} rowSpan={2} className="ra-th-form">
            양식 SCM-002-1.01
          </th>
        </tr>
      )}
      {!compact && (
        <tr>
          <th className="ra-th-sign-cell">담당</th>
          <th className="ra-th-sign-cell">현장소장</th>
          <th className="ra-th-sign-cell" colSpan={3}>
            <span className="ra-sign-line">(서명)</span>
          </th>
        </tr>
      )}
      {!compact && (
        <tr>
          <th className="ra-th-2" rowSpan={2}>
            No
          </th>
          <th className="ra-th-2">작업 기간</th>
          <th className="ra-th-2">작업 위치</th>
          <th className="ra-th-2">위험요인 도출자</th>
          <th className="ra-th-2">위험요인(Hazard) (근본적인 원인 도출)</th>
          <th className="ra-th-2">재해 형태</th>
          <th className="ra-th-2" colSpan={4}>
            Risk Assessment
          </th>
          <th className="ra-th-2">관리 등록 여부</th>
          <th className="ra-th-2">개선조치계획</th>
          <th className="ra-th-2">조치예정일 · 조치완료일 · 점검 담당자</th>
        </tr>
      )}
      <tr>
        {/* 위 2단 머리글에서 No 칸을 rowSpan 으로 먼저 잡았으므로 중복 렌더하지 않습니다. */}
        {compact && <th className="ra-th-3">No</th>}
        <th className="ra-th-3">작업 기간</th>
        <th className="ra-th-3">작업 위치</th>
        <th className="ra-th-3">도출자</th>
        <th className="ra-th-3">위험요인(Hazard)</th>
        <th className="ra-th-3">재해 형태</th>
        <th className="ra-th-3">강도</th>
        <th className="ra-th-3">빈도</th>
        <th className="ra-th-3">평가 합계</th>
        <th className="ra-th-3">평가 등급</th>
        <th className="ra-th-3">관리 등록</th>
        <th className="ra-th-3">개선조치계획</th>
        <th className="ra-th-3">조치/점검</th>
      </tr>
    </thead>
  );

  /* ---------------- 화면 ---------------- */
  return (
    <div className="ra">
      {/* ---------- 도구 모음 ---------- */}
      <div className="ra-toolbar">
        {list.length > 0 && (
          <label className="ra-select-wrap">
            <span className="ra-select-label">평가 선택</span>
            <select
              className="ra-select"
              value={currentId}
              onChange={e => selectAssessment(e.target.value)}
              disabled={editing}
            >
              {list.map(a => (
                <option key={a.id} value={a.id}>
                  {formatDateKo(a.writtenAt)} · {a.author || '작성자 미입력'} ·{' '}
                  {summarizeAssessment(a).filled}건
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="ra-toolbar-actions">
          {canManage && (
            <button className="btn btn-sm ra-btn-add" onClick={addAssessment}>
              ＋ 새 위험성평가
            </button>
          )}

          {doc && !editing && canManage && (
            <button className="btn btn-sm btn-primary" onClick={startEdit}>
              ✏️ 수정
            </button>
          )}
          {editing && (
            <>
              <button className="btn btn-sm btn-primary" onClick={save}>
                💾 저장
              </button>
              <button className="btn btn-sm" onClick={cancelEdit}>
                취소
              </button>
              <span className="ra-row-tools">
                <button
                  className="btn btn-sm ra-btn-row-add"
                  onClick={addRow}
                  title="등록부에 빈 행을 하나 더 붙입니다"
                >
                  ＋ 행 추가
                </button>
                {view && view.rows.length > 1 && (
                  <button
                    className="btn btn-sm ra-btn-row-del"
                    onClick={removeLastRow}
                    title="맨 아래 행을 지웁니다 (최소 1행은 남습니다)"
                  >
                    － 마지막 행 삭제
                  </button>
                )}
              </span>
            </>
          )}
          {doc && !editing && (
            <button className="btn btn-sm ra-btn-print" onClick={print}>
              🖨️ A4 인쇄
            </button>
          )}
          {doc && !editing && canManage && (
            <button className="btn btn-sm ra-btn-del" onClick={remove}>
              🗑️ 삭제
            </button>
          )}
        </div>
      </div>

      {error && <p className="ra-error">⚠️ {error}</p>}
      {savedAt && !editing && <p className="ra-saved">✅ 저장되었습니다 ({savedAt})</p>}

      {/* ---------- 비어 있음 ---------- */}
      {!view && (
        <div className="ra-empty">
          <p className="ra-empty-title">아직 작성된 위험성평가표가 없습니다.</p>
          <p className="ra-empty-sub">
            회사 양식(SCM-002-1.01)과 동일한 서식으로 작성하고 A4 가로로 인쇄할 수 있습니다.
            <br />
            강도·빈도를 고르면 <b>평가합계와 등급이 자동으로 계산</b>됩니다.
          </p>
          {canManage ? (
            <button className="btn btn-primary" onClick={addAssessment}>
              ＋ 위험성평가표 작성하기
            </button>
          ) : (
            <p className="ra-empty-note">관리자 로그인 후 작성할 수 있습니다.</p>
          )}
        </div>
      )}

      {/* ---------- 요약 ---------- */}
      {view && (
        <div className="ra-summary">
          <span className="ra-sum-item">
            위험요인 <b>{summary.filled}</b>건
          </span>
          <span className="ra-sum-item ra-sum-high">
            상등급(중점관리) <b>{summary.high}</b>건
          </span>
          <span className="ra-sum-item ra-sum-low">
            하등급(일상관리) <b>{summary.low}</b>건
          </span>
          <span className="ra-sum-item">
            조치완료 <b>{summary.done}</b>건
          </span>
          {summary.filled < summary.high + summary.low && (
            <span className="ra-sum-warn">
              ⚠️ 강도/빈도 미입력 {summary.filled - summary.high - summary.low}건
            </span>
          )}
        </div>
      )}

      {/* ---------- 서식 본문 ---------- */}
      {view && (
        <>
          {/* 표 위 기본 정보 (편집 시 입력) */}
          <div className="ra-meta">
            <label className="ra-meta-item">
              <span>공사명</span>
              {editing ? (
                <input
                  className="ra-in"
                  value={view.constructionName}
                  onChange={e => patchDoc({ constructionName: e.target.value })}
                />
              ) : (
                <span className="ra-meta-val">{view.constructionName || '-'}</span>
              )}
            </label>
            <label className="ra-meta-item">
              <span>작성자(팀장/반장)</span>
              {editing ? (
                <input
                  className="ra-in"
                  value={view.author}
                  onChange={e => patchDoc({ author: e.target.value })}
                />
              ) : (
                <span className="ra-meta-val">{view.author || '-'}</span>
              )}
            </label>
            <label className="ra-meta-item">
              <span>작성일</span>
              {editing ? (
                <input
                  className="ra-in ra-date"
                  type="date"
                  value={view.writtenAt}
                  onChange={e => patchDoc({ writtenAt: e.target.value })}
                />
              ) : (
                <span className="ra-meta-val">{formatDateKo(view.writtenAt) || '-'}</span>
              )}
            </label>
          </div>

          {/* 조치/점검 값 아래 행 함께 적용 (편집 시에만) */}
          {editing && (
            <label className="ra-cascade">
              <input
                type="checkbox"
                checked={view.actionCascade !== false}
                onChange={e => patchDoc({ actionCascade: e.target.checked })}
              />
              <span>
                조치/점검 값을 <b>아래 행에 함께 적용</b>
                <span className="ra-cascade-hint">
                  점검일·점검자를 지정하면 그 아래 행들도 같이 채워집니다. 개별 행은 나중에 따로
                  수정할 수 있습니다.
                </span>
              </span>
            </label>
          )}

          {/* ---------- 서식 본문 (1장 = 5행 + 하단 기입란 고정, 2장부터 6행씩) ---------- */}
          <div className="ra-doc">
            {pageChunks.map((chunk, pageIndex) => {
              const isFirst = pageIndex === 0;
              const isLast = pageIndex === pageChunks.length - 1;
              /* 1장은 하단 기입란 고정, 2장부터는 예전처럼 마지막 장에만 표시 */
              const showFooter = isFirst || isLast;
              return (
                <section
                  key={pageIndex}
                  className={`ra-sheet ${isFirst ? 'ra-sheet-1' : 'ra-sheet-cont'}`}
                >
                  <div className="ra-sheet-inner">
                    <table className="ra-table">
                      <colgroup>
                        <col style={{ width: '3%' }} />
                        <col style={{ width: '7%' }} />
                        <col style={{ width: '6%' }} />
                        <col style={{ width: '5%' }} />
                        <col style={{ width: '20%' }} />
                        <col style={{ width: '5.5%' }} />
                        {/* Risk Assessment — 좁게 */}
                        <col style={{ width: '4%' }} />
                        <col style={{ width: '4%' }} />
                        <col style={{ width: '4%' }} />
                        <col style={{ width: '4%' }} />
                        <col style={{ width: '4.5%' }} />
                        {/* 개선조치계획 — 최대한 넓게 */}
                        <col style={{ width: '24%' }} />
                        <col style={{ width: '9%' }} />
                      </colgroup>
                      {tableHead(!isFirst)}
                      <tbody>{tableRows(chunk.rows, chunk.start)}</tbody>
                    </table>

                    {/* 1장 하단 기입란은 고정, 2장부터는 마지막 장에만 표시 */}
                    {showFooter && (
                      <div className="ra-footer">
                        <div className="ra-foot-row">
                          <div className="ra-foot-label ra-foot-label-2">
                            추가위험요인
                            <br />
                            (필요시/소장)
                          </div>
                          <div className="ra-foot-value ra-foot-grow">
                            {editing ? (
                              <textarea
                                className="ra-in ra-ta"
                                value={view.extraHazards}
                                onChange={e => patchDoc({ extraHazards: e.target.value })}
                                rows={2}
                                placeholder="추가로 도출된 위험요인"
                              />
                            ) : (
                              <span className="ra-cell-text">{view.extraHazards}</span>
                            )}
                          </div>
                        </div>

                        <div className="ra-foot-row">
                          <div className="ra-foot-label ra-foot-label-2">
                            모니터링
                            <br />
                            실천통보
                            <br />
                            <span className="ra-foot-small">(조치내용/요약, 결과)</span>
                          </div>
                          <div className="ra-foot-value ra-foot-grow">
                            {editing ? (
                              <textarea
                                className="ra-in ra-ta"
                                value={view.monitoringNote}
                                onChange={e => patchDoc({ monitoringNote: e.target.value })}
                                rows={3}
                                placeholder="조치 내용 요약 및 결과"
                              />
                            ) : (
                              <span className="ra-cell-text">{view.monitoringNote}</span>
                            )}
                          </div>
                        </div>

                        <div className="ra-foot-signs">
                          {['안전팀장', '상 무', '부 사장', '사 장'].map(role => (
                            <div className="ra-foot-sign" key={role}>
                              <span className="ra-foot-sign-role">{role}</span>
                              <span className="ra-sign-line">(서명)</span>
                            </div>
                          ))}
                          <div className="ra-foot-sign ra-foot-note">
                            <span className="ra-foot-sign-role">비고</span>
                            {editing ? (
                              <input
                                className="ra-in"
                                value={view.note}
                                onChange={e => patchDoc({ note: e.target.value })}
                              />
                            ) : (
                              <span className="ra-cell-text">{view.note}</span>
                            )}
                          </div>
                        </div>

                        <div className="ra-foot-grade">
                          <span className="ra-foot-grade-title">
                            등급설정 : 하(일상관리), 상(중점관리)
                          </span>
                          <span className="ra-foot-grade-item">가) 강도/빈도 — 1(하) · 2(상)</span>
                          <span className="ra-foot-grade-item">나) 평가합계 — 하(2~3) · 상(4)</span>
                        </div>

                        <div className="ra-foot-foot">
                          <span>양식 SCM-002-1.01</span>
                          <span className="ra-foot-company">구 보 공 영 (주)</span>
                          <span>A4(297x210)</span>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

      {/* ---------- 부속 서식 첨부 (양식 10~13페이지) ---------- */}
      <section className="ra-attach">
        <div className="ra-attach-head">
          <div>
            <h3 className="ra-attach-title">📎 부속 서식 첨부 — 일일 재해 有·無 확인현황</h3>
            <p className="ra-attach-sub">
              양식 10~13페이지(인원별 일일 재해 유무 대장)는 엑셀·한글로 작성해 그대로 올려
              보관합니다.
              <br />
              올린 파일은 이 브라우저에 저장되며, 언제든 내려받아 제출할 수 있습니다.
            </p>
          </div>
          <span className="ra-attach-count">{attachments.length}건</span>
        </div>

        {canManage ? (
          <div className="ra-upload">
            <div className="ra-upload-fields">
              <label className="ra-upload-field">
                <span>문서명</span>
                <input
                  className="ra-in"
                  value={attTitle}
                  onChange={e => setAttTitle(e.target.value)}
                  placeholder="예: 2026년 11월 일일 재해 유무 확인현황"
                />
              </label>
              <label className="ra-upload-field ra-upload-field-narrow">
                <span>해당 연월</span>
                <input
                  className="ra-in"
                  type="month"
                  value={attPeriod}
                  onChange={e => setAttPeriod(e.target.value)}
                />
              </label>
              <label className="ra-upload-field ra-upload-field-file">
                <span>파일 선택</span>
                <input type="file" onChange={handleAttachPick} className="ra-file-input" />
              </label>
              <button
                className="btn btn-sm btn-primary ra-upload-btn"
                onClick={uploadAttachment}
                disabled={attBusy || !attFile}
              >
                {attBusy ? '올리는 중…' : '⬆️ 올리기'}
              </button>
            </div>
            {attFile && (
              <p className="ra-upload-picked">
                선택됨: <b>{attFile.name}</b> ({formatFileSize(attFile.size)})
              </p>
            )}
            {attError && <p className="ra-error">⚠️ {attError}</p>}
          </div>
        ) : (
          <p className="ra-attach-note">관리자 로그인 후 파일을 올릴 수 있습니다.</p>
        )}

        {attachments.length === 0 ? (
          <p className="ra-attach-empty">아직 올린 파일이 없습니다.</p>
        ) : (
          <ul className="ra-attach-list">
            {attachments.map(att => (
              <li className="ra-attach-item" key={att.id}>
                <span className="ra-attach-icon">📄</span>
                <div className="ra-attach-info">
                  <span className="ra-attach-name">{att.title}</span>
                  <span className="ra-attach-meta">
                    {att.period || '-'} · {att.fileName} · {formatFileSize(att.fileSize)} ·{' '}
                    {new Date(att.createdAt).toLocaleDateString('ko-KR')}
                  </span>
                </div>
                <div className="ra-attach-actions">
                  <button className="btn btn-sm" onClick={() => downloadAttachment(att)}>
                    ⬇️ 내려받기
                  </button>
                  {canManage && (
                    <button className="btn btn-sm ra-btn-del" onClick={() => removeAttachment(att)}>
                      삭제
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default RiskAssessment;
