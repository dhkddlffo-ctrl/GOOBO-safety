import React, { useEffect, useState } from 'react';
import { AccidentCase } from '../types';
import { deleteAccidentDraft, getAccidentDraftsForSite, getSites } from '../utils/storage';
import './AccidentDraftDialog.css';

interface AccidentDraftDialogProps {
  /** 현장 고정 모드일 때 현장 ID (없으면 전체) */
  siteId?: number;
  onClose: () => void;
  /** 선택한 임시저장본을 이어서 작성 */
  onOpen: (draft: AccidentCase) => void;
  /** 목록이 바뀌었을 때 (삭제 등) */
  onChanged?: () => void;
}

/** yyyy-mm-ddThh:mm → yyyy.mm.dd hh:mm */
const fmtDateTime = (iso?: string): string => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
};

/**
 * 사고사례 임시저장 불러오기
 *
 * [💾 임시저장]으로 저장해 둔, **아직 게시판에 올리지 않은** 작성 중인 사고사례를 골라
 * 이어서 작성합니다. 게시판에는 나오지 않으므로 여기서만 볼 수 있습니다.
 */
const AccidentDraftDialog: React.FC<AccidentDraftDialogProps> = ({
  siteId,
  onClose,
  onOpen,
  onChanged,
}) => {
  const [items, setItems] = useState<AccidentCase[]>(() => getAccidentDraftsForSite(siteId));
  const [selectedId, setSelectedId] = useState('');
  const siteNames = new Map(getSites().map(s => [s.id, s.name] as const));

  /* ESC 로 닫기 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const selected = items.find(d => d.id === selectedId) ?? null;

  const remove = (draft: AccidentCase) => {
    if (
      !window.confirm(
        `임시저장본을 삭제할까요?\n${draft.location || '장소 미입력'} · ${fmtDateTime(
          draft.draftUpdatedAt,
        )}\n삭제한 내용은 되돌릴 수 없습니다.`,
      )
    ) {
      return;
    }
    deleteAccidentDraft(draft.id);
    setItems(getAccidentDraftsForSite(siteId));
    if (selectedId === draft.id) setSelectedId('');
    onChanged?.();
  };

  /** 저장된 내용이 얼마나 채워졌는지 */
  const filledOf = (draft: AccidentCase): number =>
    [
      draft.accidentDate,
      draft.location,
      draft.description,
      draft.cause,
      draft.preventiveMeasures,
      draft.actionTaken,
      draft.reporterName,
    ].filter(Boolean).length;

  return (
    <div className="acd-overlay" role="dialog" aria-modal="true" aria-label="임시저장 불러오기">
      <div className="acd-modal">
        <div className="acd-head">
          <div>
            <h3 className="acd-title">📂 임시저장 불러오기</h3>
            <p className="acd-sub">
              <b>아직 게시판에 올리지 않은</b> 작성 중인 사고사례입니다.
              <br />
              이어서 작성한 뒤 <b>[사고사례 등록]</b>을 누르면 게시판에 등록됩니다.
            </p>
          </div>
          <button type="button" className="acd-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        {items.length === 0 ? (
          <div className="acd-empty">
            <p className="acd-empty-title">임시저장된 사고사례가 없습니다.</p>
            <p className="acd-empty-sub">
              작성 중 <b>[💾 임시저장]</b>을 누르면 여기에 쌓입니다.
            </p>
          </div>
        ) : (
          <ul className="acd-list">
            {items.map(draft => {
              const active = draft.id === selectedId;
              const siteLabel = draft.siteName || siteNames.get(draft.siteId) || '현장 미지정';
              return (
                <li key={draft.id}>
                  <button
                    type="button"
                    className={`acd-item${active ? ' active' : ''}`}
                    onClick={() => setSelectedId(draft.id)}
                    aria-pressed={active}
                  >
                    <span className="acd-item-head">
                      <span className="acd-item-title">
                        {draft.accidentType} · {draft.location || '장소 미입력'}
                      </span>
                      <span className="acd-item-site">{siteLabel}</span>
                    </span>
                    <span className="acd-item-meta">
                      사고 발생일 {draft.accidentDate ? fmtDateTime(draft.accidentDate) : '미입력'}
                      {draft.severity ? ` · ${draft.severity}` : ''}
                    </span>
                    <span className="acd-item-meta">
                      마지막 임시저장 <b>{fmtDateTime(draft.draftUpdatedAt)}</b> · 입력{' '}
                      {filledOf(draft)}
                      /7
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="acd-foot">
          <span className="acd-foot-note">
            {selected
              ? `${selected.accidentType} · ${selected.location || '장소 미입력'}`
              : `${items.length}건의 임시저장본이 있습니다.`}
          </span>
          <div className="acd-foot-right">
            {selected && (
              <button
                type="button"
                className="btn btn-sm acd-btn-del"
                onClick={() => remove(selected)}
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
              onClick={() => selected && onOpen(selected)}
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

export default AccidentDraftDialog;
