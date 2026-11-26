import React, { useCallback, useMemo, useState } from 'react';
import { AccidentCase } from '../types';
import { deleteAccidentCase, getAccidentCases } from '../utils/storage';
import { isAuthenticated } from '../utils/auth';
import { getSubmissionBadge } from '../utils/accidentDeadline';
import { getCaseKind } from '../utils/diseaseOpinion';
import AccidentReport from './AccidentReport';
import DiseaseOpinionReport from './DiseaseOpinionReport';
import './AccidentCaseBoard.css';

interface AccidentCaseBoardProps {
  siteId: number;
  siteName: string;
  /** 새 사고사례 작성 */
  onWrite: () => void;
  /** 기존 사고사례 수정 */
  onEdit: (accident: AccidentCase) => void;
}

/** '2026-11-21T10:30' → '2026.11.21 10:30' */
const formatAccidentDate = (value?: string): string => {
  if (!value) return '-';
  const [date, time] = value.split('T');
  const [y, m, d] = (date || '').split('-');
  if (!y || !m || !d) return value;
  const dayPart = `${y}.${m}.${d}`;
  return time ? `${dayPart} ${time.slice(0, 5)}` : dayPart;
};

/** 심각도별 배지 색 */
const severityClass = (severity: AccidentCase['severity']): string => {
  if (severity === '사망') return ' is-death';
  if (severity === '중상') return ' is-heavy';
  if (severity === '경상') return ' is-light';
  if (severity === '질병') return ' is-disease';
  return ' is-none';
};

/**
 * 현장별 사고사례 게시판
 *
 * 수시 위험성평가 등록부와 같은 게시판형 목록입니다.
 * - 현장에 등록된 사고사례만 보입니다. (getAccidentCases().filter(siteId))
 * - '✍️ 사고사례 작성'은 관리자 로그인 후 사용할 수 있습니다.
 * - 줄을 누르면 회사 서식 사고보고서(A4)로 열립니다.
 */
