import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AccidentCase } from '../types';
import {
  formatDateKo,
  formatDateTimeKo,
  formatPrintedAt,
  formatReportNo,
  formatTenure,
  formatVictim,
} from '../utils/accidentReport';
import './AccidentReport.css';

interface AccidentReportProps {
  /** 보고서로 출력할 사고사례 */
  accident: AccidentCase;
  /** 닫기 */
  onClose: () => void;
  /** 열리자마자 인쇄 대화상자를 띄울지 여부 */
  autoPrint?: boolean;
}

const SEVERITY_CLASS: Record<AccidentCase['severity'], string> = {
  무재해: 'ar-sev-none',
  경상: 'ar-sev-mild',
  중상: 'ar-sev-serious',
  사망: 'ar-sev-dead',
};

/**
 * 사고보고서 (A4 세로 인쇄)
 *
 * body 바로 아래로 포털 렌더링해서 인쇄 시 다른 화면 요소를
 * 완전히 배제합니다. (중첩된 모달 안에서도 안전)
 */
const AccidentReport: React.FC<AccidentReportProps> = ({ accident, onClose, autoPrint = false }) => {
  const host = useMemo(() => {
    const el = document.createElement('div');
    el.className = 'accident-report-portal';
    return el;
  }, []);

  useEffect(() => {
    document.body.appendChild(host);
    return () => {
      if (host.parentNode) host.parentNode.removeChild(host);
    };
  }, [host]);

  /* ESC 로 닫기 */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  /* 자동 인쇄: 페인트 완료 후 print() 호출 */
  useEffect(() => {
    if (!autoPrint) return;
    const raf = requestAnimationFrame(() => {
      try {
        window.print();
      } catch {
        /* 인쇄 대화상자를 열 수 없는 환경(헤드리스 등)에서는 미리보기만 유지 */
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [autoPrint]);

  const handlePrint = () => {
    try {
      window.print();
    } catch {
      /* noop */
    }
  };

  const hasInvestigation = Boolean(accident.investigationResult || accident.completedAt);
  const photos = [...(accident.images ?? []), ...(accident.investigationImages ?? [])].slice(0, 4);
  /* 재해 발생일·장소는 미입력 시 사고 정보로 대체 */
  const disasterDate = accident.disasterDate || accident.accidentDate;
  const disasterPlace = accident.disasterPlace || accident.location;
  const witnesses = accident.witnesses ?? [];
  const hasExtraVictim = Boolean(
    accident.victimJobType ||
      accident.victimMaritalStatus ||
      accident.victimFamily ||
      accident.victimPhone
  );

  const report = (
    <div className="ar-overlay">
      <div className="ar-toolbar">
        <div className="ar-toolbar-label">
          🖨️ 사고보고서 미리보기 · A4 세로 1매
        </div>
        <div className="ar-toolbar-actions">
          <button type="button" className="ar-btn ar-btn-primary" onClick={handlePrint}>
            인쇄 / PDF 저장
          </button>
          <button type="button" className="ar-btn ar-btn-ghost" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>

      <div className="ar-scroll">
        <div className="ar-sheet">
          {/* ---------- 표제부 ---------- */}
          <div className="ar-head">
            <div className="ar-head-left">
              <span className="ar-company">구보공영(주)</span>
              <span className="ar-dept">안전보건관리팀</span>
            </div>
            <h1 className="ar-title">사고보고서</h1>
            <div className="ar-head-right">
              <div className="ar-docno-label">문서번호</div>
              <div className="ar-docno">{formatReportNo(accident)}</div>
            </div>
          </div>

          {/* ---------- 기본 정보 ---------- */}
          <table className="ar-table">
            <tbody>
              <tr>
                <th>현장명</th>
                <td colSpan={3}>{accident.siteName}</td>
              </tr>
              <tr>
                <th>발생 일시</th>
                <td>{formatDateTimeKo(accident.accidentDate)}</td>
                <th>발생 장소</th>
                <td>{accident.location || '-'}</td>
              </tr>
              <tr>
                <th>사고 유형</th>
                <td>{accident.accidentType}</td>
                <th>심각도</th>
                <td>
                  <span className={`ar-sev ${SEVERITY_CLASS[accident.severity]}`}>
                    {accident.severity}
                  </span>
                </td>
              </tr>
              <tr>
                <th>사업재해조사표</th>
                <td>{accident.disasterReportSubmitted || '미제출'}</td>
                <th>사고 처리결과</th>
                <td>{accident.treatmentResult || '미처리'}</td>
              </tr>
              <tr>
                <th>보고자</th>
                <td>
                  {accident.reporterName || '-'}
                  {accident.reporterPhone ? ` (${accident.reporterPhone})` : ''}
                </td>
                <th>제출일</th>
                <td>{formatDateTimeKo(accident.createdAt)}</td>
              </tr>
            </tbody>
          </table>

          {/* ---------- 피해자 정보 ---------- */}
          <h2 className="ar-subtitle">피해자 정보</h2>
          <table className="ar-table">
            <tbody>
              <tr>
                <th>성명</th>
                <td>{formatVictim(accident)}</td>
                <th>입사일</th>
                <td>{formatDateKo(accident.victimHireDate)}</td>
              </tr>
              <tr>
                <th>근속기간</th>
                <td colSpan={3}>
                  {formatTenure(accident.victimHireDate, accident.accidentDate)}
                  <span className="ar-note"> (사고 발생일 기준)</span>
                </td>
              </tr>
              {hasExtraVictim && (
                <>
                  <tr>
                    <th>직종</th>
                    <td>{accident.victimJobType || '-'}</td>
                    <th>결혼여부</th>
                    <td>{accident.victimMaritalStatus || '-'}</td>
                  </tr>
                  <tr>
                    <th>가족관계</th>
                    <td>{accident.victimFamily || '-'}</td>
                    <th>연락처</th>
                    <td>{accident.victimPhone || '-'}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>

          {/* ---------- 재해(사고) 상황 ---------- */}
          <h2 className="ar-subtitle">재해(사고) 상황</h2>
          <table className="ar-table">
            <tbody>
              <tr>
                <th>재해 발생일</th>
                <td>{formatDateKo(disasterDate)}</td>
                <th>재해 발생 장소</th>
                <td>{disasterPlace || '-'}</td>
              </tr>
            </tbody>
          </table>

          {accident.situationDiagram && (
            <div className="ar-diagram">
              <h3>재해 상황도</h3>
              <img src={accident.situationDiagram} alt="재해 상황도" />
              {accident.situationNote && (
                <p className="ar-diagram-note">{accident.situationNote}</p>
              )}
            </div>
          )}

          {!accident.situationDiagram && accident.situationNote && (
            <div className="ar-block">
              <h3>상황 설명</h3>
              <p>{accident.situationNote}</p>
            </div>
          )}

          {/* ---------- 본문 ---------- */}
          <h2 className="ar-subtitle">사고 내용</h2>
          <div className="ar-block">
            <h3>1. 사고 경위</h3>
            <p>{accident.description || '-'}</p>
          </div>
          <div className="ar-block">
            <h3>2. 사고 원인</h3>
            <p>{accident.cause || '-'}</p>
          </div>
          <div className="ar-block">
            <h3>3. 재발 방지 대책</h3>
            <p>{accident.preventiveMeasures || '-'}</p>
          </div>

          {hasInvestigation && (
            <div className="ar-block">
              <h3>4. 조사 결과</h3>
              <p>{accident.investigationResult || '조사 결과가 입력되지 않았습니다.'}</p>
              {accident.completedAt && (
                <p className="ar-block-meta">조사 완료일: {formatDateKo(accident.completedAt)}</p>
              )}
            </div>
          )}

          {/* ---------- 사진 ---------- */}
          {photos.length > 0 && (
            <div className="ar-photos">
              <h3>현장 사진</h3>
              <div className="ar-photo-grid">
                {photos.map((src, idx) => (
                  <figure key={idx} className="ar-photo">
                    <img src={src} alt={`사고 현장 사진 ${idx + 1}`} />
                    <figcaption>사진 {idx + 1}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          )}

          {/* ---------- 목격자 진술서 ---------- */}
          {witnesses.length > 0 && (
            <div className="ar-witness">
              <h3>목격자 진술서</h3>
              {witnesses.map((w, idx) => (
                <div key={w.id} className="ar-witness-item">
                  <div className="ar-witness-head">
                    <span className="ar-witness-no">진술 {idx + 1}</span>
                    <strong>{w.name}</strong>
                    {w.jobType && <span className="ar-note">직종: {w.jobType}</span>}
                    {w.relation && <span className="ar-note">관계: {w.relation}</span>}
                    {w.phone && <span className="ar-note">연락처: {w.phone}</span>}
                    {w.statementDate && (
                      <span className="ar-note">작성일: {formatDateKo(w.statementDate)}</span>
                    )}
                  </div>
                  <p className="ar-witness-text">{w.statement}</p>
                  <div className="ar-witness-sign">
                    <span>
                      {w.confirmed
                        ? '위 진술 내용이 사실과 같음을 확인합니다.'
                        : '위와 같이 진술합니다.'}
                    </span>
                    <span className="ar-witness-signer">
                      진술자 {w.name} (서명)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ---------- 확인 / 결재 ---------- */}
          <div className="ar-sign">
            <table className="ar-sign-table">
              <tbody>
                <tr>
                  <th>작성</th>
                  <th>검토</th>
                  <th>승인</th>
                </tr>
                <tr>
                  <td className="ar-sign-box">
                    <span className="ar-sign-name">{accident.reporterName || ''}</span>
                    <span className="ar-sign-line">(서명)</span>
                  </td>
                  <td className="ar-sign-box">
                    <span className="ar-sign-line">(서명)</span>
                  </td>
                  <td className="ar-sign-box">
                    <span className="ar-sign-line">(서명)</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="ar-foot">
            <span>위와 같이 사고 발생 사실을 보고합니다.</span>
            <span className="ar-foot-date">{formatPrintedAt()} 출력</span>
          </div>
          <div className="ar-foot-company">구보공영(주) 안전보건관리팀</div>
        </div>
      </div>
    </div>
  );

  return createPortal(report, host);
};

export default AccidentReport;
