import React, { useEffect, useState } from 'react';
import { getSites, saveAccidentCase } from '../utils/storage';
import { AccidentCase, AccidentCaseKind, Site } from '../types';
import { getCaseKind } from '../utils/diseaseOpinion';
import AccidentCaseForm from '../components/AccidentCaseForm';
import DiseaseOpinionForm from '../components/DiseaseOpinionForm';
import AccidentReport from '../components/AccidentReport';
import DiseaseOpinionReport from '../components/DiseaseOpinionReport';
/* 작성 유형 선택 카드(.acp-kinds)는 현장 게시판과 공용 스타일입니다. */
import '../components/AccidentCasePane.css';
import './AccidentCasePage.css';

interface AccidentCasePageProps {
  onNavigate: (page: string) => void;
  preselectedSiteId?: number;
}

/**
 * 전사 사고사례 제출 페이지
 *
 * [작성 유형]을 먼저 고릅니다.
 *  · 업무상 사고 → AccidentCaseForm (회사 서식 사고보고서 등) — 기존 방식 그대로
 *  · 업무상 질병 → DiseaseOpinionForm (보험가입자 의견서 별지 제4호의2)
 */
const AccidentCasePage: React.FC<AccidentCasePageProps> = ({ onNavigate, preselectedSiteId }) => {
  const [sites, setSites] = useState<Site[]>([]);
  /** 고른 작성 유형 (null 이면 유형 선택 화면) */
  const [kind, setKind] = useState<AccidentCaseKind | null>(null);
  /** 방금 접수한 사고사례 (접수 완료 화면에서 서류 출력용) */
  const [savedCase, setSavedCase] = useState<AccidentCase | null>(null);
  /** 서류 미리보기/인쇄 열림 여부 */
  const [reportOpen, setReportOpen] = useState(false);
  /** 작성 폼을 새로 띄우기 위한 key (다른 사고사례 제출 시 초기화) */
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    setSites(getSites().filter(s => s.status === 'active'));
  }, []);

  const handleSaved = (accidentCase: AccidentCase) => {
    saveAccidentCase(accidentCase);
    setSavedCase(accidentCase);
    setReportOpen(true);
  };

  /* ---------- 접수 완료 ---------- */
  if (savedCase) {
    const isSick = getCaseKind(savedCase) === '질병';
    return (
      <div className="accident-case-page">
        <div className="container">
          <div className="success-message">
            <div className="success-icon">✅</div>
            <h2>{isSick ? '질병 사례가 접수되었습니다' : '사고사례가 접수되었습니다'}</h2>
            <p>제출하신 사례는 안전관리팀에서 검토 후 재발 방지 대책을 수립합니다.</p>
            <p className="success-hint">
              🖨️ 접수된 내용으로{' '}
              <strong>{isSick ? '보험가입자 의견서(A4 2장)' : '사고보고서(A4)'}</strong>를 바로
              출력할 수 있습니다.
            </p>

            <div className="success-actions">
              <button className="btn btn-primary" onClick={() => setReportOpen(true)}>
                🖨️ {isSick ? '보험가입자 의견서 출력' : '사고보고서 출력'}
              </button>
              <button className="btn btn-secondary" onClick={() => onNavigate('home')}>
                홈으로 돌아가기
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setSavedCase(null);
                  setReportOpen(false);
                  setKind(null);
                  setFormKey(k => k + 1);
                }}
              >
                다른 사례 제출
              </button>
            </div>
          </div>

          {reportOpen &&
            (isSick ? (
              <DiseaseOpinionReport
                accident={savedCase}
                onClose={() => setReportOpen(false)}
                autoPrint
              />
            ) : (
              <AccidentReport accident={savedCase} onClose={() => setReportOpen(false)} autoPrint />
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className="accident-case-page">
      <div className="container">
        <div className="page-header">
          <button className="back-button" onClick={() => onNavigate('home')}>
            ← 뒤로가기
          </button>
          <h1>사고사례 제출</h1>
          <p>안전한 작업환경을 위해 사고·질병 사례를 공유해주세요</p>
        </div>

        {/* ---------- 작성 유형 선택 ---------- */}
        {!kind && (
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
        )}

        {kind === '사고' && (
          <AccidentCaseForm
            key={formKey}
            sites={sites}
            preselectedSiteId={preselectedSiteId}
            onSaved={handleSaved}
            onCancel={() => setKind(null)}
            submitLabel="사고사례 제출"
          />
        )}

        {kind === '질병' && (
          <DiseaseOpinionForm
            key={formKey}
            sites={sites}
            preselectedSiteId={preselectedSiteId}
            onSaved={handleSaved}
            onCancel={() => setKind(null)}
            submitLabel="질병 사례 제출"
          />
        )}
      </div>
    </div>
  );
};

export default AccidentCasePage;