const AccidentCaseBoard: React.FC<AccidentCaseBoardProps> = ({
  siteId,
  siteName,
  onWrite,
  onEdit,
}) => {
  const canManage = isAuthenticated();
  const [list, setList] = useState<AccidentCase[]>(() =>
    getAccidentCases()
      .filter(item => item.siteId === siteId)
      .sort((a, b) => (b.accidentDate || '').localeCompare(a.accidentDate || '')),
  );
  /** 보고서로 열어 볼 사고사례 */
  const [viewCase, setViewCase] = useState<AccidentCase | null>(null);

  const reload = useCallback(() => {
    setList(
      getAccidentCases()
        .filter(item => item.siteId === siteId)
        .sort((a, b) => (b.accidentDate || '').localeCompare(a.accidentDate || '')),
    );
  }, [siteId]);

  const stats = useMemo(() => {
    const counts = { 사망: 0, 중상: 0, 경상: 0, 무재해: 0, 질병: 0 };
    list.forEach(item => {
      counts[item.severity] += 1;
    });
    return counts;
  }, [list]);

  /** 작성 유형별 건수 (사고 / 질병) */
  const kinds = useMemo(() => {
    const sick = list.filter(item => getCaseKind(item) === '질병').length;
    return { accident: list.length - sick, disease: sick };
  }, [list]);

  /** 사업재해조사표 제출 현황 (D-day 경고 집계) — 질병은 제외 */
  const submission = useMemo(() => {
    const badges = list
      .filter(item => getCaseKind(item) === '사고')
      .map(item => getSubmissionBadge(item));
    return {
      done: badges.filter(b => b.className === 'is-done').length,
      na: badges.filter(b => b.className === 'is-na').length,
      pending: badges.filter(b => b.status === '미제출').length,
      urgent: badges.filter(b => b.className === 'is-danger' || b.className === 'is-expired')
        .length,
    };
  }, [list]);

  const removeCase = (target: AccidentCase) => {
    if (
      !window.confirm(
        `${formatAccidentDate(target.accidentDate)} ${target.accidentType} 사고사례를 삭제할까요?\n삭제한 자료는 되돌릴 수 없습니다.`,
      )
    ) {
      return;
    }
    deleteAccidentCase(target.id);
    setViewCase(prev => (prev && prev.id === target.id ? null : prev));
    reload();
  };

  /* ---------- 보고서 보기 (유형별 서류) ---------- */
  if (viewCase) {
    /*
     * 업무상 질병 사례는 「보험가입자 의견서」(별지 제4호의2)로,
     * 업무상 사고 사례는 기존 사고 관련 서류로 엽니다.
     */
    if (getCaseKind(viewCase) === '질병') {
      return <DiseaseOpinionReport accident={viewCase} onClose={() => setViewCase(null)} />;
    }
    return <AccidentReport accident={viewCase} onClose={() => setViewCase(null)} />;
  }

  return (
    <div className="acb">
      {/* ---------- 머리글 ---------- */}
      <div className="acb-head">
        <div className="acb-head-text">
          <h3 className="acb-title">⚠️ 사고사례 게시판</h3>
          <p className="acb-sub">
            <b>{siteName}</b> 현장의 <b>업무상 사고</b>와 <b>업무상 질병</b> 사례를 함께
            등록·보관합니다. 사고는 회사 서식 사고보고서(A4), 질병은 근로복지공단 「보험가입자
            의견서」(A4 2장)로 인쇄됩니다.
          </p>
        </div>
        <div className="acb-head-right">
          <span className="acb-count">전체 {list.length}건</span>
          {canManage && (
            <button className="btn btn-sm btn-primary acb-btn-write" onClick={onWrite}>
              ✍️ 사고사례 작성
            </button>
          )}
        </div>
      </div>

      {/* ---------- 작성 유형 요약 ---------- */}
      {list.length > 0 && (
        <div className="acb-status">
          <span className="acb-status-chip">구분</span>
          <span className="acb-stat is-accident">업무상 사고 {kinds.accident}</span>
          <span className="acb-stat is-disease">업무상 질병 {kinds.disease}</span>
        </div>
      )}

      {/* ---------- 심각도 요약 ---------- */}
      {list.length > 0 && (
        <div className="acb-status">
          <span className="acb-status-chip">심각도</span>
          <span className="acb-stat is-death">사망 {stats.사망}</span>
          <span className="acb-stat is-heavy">중상 {stats.중상}</span>
          <span className="acb-stat is-light">경상 {stats.경상}</span>
          <span className="acb-stat is-none">무재해 {stats.무재해}</span>
          <span className="acb-stat is-disease">질병 {stats.질병}</span>
        </div>
      )}

      {/* ---------- 사업재해조사표 제출 현황 (D-day 경고) ---------- */}
      {list.length > 0 && (
        <div className="acb-submit-bar">
          <span className="acb-submit-chip">사업재해조사표</span>
          <span className="acb-submit-stat is-done">제출 {submission.done}</span>
          <span className="acb-submit-stat is-pending">미제출 {submission.pending}</span>
          <span className="acb-submit-stat is-na">제출대상 아님 {submission.na}</span>
          {submission.urgent > 0 && (
            <span className="acb-submit-stat is-urgent">⚠️ 기한 임박·경과 {submission.urgent}</span>
          )}
          <span className="acb-submit-note">기한: 사고 발생일로부터 1개월 이내 (질병 제외)</span>
        </div>
      )}

      {/* ---------- 비어 있음 ---------- */}
      {list.length === 0 ? (
        <div className="acb-empty">
          <p className="acb-empty-title">아직 등록된 사고사례가 없습니다.</p>
          <p className="acb-empty-sub">
            발생한 사고·질병을 기록해 두면 재발 방지 대책 수립과 전 현장 공유에 활용됩니다.
            <br />
            <b>업무상 사고</b>는 사고보고서 · 목격자 진술서 · 재해 상황도로, <b>업무상 질병</b>은
            보험가입자 의견서로 인쇄됩니다.
          </p>
          {canManage ? (
            <div className="acb-empty-btns">
              <button className="btn btn-primary" onClick={onWrite}>
                ✍️ 사고사례 작성
              </button>
            </div>
          ) : (
            <p className="acb-empty-note">관리자 로그인 후 작성할 수 있습니다.</p>
          )}
        </div>
      ) : (
        <div className="acb-table-wrap">
          <table className="acb-table">
            <colgroup>
              <col style={{ width: '5%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '14%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>번호</th>
                <th>구분</th>
                <th>발생일시</th>
                <th>유형</th>
                <th>심각도</th>
                <th>발생장소</th>
                <th>피해자</th>
                <th>처리결과</th>
                <th>사업재해조사표</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {list.map((item, idx) => {
                const badge = getSubmissionBadge(item);
                const isSick = getCaseKind(item) === '질병';
                return (
                  <tr
                    key={item.id}
                    className="acb-row"
                    onClick={() => setViewCase(item)}
                    title={
                      isSick
                        ? '누르면 보험가입자 의견서(A4)가 열립니다.'
                        : '누르면 사고보고서가 열립니다.'
                    }
                  >
                    <td className="acb-c-no">{list.length - idx}</td>
                    <td className="acb-c-kind">
                      <span className={`acb-kind-badge${isSick ? ' is-disease' : ' is-accident'}`}>
                        {isSick ? '질병' : '사고'}
                      </span>
                    </td>
                    <td className="acb-c-date">
                      {formatAccidentDate(item.accidentDate)}
                      {isSick ? (
                        <span className="acb-kind-sub" title="재해(발병) 발생일">
                          발병일
                        </span>
                      ) : null}
                    </td>
                    <td className="acb-c-type">{item.accidentType}</td>
                    <td className="acb-c-sev">
                      <span className={`acb-badge${severityClass(item.severity)}`}>
                        {item.severity}
                      </span>
                    </td>
                    <td className="acb-c-place">{item.location || '-'}</td>
                    <td className="acb-c-victim">{item.victimName || '-'}</td>
                    <td className="acb-c-result">{item.treatmentResult || '미처리'}</td>

                    {/* ---------- 사업재해조사표 제출상태 + D-day (질병은 대상 아님) ---------- */}
                    <td className="acb-c-submit">
                      {isSick ? (
                        <span className="acb-submit-badge is-na">질병</span>
                      ) : (
                        <>
                          <span className={`acb-submit-badge ${badge.className}`}>
                            {badge.status}
                          </span>
                          {badge.dday ? (
                            <span className={`acb-dday ${badge.className}`} title={badge.message}>
                              {badge.dday}
                            </span>
                          ) : null}
                        </>
                      )}
                    </td>

                    <td className="acb-c-actions">
                      <button
                        className="btn btn-xs"
                        onClick={e => {
                          e.stopPropagation();
                          setViewCase(item);
                        }}
                      >
                        열기
                      </button>
                      {canManage && (
                        <button
                          className="btn btn-xs"
                          onClick={e => {
                            e.stopPropagation();
                            onEdit(item);
                          }}
                        >
                          수정
                        </button>
                      )}
                      {canManage && (
                        <button
                          className="btn btn-xs acb-btn-del"
                          onClick={e => {
                            e.stopPropagation();
                            removeCase(item);
                          }}
                        >
                          삭제
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="acb-note">
        ※ 줄을 누르면 <b>사고보고서(A4)</b>가 열리고, 그 자리에서 <b>🖨️ 인쇄 / PDF 저장</b>이
        가능합니다.
        <br />※ 사고사례 작성은 <b>관리자 로그인</b> 후 사용할 수 있습니다.
      </p>
    </div>
  );
};

export default AccidentCaseBoard;
