import React, { useEffect, useMemo, useState } from 'react';
import { RiskAssessment } from '../types';
import {
  evaluateRow,
  getPublishedRiskAssessments,
  summarizeAssessment,
} from '../utils/riskAssessmentStorage';

/** 불러오는 방식 — 현재 서식을 비우고 채우기 / 아래에 이어 붙이기 */
export type RiskImportMode = 'replace' | 'append';

export interface RiskImportChoice {
  source: RiskAssessment;
  mode: RiskImportMode;
  /** 조치예정일·조치완료일을 비우고 가져올지 (새 주기 작성 시 유용) */
  clearActionDates: boolean;
}

interface RiskImportDialogProps {
  /** 지금 작성 중인 현장 */
  siteId: number;
  /** 지금 고치고 있는 평가서 id — 목록에서 뺍니다 */
  excludeId?: string;
  onClose: () => void;
  onImport: (choice: RiskImportChoice) => void;
}

/** yyyy-mm-dd → yyyy.mm.dd */
const fmtDate = (ymd: string): string => (ymd ? ymd.replace(/-/g, '.') : '');

/**
 * 이전 작성글 불러오기
 *
 * 2주마다 반복해서 쓰는 서식이라, 지난번에 작성한 위험요인을 그대로 이어받아
 * 조금만 고쳐 쓰는 경우가 많습니다. 그럴 때 지난 등록부를 골라
 * **현재 서식을 비우고 채우거나**, **아래에 이어 붙일** 수 있게 합니다.
 *
 * 한 현장의 지난 자료뿐 아니라 **다른 현장 자료**도 골라 올 수 있습니다.
 * (같은 공정을 여러 현장에서 쓰는 경우)
 */
