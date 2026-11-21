import React, { useCallback, useState } from 'react';
import { AccidentCase } from '../types';
import { saveAccidentCase, updateAccidentCase } from '../utils/storage';
import AccidentCaseBoard from './AccidentCaseBoard';
import AccidentCaseForm from './AccidentCaseForm';
import './AccidentCasePane.css';

interface AccidentCasePaneProps {
  siteId: number;
  siteName: string;
  /** 사고사례가 추가·수정·삭제되어 현장 요약 숫자를 다시 읽어야 할 때 */
  onChanged?: () => void;
}

/**
 * 현장별 사고사례 탭
 *
 * 수시 위험성평가 등록부와 같은 방식입니다.
 * 1) 기본은 **게시판** — 이 현장에 등록된 사고사례 목록.
 * 2) [✍️ 사고사례 작성] 을 누르면 게시판이 **작성 서식**으로 바뀌고,
 *    저장하면 다시 게시판으로 돌아옵니다.
 * 3) 줄을 누르면 사고보고서(A4)가 열립니다.
 */
const AccidentCasePane: React.FC<AccidentCasePaneProps> = ({ siteId, siteName, onChanged }) => {
  /** 작성/수정 중인 사고사례 (null 이면 게시판) */
  const [writing, setWriting] = useState(false);
  /** 수정 대상 (null 이면 신규 작성) */
  const [editing, setEditing] = useState<AccidentCase | null>(null);
  /** 게시판 강제 새로고침용 key */
  const [boardKey, setBoardKey] = useState(0);

  const startWrite = useCallback(() => {
    setEditing(null);
    setWriting(true);
  }, []);

  const startEdit = useCallback((accident: AccidentCase) => {
    setEditing(accident);
    setWriting(true);
  }, []);

  const cancel = useCallback(() => {
    setWriting(false);
    setEditing(null);
  }, []);

  const handleSaved = (accident: AccidentCase) => {
    if (editing) {
      /* 수정 모드 — 같은 id 의 기록을 덮어씁니다. */
      updateAccidentCase(accident.id, accident);
    } else {
      /* 신규 작성 — 게시판(gubo_accident_cases)에 등록합니다. */
      saveAccidentCase(accident);
    }
    setWriting(false);
    setEditing(null);
    setBoardKey(k => k + 1);
    onChanged?.();
  };

  if (writing) {
    return (
      <div className="acp-write">
        <div className="acp-write-head">
          <div className="acp-write-head-text">
            <strong>{editing ? '사고사례 수정' : '사고사례 작성'}</strong>
            <span>
              {siteName} · 작성한 사고사례는 이 현장 게시판에 등록되고 사고보고서(A4)로 인쇄할 수
              있습니다.
            </span>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={cancel}>
            ← 게시판으로
          </button>
        </div>

        <AccidentCaseForm
          key={editing ? `edit-${editing.id}` : 'new'}
          sites={[]}
          preselectedSiteId={siteId}
          lockSite
          lockSiteName={siteName}
          initialCase={editing ?? undefined}
          onSaved={handleSaved}
          onCancel={cancel}
        />
      </div>
    );
  }

  return (
    <AccidentCaseBoard
      key={boardKey}
      siteId={siteId}
      siteName={siteName}
      onWrite={startWrite}
      onEdit={startEdit}
    />
  );
};

export default AccidentCasePane;
