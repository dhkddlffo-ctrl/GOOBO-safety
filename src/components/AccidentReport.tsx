import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AccidentCase } from '../types';
import {
  formatDateKo,
  formatPrintedAt,
  formatReportNo,
  formatTenure,
  resolveSigners,
} from '../utils/accidentReport';
import './AccidentReport.css';

interface AccidentReportProps {
  /** 서류로 출력할 사고사례 */
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

/** 회사 서식 번호 */
const FORM_CAUSE = 'FWP-006';
const FORM_WITNESS = 'FWP-006-3.01';
const FORM_DIAGRAM = 'FWP-006-2-2.01';

/** 생년월일(yyyy-mm-dd)로 만 나이 계산 */
const calcAge = (birth?: string, base?: string): number | undefined => {
  if (!birth || !base) return undefined;
  const b = new Date(birth);
  const t = new Date(base);
  if (Number.isNaN(b.getTime()) || Number.isNaN(t.getTime())) return undefined;
  let age = t.getFullYear() - b.getFullYear();
  const beforeBirthday =
    t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate());
  if (beforeBirthday) age -= 1;
  return age > 0 ? age : undefined;
};

/** "25년 12월 15일 14시 00분" 형태 */
const formatShortDateTime = (value?: string): string => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const yy = String(d.getFullYear()).slice(2);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${yy}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${hh}시 ${mm}분`;
};

/**
 * 재해 발생일시 표기.
 * 재해 발생일은 날짜만 입력받으므로, 시각이 없으면 사고 발생일시의 시각을 사용합니다.
 * (그대로 쓰면 "00시 00분" 으로 출력됩니다)
 */
const formatDisasterDateTime = (disaster?: string, accident?: string): string => {
  if (!disaster) return formatShortDateTime(accident);
  if (disaster.includes('T')) return formatShortDateTime(disaster);

  const day = new Date(`${disaster}T00:00`);
  if (Number.isNaN(day.getTime())) return formatShortDateTime(disaster);

  const acc = accident ? new Date(accident) : null;
  if (acc && !Number.isNaN(acc.getTime())) {
    day.setHours(acc.getHours(), acc.getMinutes(), 0, 0);
  }
  const yy = String(day.getFullYear()).slice(2);
  const hh = String(day.getHours()).padStart(2, '0');
  const mm = String(day.getMinutes()).padStart(2, '0');
  return `${yy}년 ${day.getMonth() + 1}월 ${day.getDate()}일 ${hh}시 ${mm}분`;
};

/**
 * 사고 관련 서류 (A4 세로 · 서류별 1장)
 *
 * 회사 서식을 그대로 따라 **서류 3종을 각각 독립된 장**으로 출력합니다.
 *
 *  ① 사고원인 및 대책 보고서 (FWP-006)
 *     결재란 · 성명/생년월일/직급 · 결혼여부/가족관계 · 사고장소/발생일시/연락처
 *     사고발생경위 · 조치사항 · 사고원인 · 예방대책 · 관련원부 · 서명
 *  ② 목격자 진술서 (FWP-006-3.01) — 목격자 1인당 1장
 *     본인사항 · 작업사항 · 사고목격내용 · 확인 서명
 *  ③ 재해(사고) 상황도 (FWP-006-2-2.01)
 *     재해 발생일시/장소 · 현장 LAYOUT
 *
 * ⚠️ 각 서류는 `.ar-sheet` 한 장이며, 인쇄 시 두 번째 서류부터
 *    `break-before: page` 로 새 장에서 시작합니다.
 *    `.ar-sheet` 에 break-inside: avoid 를 걸면 내용이 넘칠 때 잘리므로
 *    반드시 auto 로 두어야 합니다.
 */
const AccidentReport: React.FC<AccidentReportProps> = ({
  accident,
  onClose,
  autoPrint = false,
}) => {
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

  /* 재해 발생일·장소는 미입력 시 사고 정보로 대체 */
  const disasterDate = accident.disasterDate || accident.accidentDate;
  const disasterPlace = accident.disasterPlace || accident.location;
  const witnesses = accident.witnesses ?? [];
  /* 서명란 — 새 signers 배열이 있으면 그것을, 없으면 예전 4개 고정 필드를 사용합니다. */
  const signers = resolveSigners(accident);
  const docNo = formatReportNo(accident);
  const victimAge = accident.victimAge ?? calcAge(accident.victimBirthDate, accident.accidentDate);

  const docLabels = [
    '사고원인 및 대책 보고서',
    ...witnesses.map((_, i) => (witnesses.length > 1 ? `목격자 진술서 ${i + 1}` : '목격자 진술서')),
    '재해(사고) 상황도',
  ];
  const totalDocs = docLabels.length;

  /** 서류 하단 공통 푸터 (양식번호 · 회사명 · 규격) */
  const formFooter = (formNo: string) => (
    <div className="ar-form-footer">
      <span className="ar-form-no">{formNo}</span>
      <span className="ar-form-company">구 보 공 영 (주)</span>
      <span className="ar-form-size">A4(210x297)</span>
    </div>
  );

  const report = (
    <div className="ar-overlay">
      <div className="ar-toolbar">
        <div className="ar-toolbar-label">
          🖨️ 사고 관련 서류 미리보기 · A4 세로 {totalDocs}장
          <span className="ar-toolbar-pages">{docLabels.join(' · ')}</span>
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
        {/* ============================================================ */}
        {/* ① 사고원인 및 대책 보고서 (FWP-006)                          */}
        {/* ============================================================ */}
        <div className="ar-sheet ar-doc" data-doc="cause">
          <div className="ar-doc-tag">서류 1 · 사고원인 및 대책 보고서</div>

          {/* ---------- 표제 + 결재란 ---------- */}
          <div className="ar-head-grid">
            <div className="ar-head-titlebox">
              <div className="ar-head-title">사고원인 및 대책 보고서</div>
              <div className="ar-head-subtitle">({accident.siteName})</div>
            </div>

            <table className="ar-approval">
              <tbody>
                <tr>
                  <th rowSpan={2} className="ar-approval-role">
                    결
                    <br />재
                  </th>
                  <th className="ar-approval-cell">작성</th>
                  <th className="ar-approval-cell">검토</th>
                  <th className="ar-approval-cell">검토</th>
                  <th className="ar-approval-cell">검토</th>
                  <th className="ar-approval-cell">승인</th>
                </tr>
                <tr>
                  {/*
                   * 결재란은 인쇄 후 실제 서명을 받는 자리이므로
                   * 이름을 자동으로 채우지 않습니다. (수기 서명용 빈칸)
                   */}
                  <td className="ar-approval-sign" />
                  <td className="ar-approval-sign" />
                  <td className="ar-approval-sign" />
                  <td className="ar-approval-sign" />
                  <td className="ar-approval-sign" />
                </tr>
              </tbody>
            </table>
          </div>

          {/* ---------- 인적사항 ---------- */}
          <table className="ar-grid">
            <colgroup>
              <col style={{ width: '11%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '25%' }} />
            </colgroup>
            <tbody>
              <tr>
                <th>성명</th>
                <td>
                  {accident.victimName || '미제공'}
                  {victimAge ? ` / ${victimAge}세` : ''}
                </td>
                <th>생년월일</th>
                <td>{accident.victimBirthDate ? formatDateKo(accident.victimBirthDate) : '-'}</td>
                <th>직급</th>
                <td>{accident.victimRank || accident.victimJobType || '-'}</td>
              </tr>
              <tr>
                <th>결혼여부</th>
                <td>{accident.victimMaritalStatus || '-'}</td>
                <th>국적</th>
                <td>{accident.victimNationality || '-'}</td>
                <th>가족관계</th>
                <td>{accident.victimFamily || '-'}</td>
              </tr>
              <tr>
                <th>사고장소</th>
                <td>{accident.location || '-'}</td>
                <th>발생일시</th>
                <td>{formatShortDateTime(accident.accidentDate)}</td>
                <th>연락처</th>
                <td>{accident.victimPhone || '-'}</td>
              </tr>
              <tr>
                <th>입사일</th>
                <td>{formatDateKo(accident.victimHireDate)}</td>
                <th>근속기간</th>
                <td>{formatTenure(accident.victimHireDate, accident.accidentDate)}</td>
                <th>직종</th>
                <td>{accident.victimJobType || '-'}</td>
              </tr>
            </tbody>
          </table>

          {/* ---------- 사고발생경위 ---------- */}
          <div className="ar-field" data-field="description">
            <div className="ar-field-title">사고발생경위</div>
            <div className="ar-field-body">
              <p className="ar-field-hint">(6하원칙에 따라 상세히 기술하시오)</p>
              <p className="ar-field-text">{accident.description || '-'}</p>
            </div>
          </div>

          {/* ---------- 조치 사항 ---------- */}
          <div className="ar-field" data-field="action">
            <div className="ar-field-title">조치 사항</div>
            <div className="ar-field-body">
              <p className="ar-field-text">{accident.actionTaken || '-'}</p>
            </div>
          </div>

          {/* ---------- 사고원인 ---------- */}
          <div className="ar-field" data-field="cause">
            <div className="ar-field-title">사고원인</div>
            <div className="ar-field-body">
              <p className="ar-field-text">{accident.cause || '-'}</p>
            </div>
          </div>

          {/* ---------- 예방대책 ---------- */}
          <div className="ar-field" data-field="preventive">
            <div className="ar-field-title">예방대책</div>
            <div className="ar-field-body">
              <p className="ar-field-text">{accident.preventiveMeasures || '-'}</p>
            </div>
          </div>

          {/* ---------- 관련원부 ---------- */}
          <div className="ar-field" data-field="related">
            <div className="ar-field-title">관련원부: 안전관리팀장 현장방문 확인내용 / 기타</div>
            <div className="ar-field-body">
              {accident.relatedNotes ? (
                <div className="ar-field-split">
                  <div className="ar-field-split-label">▸ 안전관리팀장 현장방문 확인내용</div>
                  <p className="ar-field-text">{accident.relatedNotes}</p>
                </div>
              ) : null}
              {accident.relatedEtc ? (
                <div className="ar-field-split">
                  <div className="ar-field-split-label">▸ 기타</div>
                  <p className="ar-field-text">{accident.relatedEtc}</p>
                </div>
              ) : null}
              {!accident.relatedNotes && !accident.relatedEtc ? (
                <p className="ar-field-text">-</p>
              ) : null}
            </div>
          </div>

          {/* ---------- 서명란 (직책 추가·삭제 자유 · 2열 배치) ---------- */}
          {signers.length > 0 ? (
            <div className="ar-signers">
              {signers.map(s => (
                <div className="ar-signer" key={s.id}>
                  <span className="ar-signer-label">{s.role || ''}</span>
                  <span className="ar-signer-colon">:</span>
                  <span className="ar-signer-name">{s.name || ''}</span>
                  <span className="ar-signer-stamp">(서명)</span>
                </div>
              ))}
            </div>
          ) : null}

          {formFooter(FORM_CAUSE)}
        </div>

        {/* ============================================================ */}
        {/* ② 목격자 진술서 (FWP-006-3.01) — 목격자 1인당 1장             */}
        {/* ============================================================ */}
        {witnesses.map((w, idx) => (
          <div className="ar-sheet ar-doc" data-doc="witness" key={w.id}>
            <div className="ar-doc-tag">
              서류 {idx + 2} · 목격자 진술서{witnesses.length > 1 ? ` ${idx + 1}` : ''}
            </div>

            <div className="ar-doc-titlebar">목 격 자 진 술 서</div>

            <table className="ar-grid ar-witness-table">
              <colgroup>
                <col style={{ width: '8%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '28%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '30%' }} />
              </colgroup>
              <tbody>
                {/* 본인사항 */}
                <tr>
                  <th rowSpan={4} className="ar-witness-group">
                    본
                    <br />
                    인
                    <br />
                    사
                    <br />항
                  </th>
                  <th>본적</th>
                  <td colSpan={3}>{w.permanentAddress || '-'}</td>
                </tr>
                <tr data-wrow="person">
                  <th>주소</th>
                  <td colSpan={3}>{w.address || '-'}</td>
                </tr>
                <tr data-wrow="person">
                  <th>성명</th>
                  <td>{w.name || '-'}</td>
                  <th>주민등록번호</th>
                  <td>{w.residentId || '-'}</td>
                </tr>
                <tr data-wrow="person">
                  <th>직종</th>
                  <td>{w.jobType || '-'}</td>
                  <th>연락처(TEL)</th>
                  <td>{w.phone || '-'}</td>
                </tr>

                {/* 작업사항 */}
                <tr>
                  <th rowSpan={3} className="ar-witness-group">
                    작
                    <br />
                    업
                    <br />
                    사
                    <br />항
                  </th>
                  <th>사고자가 하던일</th>
                  <td colSpan={3}>{w.victimTask || '-'}</td>
                </tr>
                <tr data-wrow="task">
                  <th>목격자가 하던일</th>
                  <td colSpan={3}>{w.witnessTask || '-'}</td>
                </tr>
                <tr data-wrow="task">
                  <th>같이 일하던사람</th>
                  <td colSpan={3}>{w.coworker || '-'}</td>
                </tr>

                {/* 사고목격내용 */}
                <tr data-wrow="content">
                  <th colSpan={2} className="ar-witness-content-title">
                    사고목격내용
                  </th>
                  <td colSpan={3} className="ar-witness-content-cell">
                    <p className="ar-field-hint">
                      (사고를 목격한 경위를 6하원칙에 의하여 약술하시오)
                      <br />
                      (누가, 언제, 어디서, 무엇을, 어떻게, 왜)
                    </p>
                    <p className="ar-field-text">{w.statement || '-'}</p>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* 확인 문구 */}
            <div className="ar-witness-confirm">
              <p className="ar-witness-confirm-text">
                {w.confirmed
                  ? '위 진술내용이 사실과 틀림 없음을 확인합니다.'
                  : '위와 같이 진술합니다.'}
              </p>
              <p className="ar-witness-confirm-date">
                {w.statementDate ? formatDateKo(w.statementDate) : formatPrintedAt()}
              </p>
            </div>

            {/* 진술자 서명 */}
            <div className="ar-witness-signrow">
              <span className="ar-witness-signitem">소속 : {w.affiliation || '구보공영'}</span>
              <span className="ar-witness-signitem">직종(직책) : {w.jobType || '-'}</span>
              <span className="ar-witness-signitem">
                성명 : {w.name || '-'}
                <span className="ar-signer-stamp">(서명)</span>
              </span>
            </div>

            {formFooter(FORM_WITNESS)}
          </div>
        ))}

        {/* ============================================================ */}
        {/* ③ 재해(사고) 상황도 (FWP-006-2-2.01)                        */}
        {/* ============================================================ */}
        <div className="ar-sheet ar-doc" data-doc="diagram">
          <div className="ar-doc-tag">서류 {totalDocs} · 재해(사고) 상황도</div>

          <div className="ar-doc-titlebar">재 해(사 고) 상 황 도</div>

          <table className="ar-grid">
            <colgroup>
              <col style={{ width: '22%' }} />
              <col style={{ width: '46%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '20%' }} />
            </colgroup>
            <tbody>
              <tr>
                <th>재해 발생일시</th>
                <td>{formatDisasterDateTime(disasterDate, accident.accidentDate)}</td>
                <th>장소</th>
                <td>{disasterPlace || '-'}</td>
              </tr>
            </tbody>
          </table>

          {/* 현장 LAYOUT */}
          <div className="ar-layout">
            <div className="ar-layout-caption">1. 현장 LAYOUT (사고위치)</div>
            {accident.situationDiagram ? (
              <img className="ar-layout-img" src={accident.situationDiagram} alt="재해 상황도" />
            ) : (
              <div className="ar-layout-empty">
                <span>재해 상황도가 작성되지 않았습니다.</span>
                <span className="ar-layout-empty-hint">
                  사고사례 작성 화면의 ‘재해 상황도’에서 직접 그릴 수 있습니다.
                </span>
              </div>
            )}
          </div>

          {accident.situationNote ? (
            <p className="ar-layout-note">※ {accident.situationNote}</p>
          ) : null}

          <div className="ar-diagram-meta">
            <span>사고 유형: {accident.accidentType}</span>
            <span>
              심각도:{' '}
              <span className={`ar-sev ${SEVERITY_CLASS[accident.severity]}`}>
                {accident.severity}
              </span>
            </span>
            <span>문서번호: {docNo}</span>
          </div>

          {formFooter(FORM_DIAGRAM)}
        </div>
      </div>
    </div>
  );

  return createPortal(report, host);
};

export default AccidentReport;
