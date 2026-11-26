import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AccidentCase, DiseaseOpinion } from '../types';
import {
  ACKNOWLEDGE_OPTIONS,
  DISEASE_FORM_NO,
  EMPLOYMENT_STATUSES,
  EMPLOYMENT_TYPES,
  OWNER_STATUSES,
  RELATIVE_STATUSES,
  WORKER_TYPES,
  formatKoreanDate,
  formatKoreanTime,
  normalizeDiseaseOpinion,
} from '../utils/diseaseOpinion';
import './DiseaseOpinionReport.css';

interface DiseaseOpinionReportProps {
  /** 출력할 질병 사례 (diseaseOpinion 필요) */
  accident: AccidentCase;
  /** 닫기 */
  onClose: () => void;
  /** 열리자마자 인쇄 대화상자를 띄울지 */
  autoPrint?: boolean;
}

/** 선택지 목록을 ☑ / ☐ 로 표기 */
const Choices: React.FC<{ options: readonly string[]; value: string }> = ({ options, value }) => (
  <span className="dro-choices">
    {options.map(option => {
      const on = value === option;
      return (
        <span key={option} className={`dro-choice ${on ? 'dro-choice-on' : 'dro-choice-off'}`}>
          <span className="dro-choice-mark">{on ? '☑' : '☐'}</span>
          {option}
        </span>
      );
    })}
  </span>
);

/** 값이 없으면 '-' 대신 흐린 안내 */
const Value: React.FC<{ text?: string; center?: boolean }> = ({ text, center }) => {
  const trimmed = (text ?? '').trim();
  return (
    <td className={`${center ? 'dro-center ' : ''}${trimmed ? '' : 'dro-empty'}`}>
      {trimmed || '-'}
    </td>
  );
};

/**
 * 보험가입자 의견서 (근로복지공단 별지 제4호의2) — A4 세로 2장
 *
 * 1장 : 서식 항목 (신청인 관련사항 · 재해사실 의견 · 심의대상 안내 · 확인)
 * 2장 : 별지 (자유 서술 + 별첨 서류 목록)
 *
 * ⚠️ 인쇄에서는 **명명 페이지(disease-opinion-page)** 만 사용합니다.
 *    전역 @page 를 추가하면 다른 서류(사고보고서 등)의 여백 설정과 충돌합니다.
 */
