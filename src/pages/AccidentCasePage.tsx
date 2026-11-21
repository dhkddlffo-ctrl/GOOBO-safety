import React, { useEffect, useState } from 'react';
import { getSites, saveAccidentCase } from '../utils/storage';
import { AccidentCase, Site } from '../types';
import AccidentCaseForm from '../components/AccidentCaseForm';
import AccidentReport from '../components/AccidentReport';
import './AccidentCasePage.css';

interface AccidentCasePageProps {
  onNavigate: (page: string) => void;
  preselectedSiteId?: number;
}

/**
 * 전사 사고사례 제출 페이지
 * 작성 서식은 현장별 '사고사례 게시판'과 공용인 AccidentCaseForm 을 씁니다.
 */
const AccidentCasePage: React.FC<AccidentCasePageProps> = ({ onNavigate, preselectedSiteId }) => {
  const [sites, setSites] = useState<Site[]>([]);
  /** 방금 접수한 사고사례 (접수 완료 화면에서 사고보고서 출력용) */
  const [savedCase, setSavedCase] = useState<AccidentCase | null>(null);
  /** 사고보고서 미리보기/인쇄 열림 여부 */
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

  if (savedCase) {
    return (
      <div className="accident-case-page">
        <div className="container">
          <div className="success-message">
            <div className="success-icon">✅</div>
            <h2>사고사례가 접수되었습니다</h2>
            <p>제출하신 사고사례는 안전관리팀에서 검토 후 재발 방지 대책을 수립합니다.</p>
            <p className="success-hint">
              🖨️ 접수된 내용으로 <strong>사고보고서(A4)</strong>를 바로 출력할 수 있습니다.
            </p>

            <div className="success-actions">
              <button className="btn btn-primary" onClick={() => setReportOpen(true)}>
                🖨️ 사고보고서 출력
              </button>
              <button className="btn btn-secondary" onClick={() => onNavigate('home')}>
                홈으로 돌아가기
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setSavedCase(null);
                  setReportOpen(false);
                  setFormKey(k => k + 1);
                }}
              >
                다른 사고사례 제출
              </button>
            </div>
          </div>

          {reportOpen && (
            <AccidentReport accident={savedCase} onClose={() => setReportOpen(false)} autoPrint />
          )}
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
          <p>안전한 작업환경을 위해 사고사례를 공유해주세요</p>
        </div>

        <AccidentCaseForm
          key={formKey}
          sites={sites}
          preselectedSiteId={preselectedSiteId}
          onSaved={handleSaved}
          onCancel={() => onNavigate('home')}
          submitLabel="사고사례 제출"
        />
      </div>
    </div>
  );
};

export default AccidentCasePage;
