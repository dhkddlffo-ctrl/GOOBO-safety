import React, { useEffect, useMemo, useState } from 'react';
import { RiskAssessment } from '../types';
import {
  deleteRiskAssessment,
  getDraftRiskAssessments,
  summarizeAssessment,
} from '../utils/riskAssessmentStorage';

interface DraftLoadDialogProps {
  siteId: number;
  onClose: () => void;
  /** 임시저장본을 이어서 작성합니다. */
  onOpen: (id: string) => void;
  /** 목록이 바뀌었을 때 (삭제 등) 바깥 목록을 다시 읽게 합니다. */
  onChanged?: () => void;
}

/** yyyy-mm-dd → yyyy.mm.dd */
const fmtDate = (ymd?: string): string => (ymd ? ymd.replace(/-/g, '.') : '');

/** ISO → yyyy.mm.dd hh:mm */
const fmtDateTime = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
};

/**
 * 임시저장 불러오기
 *
 * [💾 임시저장]으로 저장해 둔, **아직 게시판에 올리지 않은** 작성 중인 글을 골라
 * 이어서 작성합니다. 게시판 목록에는 나오지 않으므로 여기서만 볼 수 있습니다.
 */
const DraftLoadDialog: React.FC<DraftLoadDialogProps> = ({
  siteId,
  onClose,
  onOpen,
  onChanged,
}) => {
  const [items, setItems] = useState<RiskAssessment[]>(() => getDraftRiskAssessments(siteId));
  const [selectedId, setSelectedId] = useState('');

  /* ESC 로 닫기 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rows = useMemo(
    () => items.map(doc => ({ doc, summary: summarizeAssessment(doc) })),
    [items],
  );

  const selected = rows.find(r => r.doc.id === selectedId) ?? null;

  const remove = (doc: RiskAssessment) => {
    if (
      !window.confirm(
        `${fmtDate(doc.writtenAt)} 임시저장본을 삭제할까요?\n삭제한 내용은 되돌릴 수 없습니다.`,
      )
    ) {
      return;
    }
    deleteRiskAssessment(doc.id);
    const next = getDraftRiskAssessments(siteId);
    setItems(next);
    if (selectedId === doc.id) setSelectedId('');
    onChanged?.();
  };

  return (
    <div className="ra-imp-overlay" role="dialog" aria-modal="true" aria-label="임시저장 불러오기">
      <div className="ra-imp-modal ra-imp">
        {/* ---------- 머리글 ---------- */}
        <div className="ra-imp-head">
          <div>
            <h3 className="ra-imp-title">📂 임시저장 불러오기</h3>
            <p className="ra-imp-sub">
              <b>아직 게시판에 올리지 않은</b> 작성 중인 글입니다.
              <br />
              이어서 쓰고, 다 되면 마법사에서 <b>[📝 게시글 등록]</b>을 누르세요.
            </p>
          </div>
          <button type="button" className="ra-imp-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        {/* ---------- 목록 ---------- */}
        {rows.length === 0 ? (
          <div className="ra-imp-empty">
            <p className="ra-imp-empty-title">임시저장된 글이 없습니다.</p>
            <p className="ra-imp-empty-sub">
              [✍️ 위험성평가 작성]으로 새로 쓰다가 [💾 임시저장]을 누르면 여기에 쌓입니다.
            </p>
          </div>
        ) : (
          <ul className="ra-imp-list">
            {rows.map(({ doc, summary }) => {
              const active = doc.id === selectedId;
              return (
                <li key={doc.id}>
                  <button
                    type="button"
                    className={`ra-imp-item${active ? ' active' : ''}`}
                    onClick={() => setSelectedId(doc.id)}
                    aria-pressed={active}
                  >
                    <span className="ra-imp-item-head">
                      <span className="ra-imp-item-date">
                        {doc.constructionName || '제목 없음'}
                      </span>
                      <span className="ra-imp-item-author">{doc.author || '작성자 미입력'}</span>
                    </span>
                    <span className="ra-imp-item-counts">
                      위험요인 <b>{summary.filled}</b>건
                      {summary.high > 0 && (
                        <span className="ra-imp-item-high"> · 상 {summary.high}건</span>
                      )}
                      {doc.writtenAt && <> · 작성일 {fmtDate(doc.writtenAt)}</>}
                    </span>
                    <span className="ra-imp-item-counts">
                      마지막 임시저장 {fmtDateTime(doc.updatedAt) || '-'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* ---------- 하단 버튼 ---------- */}
        <div className="ra-imp-foot">
          <span className="ra-imp-foot-note">
            {selected
              ? `${selected.doc.constructionName || '제목 없음'} · 위험요인 ${selected.summary.filled}건`
              : `${rows.length}건의 임시저장본이 있습니다.`}
          </span>
          <div className="ra-imp-foot-right">
            {selected && (
              <button
                type="button"
                className="btn btn-sm ra-btn-del"
                onClick={() => remove(selected.doc)}
              >
                🗑️ 삭제
              </button>
            )}
            <button type="button" className="btn btn-sm" onClick={onClose}>
              취소
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => selected && onOpen(selected.doc.id)}
              disabled={!selected}
            >
              📂 이어서 작성
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DraftLoadDialog;