const DiseaseOpinionReport: React.FC<DiseaseOpinionReportProps> = ({
  accident,
  onClose,
  autoPrint = false,
}) => {
  const host = useMemo(() => {
    const el = document.createElement('div');
    el.className = 'disease-opinion-portal';
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

  /* 자동 인쇄 */
  useEffect(() => {
    if (!autoPrint) return;
    const raf = requestAnimationFrame(() => {
      try {
        window.print();
      } catch {
        /* 인쇄 대화상자를 열 수 없는 환경에서는 미리보기만 유지 */
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

  const opinion: DiseaseOpinion = useMemo(
    () => normalizeDiseaseOpinion(accident.diseaseOpinion),
    [accident.diseaseOpinion],
  );

  const relativeText =
    opinion.relativeStatus === '기타 친인척' && opinion.relativeEtc.trim()
      ? `기타 친인척 (${opinion.relativeEtc.trim()})`
      : opinion.relativeStatus;

  const workerTypeText =
    opinion.workerTypes.length > 0
      ? opinion.workerTypes
          .map(type =>
            type === '특수형태근로종사자' && opinion.workerTypeEtc.trim()
              ? `${type}(${opinion.workerTypeEtc.trim()})`
              : type,
          )
          .join(', ')
      : '';

  const acknowledgeText =
    opinion.acknowledge === '기타' && opinion.acknowledgeEtc.trim()
      ? `기타 (${opinion.acknowledgeEtc.trim()})`
      : opinion.acknowledge;

  /** 서식 하단 공통 푸터 */
  const formFooter = () => (
    <div className="dro-form-footer">
      <span>{DISEASE_FORM_NO}</span>
      <span className="dro-form-company">구 보 공 영 (주)</span>
      <span>A4(210x297)</span>
    </div>
  );

  const report = (
    <div className="dro-overlay">
      <div className="dro-toolbar">
        <div className="dro-toolbar-label">
          🖨️ 보험가입자 의견서 미리보기 · A4 세로 2장
          <span className="dro-toolbar-pages">1/2 서식 · 2/2 별지</span>
        </div>
        <div className="dro-toolbar-actions">
          <button type="button" className="dro-btn dro-btn-primary" onClick={handlePrint}>
            인쇄 / PDF 저장
          </button>
          <button type="button" className="dro-btn dro-btn-ghost" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>

      <div className="dro-scroll">
        {/* ============================================================ */}
        {/* 1 / 2 — 서식                                                */}
        {/* ============================================================ */}
        <div className="dro-sheet">
          <span className="dro-page-tag">1 / 2 · 보험가입자 의견서</span>

          <div className="dro-titlebar">
            <div className="dro-title">보험가입자 의견서</div>
            <div className="dro-page-no">1 / 2</div>
          </div>

          {/* ---------- 상단 요약 ---------- */}
          <table className="dro-summary">
            <tbody>
              <tr>
                <th>재해자 성명</th>
                <td className="dro-strong">{opinion.workerName.trim() || '-'}</td>
                <th>주민등록번호</th>
                <td>{opinion.workerResidentId.trim() || '-'}</td>
                <th>재해발생일</th>
                <td>{formatKoreanDate(opinion.onsetDate) || '-'}</td>
              </tr>
            </tbody>
          </table>

          {/* ---------- 1. 신청인 관련사항 ---------- */}
          <div className="dro-section">
            <h4 className="dro-section-title">
              1. 신청인과 관련하여 아래사항을 구체적으로 기재해 주세요
            </h4>

            <table className="dro-table">
              <colgroup>
                <col style={{ width: '17%' }} />
                <col style={{ width: '33%' }} />
                <col style={{ width: '17%' }} />
                <col style={{ width: '33%' }} />
              </colgroup>
              <tbody>
                <tr>
                  <th>채용일자</th>
                  <Value text={formatKoreanDate(opinion.hireDate)} />
                  <th>국적</th>
                  <Value text={opinion.nationality} />
                </tr>
                <tr>
                  <th>직종</th>
                  <Value text={opinion.jobType} />
                  <th>상병명</th>
                  <Value text={opinion.diseaseName} />
                </tr>
                <tr>
                  <th>출근시간</th>
                  <Value text={formatKoreanTime(opinion.workStartTime)} center />
                  <th>퇴근시간</th>
                  <Value text={formatKoreanTime(opinion.workEndTime)} center />
                </tr>
                <tr>
                  <th>작업개시시간</th>
                  <Value text={formatKoreanTime(opinion.taskStartTime)} center />
                  <th>임금</th>
                  <Value text={opinion.wage} />
                </tr>
                <tr>
                  <th>종사상 지위</th>
                  <td colSpan={3}>
                    <Choices options={EMPLOYMENT_STATUSES} value={opinion.employmentStatus} />
                  </td>
                </tr>
                <tr>
                  <th>고용형태</th>
                  <td colSpan={3}>
                    <Choices options={EMPLOYMENT_TYPES} value={opinion.employmentType} />
                  </td>
                </tr>
                <tr>
                  <th rowSpan={2}>보험가입자 (사업주)와의 관계</th>
                  <td colSpan={3}>
                    <span className="dro-sub-label">사업주여부</span>
                    <Choices options={OWNER_STATUSES} value={opinion.ownerStatus} />
                  </td>
                </tr>
                <tr>
                  <td colSpan={3}>
                    <span className="dro-sub-label">친인척여부</span>
                    <Choices options={RELATIVE_STATUSES} value={opinion.relativeStatus} />
                    {relativeText === '기타 친인척' && opinion.relativeEtc.trim() ? (
                      <span className="dro-choice"> ({opinion.relativeEtc.trim()})</span>
                    ) : null}
                  </td>
                </tr>
                <tr>
                  <th>근로자 유형</th>
                  <td colSpan={3}>
                    <span className="dro-choices">
                      {WORKER_TYPES.map(type => {
                        const on = opinion.workerTypes.includes(type);
                        return (
                          <span
                            key={type}
                            className={`dro-choice ${on ? 'dro-choice-on' : 'dro-choice-off'}`}
                          >
                            <span className="dro-choice-mark">{on ? '☑' : '☐'}</span>
                            {type}
                          </span>
                        );
                      })}
                      {opinion.workerTypeEtc.trim() ? (
                        <span className="dro-choice">({opinion.workerTypeEtc.trim()})</span>
                      ) : null}
                    </span>
                    {workerTypeText ? null : <span className="dro-empty" />}
                  </td>
                </tr>
                <tr>
                  <th>담당업무</th>
                  <td colSpan={3}>
                    <p className="dro-body-text">{opinion.dutyDescription.trim() || '-'}</p>
                  </td>
                </tr>
                <tr>
                  <th>재해발생 이후 근무이력</th>
                  <td colSpan={3}>
                    <p className="dro-body-text">{opinion.workHistoryAfter.trim() || '-'}</p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ---------- 2. 재해사실에 대한 의견 ---------- */}
          <div className="dro-section">
            <h4 className="dro-section-title">
              2. 재해사실 또는 발병사실에 대한 의견 (별지사용 가능)
            </h4>

            <table className="dro-table">
              <colgroup>
                <col style={{ width: '17%' }} />
                <col style={{ width: '83%' }} />
              </colgroup>
              <tbody>
                <tr>
                  <th>귀사는 신청인의 재해사실을 인정합니까?</th>
                  <td>
                    <Choices options={ACKNOWLEDGE_OPTIONS} value={opinion.acknowledge} />
                    {acknowledgeText === '기타' && opinion.acknowledgeEtc.trim() ? (
                      <span className="dro-choice"> ({opinion.acknowledgeEtc.trim()})</span>
                    ) : null}
                  </td>
                </tr>
                <tr>
                  <th>인정하지 않는 경우 그 사유</th>
                  <td>
                    <p className="dro-body-text">{opinion.rejectReason.trim() || '-'}</p>
                  </td>
                </tr>
              </tbody>
            </table>

            <p className="dro-warning">
              ※ 재해경위 등 주요사항을 사실과 달리 기재하여 보험급여를 지급받게 도와준 경우에는
              산재보험법 제127조에 따라 형사처벌을 받을 수 있으므로 사실대로 기재하여야 합니다.
            </p>
          </div>

          {/* ---------- 3. 심의대상 안내 ---------- */}
          <div className="dro-section">
            <h4 className="dro-section-title">
              3. 업무상 질병판정위원회 심의대상에 대한 진행사항 등 안내
            </h4>
            <p className="dro-section-title-sub">
              ( 업무상질병판정위원회 심의대상인 경우 심의절차, 진행사항, 심의회의 일자 등 안내를
              위하여 사업주 또는 사업장 담당자 휴대폰 번호 확인이 반드시 필요합니다. 만일, 휴대폰
              번호가 확인되지 않거나, 정보사용에 동의하지 않는 경우 심의절차 등 안내가 제한될 수
              있습니다. )
            </p>

            <table className="dro-table">
              <colgroup>
                <col style={{ width: '33%' }} />
                <col style={{ width: '37%' }} />
                <col style={{ width: '30%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>개인정보 이용목적</th>
                  <th>이용항목 / 보유 및 이용기간</th>
                  <th>통지받을 휴대폰번호</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>업무상 질병판정위원회 심의절차 등 통지</td>
                  <td>성명, 휴대폰번호 / 업무상 질병여부 결정일부터 10년</td>
                  <td className="dro-center">
                    {opinion.noticePhone.trim() || '-'}
                    <br />
                    <span className="dro-sub-label">
                      {opinion.noticeName.trim() || ''}
                      {opinion.noticeAgreed ? ' · 동의함' : ' · 미동의'}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ---------- 확인 + 사업장 정보 ---------- */}
          <div className="dro-confirm">
            <p className="dro-confirm-text">위에 기재한 사실이 모두 사실임을 확인합니다.</p>
            <p className="dro-confirm-date">
              {formatKoreanDate(opinion.writtenDate) || '(작성일)'}
            </p>

            <table className="dro-sign-table">
              <tbody>
                <tr>
                  <th>사업장명</th>
                  <td>{opinion.workplaceName.trim() || '-'}</td>
                </tr>
                <tr>
                  <th>소재지</th>
                  <td>{opinion.workplaceAddress.trim() || '-'}</td>
                </tr>
                <tr>
                  <th>사업주</th>
                  <td>{opinion.ownerName.trim() || '-'}</td>
                  <td className="dro-sign-stamp">(서명 또는 인)</td>
                </tr>
                <tr>
                  <th>전화번호</th>
                  <td colSpan={2}>{opinion.phoneNumber.trim() || '-'}</td>
                </tr>
                <tr>
                  <th>휴대폰</th>
                  <td colSpan={2}>{opinion.mobileNumber.trim() || '-'}</td>
                </tr>
                <tr>
                  <th>E-Mail</th>
                  <td colSpan={2}>{opinion.email.trim() || '-'}</td>
                </tr>
              </tbody>
            </table>

            <p className="dro-recipient">{opinion.recipient.trim() || '근로복지공단 귀하'}</p>
          </div>

          <div className="dro-contact-foot">
            담당 : 근로복지공단 관할 지사 · 전화 : 1588-0075 · 전자우편 : comwel.or.kr
          </div>

          {formFooter()}
        </div>

        {/* ============================================================ */}
        {/* 2 / 2 — 별지                                                */}
        {/* ============================================================ */}
        <div className="dro-sheet">
          <span className="dro-page-tag">2 / 2 · 별지</span>

          <div className="dro-titlebar">
            <div className="dro-title">보험가입자 의견서 “별지”</div>
            <div className="dro-page-no">2 / 2</div>
          </div>

          <div className="dro-attach-intro">
            {opinion.attachmentIntro.trim() ||
              '당사는 신청인의 요양급여신청(업무상 질병)에 대하여 다음과 같은 사유로 당 현장과의 업무상 상당인과관계가 성립하지 않음을 확인하오니 공정한 심사를 통해 불승인 처하여 주시기 바랍니다.'}
          </div>

          <div className="dro-fill">
            {opinion.attachmentClauses
              .filter(clause => clause.title.trim() || clause.body.trim())
              .map((clause, idx) => (
                <div className="dro-clause" key={clause.id}>
                  <h5 className="dro-clause-title">
                    {idx + 1}. {clause.title.trim() || '(제목 없음)'}
                  </h5>
                  <p className="dro-clause-body">{clause.body.trim() || '-'}</p>
                </div>
              ))}

            {opinion.attachmentClauses.every(
              clause => !clause.title.trim() && !clause.body.trim(),
            ) ? (
              <div className="dro-clause">
                <p className="dro-clause-body dro-empty">
                  별지 내용이 작성되지 않았습니다. 작성 화면의 ‘별지(2/2)’에서 입력할 수 있습니다.
                </p>
              </div>
            ) : null}
          </div>

          <div className="dro-appendix">
            <h5 className="dro-clause-title">5. “별첨”</h5>
            {opinion.appendixes.some(a => a.name.trim() || a.copies.trim()) ? (
              <ol className="dro-appendix-list">
                {opinion.appendixes
                  .filter(a => a.name.trim() || a.copies.trim())
                  .map((appendix, idx) => (
                    <li key={appendix.id}>
                      <span className="dro-appendix-name">
                        {idx + 1}) {appendix.name.trim() || '(서류명 미입력)'}
                      </span>
                      <span className="dro-appendix-copies">
                        {appendix.copies.trim() ? `--- ${appendix.copies.trim()}` : '--- -'}
                      </span>
                    </li>
                  ))}
              </ol>
            ) : (
              <p className="dro-clause-body dro-empty">별첨 서류가 없습니다.</p>
            )}
          </div>

          {formFooter()}
        </div>
      </div>
    </div>
  );

  return createPortal(report, host);
};

export default DiseaseOpinionReport;
