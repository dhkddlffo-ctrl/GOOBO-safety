import React, { useCallback, useState } from 'react';
import { AccidentCase, AccidentCaseKind } from '../types';
import { saveAccidentCase, updateAccidentCase } from '../utils/storage';
import { getCaseKind } from '../utils/diseaseOpinion';
import AccidentCaseBoard from './AccidentCaseBoard';
import AccidentCaseForm from './AccidentCaseForm';
import DiseaseOpinionForm from './DiseaseOpinionForm';
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
 * 2) [✍️ 사고사례 작성] 을 누르면 **작성 유형**(업무상 사고 / 업무상 질병)을 먼저 고르고,
 *    유형에 맞는 작성 서식으로 바뀝니다.
 *      · 업무상 사고  → 회사 서식(사고원인 및 대책 보고서 등) — 기존 방식 그대로
 *      · 업무상 질병  → 근로복지공단 「보험가입자 의견서」(별지 제4호의2) 서식
 * 3) 줄을 누르면 유형에 맞는 서류(A4)가 열립니다.
 */
const AccidentCasePane: React.FC<AccidentCasePaneProps> = ({ siteId, siteName, onChanged }) => {
  /** 작성/수정 중인 사고사례 (null 이면 게시판) */
  const [writing, setWriting] = useState(false);
  /** 수정 대상 (null 이면 신규 작성) */
  const [editing, setEditing] = useState<AccidentCase | null>(null);
  /** 작성 유형 — 신규 작성 시에는 고른 뒤에 서식이 열립니다. */
  const [kind, setKind] = useState<AccidentCaseKind | null>(null);
  /** 게시판 강제 새로고침용 key */
  const [boardKey, setBoardKey] = useState(0);

  /** [작성] — 유형 선택 화면을 먼저 엽니다. */
  const startWrite = useCallback(() => {
    setEditing(null);
    setKind(null);
    setWriting(true);
  }, []);

  /** 기존 사례 수정 — 저장된 유형의 서식으로 바로 엽니다. */
  const startEdit = useCallback((accident: AccidentCase) => {
    setEditing(accident);
    setKind(getCaseKind(accident));
    setWriting(true);
  }, []);

  const cancel = useCallback(() => {
    setWriting(false);
    setEditing(null);
    setKind(null);
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
    setKind(null);
    setBoardKey(k => k + 1);
    onChanged?.();
  };

  /* ---------- ① 작성 유형 선택 ---------- */
  if (writing && !kind) {
    return (
      <div className="acp-write">
        <div className="acp-write-head">
          <div className="acp-write-head-text">
            <strong>사고사례 작성</strong>
            <span>
              {siteName} · 작성할 사례의 유형을 먼저 선택해 주세요. 유형에 따라 작성 서식과 인쇄
              서류가 달라집니다.
            </span>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={cancel}>
            ← 게시판으로
          </button>
        </div>

        <div className="acp-kinds">
          <button type="button" className="acp-kind" onClick={() => setKind('사고')}>
            <span className="acp-kind-badge is-accident">업무상 사고</span>
            <strong className="acp-kind-title">사고 사례 작성</strong>
            <span className="acp-kind-desc">
              떨어짐 · 끼임 · 부딪힘 등 재해를 회사 서식으로 기록합니다.
              <br />
              사고원인 및 대책 보고서 · 목격자 진술서 · 재해 상황도로 인쇄됩니다.
            </span>
            <span className="acp-kind-go">기존 방식 그대로 →</span>
          </button>

          <button type="button" className="acp-kind" onClick={() => setKind('질병')}>
            <span className="acp-kind-badge is-disease">업무상 질병</span>
            <strong className="acp-kind-title">질병 사례 작성</strong>
            <span className="acp-kind-desc">
              요추 추간판장애 등 업무상 질병 신청에 대한 사업주 의견을 기록합니다.
              <br />
              근로복지공단 「보험가입자 의견서」(별지 제4호의2)로 인쇄됩니다.
            </span>
            <span className="acp-kind-go">보험가입자 의견서 →</span>
          </button>
        </div>
      </div>
    );
  }

  /* ---------- ② 작성 서식 ---------- */
  if (writing && kind) {
    const isSick = kind === '질병';
    return (
      <div className="acp-write">
        <div className="acp-write-head">
          <div className="acp-write-head-text">
            <strong>
              {isSick ? '질병 사례' : '사고 사례'} {editing ? '수정' : '작성'}
            </strong>
            <span>
              {siteName} ·{' '}
              {isSick
                ? '작성한 내용은 이 현장 게시판에 등록되고 보험가입자 의견서(A4 2장)로 인쇄할 수 있습니다.'
                : '작성한 사고사례는 이 현장 게시판에 등록되고 사고보고서(A4)로 인쇄할 수 있습니다.'}
            </span>
          </div>
          <div className="acp-write-head-btns">
            {!editing && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setKind(null)}
              >
                ← 유형 다시 선택
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={cancel}>
              ← 게시판으로
            </button>
          </div>
        </div>

        {isSick ? (
          <DiseaseOpinionForm
            key={editing ? `edit-${editing.id}` : 'new-disease'}
            sites={[]}
            preselectedSiteId={siteId}
            lockSite
            lockSiteName={siteName}
            initialCase={editing ?? undefined}
            onSaved={handleSaved}
            onCancel={cancel}
          />
        ) : (
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
        )}
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