const RiskImportDialog: React.FC<RiskImportDialogProps> = ({
  siteId,
  excludeId,
  onClose,
  onImport,
}) => {
  const [crossSite, setCrossSite] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [mode, setMode] = useState<RiskImportMode>('replace');
  const [clearActionDates, setClearActionDates] = useState(true);

  /* ESC 로 닫기 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /**
   * 목록 — 위험요인이 하나라도 적힌 지난 등록부만 보여줍니다.
   * (빈 서식까지 목록에 뜨면 고르기 어렵습니다)
   */
  const items = useMemo(() => {
    const all = getPublishedRiskAssessments(crossSite ? undefined : siteId);
    return all
      .filter(a => a.id !== excludeId)
      .map(a => ({ doc: a, summary: summarizeAssessment(a) }))
      .filter(item => item.summary.filled > 0)
      .sort((a, b) => (a.doc.writtenAt < b.doc.writtenAt ? 1 : -1));
  }, [siteId, excludeId, crossSite]);

  const selected = items.find(item => item.doc.id === selectedId) ?? null;

  /** 고른 자료의 위험요인 미리보기 (앞의 3건) */
  const preview = useMemo(() => {
    if (!selected) return [];
    return selected.doc.rows
      .filter(row => row.hazard.trim() !== '')
      .slice(0, 3)
      .map(row => ({ id: row.id, hazard: row.hazard.trim(), grade: evaluateRow(row).grade }));
  }, [selected]);

  const submit = () => {
    if (!selected) return;
    onImport({ source: selected.doc, mode, clearActionDates });
  };

  return (
    <div
      className="ra-imp-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="이전 작성글 불러오기"
    >
      <div className="ra-imp-modal ra-imp">
        {/* ---------- 머리글 ---------- */}
        <div className="ra-imp-head">
          <div>
            <h3 className="ra-imp-title">📋 이전 작성글 불러오기</h3>
            <p className="ra-imp-sub">
              지난번에 작성한 위험성평가표의 <b>위험요인·개선조치계획</b>을 그대로 가져옵니다.
              <br />
              불러온 뒤 이번 주기에 맞게 고쳐서 쓰면 됩니다.
            </p>
          </div>
          <button type="button" className="ra-imp-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        {/* ---------- 범위 ---------- */}
        <label className="ra-imp-cross">
          <input
            type="checkbox"
            checked={crossSite}
            onChange={e => {
              setCrossSite(e.target.checked);
              setSelectedId('');
            }}
          />
          <span>
            다른 현장 자료도 보기
            <span className="ra-imp-cross-hint">
              같은 공정을 여러 현장에서 쓴다면 이전 현장 자료를 그대로 가져올 수 있습니다.
            </span>
          </span>
        </label>

        {/* ---------- 목록 ---------- */}
        {items.length === 0 ? (
          <div className="ra-imp-empty">
            <p className="ra-imp-empty-title">불러올 지난 작성글이 없습니다.</p>
            <p className="ra-imp-empty-sub">
              {crossSite
                ? '아직 위험요인을 적어 저장한 등록부가 없습니다.'
                : '이 현장에는 아직 저장된 등록부가 없습니다. 위의 “다른 현장 자료도 보기”를 켜 보세요.'}
            </p>
          </div>
        ) : (
          <ul className="ra-imp-list">
            {items.map(item => {
              const active = item.doc.id === selectedId;
              return (
                <li key={item.doc.id}>
                  <button
                    type="button"
                    className={`ra-imp-item${active ? ' active' : ''}`}
                    onClick={() => setSelectedId(item.doc.id)}
                    aria-pressed={active}
                  >
                    <span className="ra-imp-item-head">
                      <span className="ra-imp-item-date">
                        {fmtDate(item.doc.writtenAt) || '날짜 없음'}
                      </span>
                      <span className="ra-imp-item-author">
                        {item.doc.author || '작성자 미입력'}
                      </span>
                      {crossSite && <span className="ra-imp-item-site">{item.doc.siteName}</span>}
                    </span>
                    <span className="ra-imp-item-counts">
                      위험요인 <b>{item.summary.filled}</b>건
                      {item.summary.high > 0 && (
                        <span className="ra-imp-item-high"> · 상 {item.summary.high}건</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* ---------- 미리보기 ---------- */}
        {selected && (
          <div className="ra-imp-preview">
            <span className="ra-imp-preview-title">미리보기</span>
            <ul className="ra-imp-preview-list">
              {preview.map(row => (
                <li key={row.id}>
                  {row.grade && (
                    <span className={`ra-grade ${row.grade === '상' ? 'high' : 'low'}`}>
                      {row.grade}
                    </span>
                  )}
                  <span className="ra-imp-preview-text">{row.hazard}</span>
                </li>
              ))}
            </ul>
            {selected.summary.filled > preview.length && (
              <span className="ra-imp-preview-more">
                외 {selected.summary.filled - preview.length}건
              </span>
            )}
          </div>
        )}

        {/* ---------- 방식 ---------- */}
        <fieldset className="ra-imp-modes" disabled={!selected}>
          <legend className="ra-imp-legend">불러오는 방식</legend>
          <label className="ra-imp-mode">
            <input
              type="radio"
              name="ra-imp-mode"
              checked={mode === 'replace'}
              onChange={() => setMode('replace')}
            />
            <span>
              <b>현재 서식을 비우고 채우기</b>
              <span className="ra-imp-mode-hint">지금 입력한 행은 지워집니다.</span>
            </span>
          </label>
          <label className="ra-imp-mode">
            <input
              type="radio"
              name="ra-imp-mode"
              checked={mode === 'append'}
              onChange={() => setMode('append')}
            />
            <span>
              <b>아래에 이어 붙이기</b>
              <span className="ra-imp-mode-hint">지금 입력한 행 아래로 이어서 붙습니다.</span>
            </span>
          </label>
        </fieldset>

        <label className="ra-imp-cross">
          <input
            type="checkbox"
            checked={clearActionDates}
            onChange={e => setClearActionDates(e.target.checked)}
            disabled={!selected}
          />
          <span>
            조치예정일 · 조치완료일은 비우고 가져오기
            <span className="ra-imp-cross-hint">
              지난 주기의 날짜가 그대로 남으면 이번 주기 점검에 혼동이 생깁니다.
            </span>
          </span>
        </label>

        {/* ---------- 하단 버튼 ---------- */}
        <div className="ra-imp-foot">
          <span className="ra-imp-foot-note">
            {selected
              ? `${fmtDate(selected.doc.writtenAt)} 작성 · 위험요인 ${selected.summary.filled}건`
              : '불러올 글을 하나 골라주세요.'}
          </span>
          <div className="ra-imp-foot-right">
            <button type="button" className="btn btn-sm" onClick={onClose}>
              취소
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={submit}
              disabled={!selected}
            >
              📋 불러오기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RiskImportDialog;
