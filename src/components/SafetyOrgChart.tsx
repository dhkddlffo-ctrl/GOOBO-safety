import React, { useState, useEffect, useMemo } from 'react';
import { SiteOrgChart as SiteOrgChartData, OrgTier, OrgMember } from '../types';
import {
  getOrgChart,
  saveOrgChart,
  createEmptyOrgChart,
  createOrgMember,
  createOrgUnit,
  createOrgTier,
  countOrgMembers,
  countDutyFilled,
} from '../utils/orgChartStorage';
import { isAuthenticated } from '../utils/auth';
import './SafetyOrgChart.css';

interface SafetyOrgChartProps {
  siteId: number;
  siteName: string;
  /** 현장 기본정보의 소장명 (현장소장 칸 자동 보완용) */
  siteManager?: string;
}

/** 2026-11-17T… → 2026년 11월 17일 */
const formatKoreanDate = (iso?: string): string => {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
};

const ALIGN_LABEL: Record<OrgTier['align'], string> = {
  center: '가운데',
  between: '양끝 정렬',
  end: '오른쪽',
};

/** 인쇄 대상 — 조직도만 / 업무분장표만 / 둘 다(각 1장) */
type PrintTarget = 'both' | 'chart' | 'duty';

/**
 * 현장별 안전 조직도 + 업무분장표
 *
 * - 첨부자료(구보공영 안전조직도)의 계층을 기본 서식으로 제공합니다.
 * - 조직도(단·상자·구성원)와 업무분장표를 각각 화면에서 직접 수정할 수 있습니다.
 * - 조직도는 **A4 가로(landscape)**, 업무분장표는 **A4 세로(portrait)** 로
 *   각각 1페이지씩 출력할 수 있습니다.
 */
const SafetyOrgChart: React.FC<SafetyOrgChartProps> = ({ siteId, siteName, siteManager }) => {
  const [chart, setChart] = useState<SiteOrgChartData>(() => getOrgChart(siteId, siteName));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SiteOrgChartData | null>(null);
  const [error, setError] = useState('');
  const [printTarget, setPrintTarget] = useState<PrintTarget>('both');

  const canManage = isAuthenticated();

  /* 현장 변경 시 다시 읽기 */
  useEffect(() => {
    setChart(getOrgChart(siteId, siteName));
    setEditing(false);
    setDraft(null);
    setError('');
  }, [siteId, siteName]);

  /* 인쇄가 끝나면 대상 표시를 기본(둘 다)으로 되돌림 */
  useEffect(() => {
    const onAfterPrint = () => setPrintTarget('both');
    window.addEventListener('afterprint', onAfterPrint);
    return () => window.removeEventListener('afterprint', onAfterPrint);
  }, []);

  /* 표시용 데이터: 편집 중에는 미리보기가 즉시 반영되도록 draft 우선 */
  const view = draft ?? chart;

  /** 업무분장표 행 (조직도 순서 유지) */
  const dutyRows = useMemo(
    () =>
      view.tiers.flatMap(tier =>
        tier.units.flatMap(unit =>
          unit.members.map(member => ({
            tierId: tier.id,
            unitId: unit.id,
            unit,
            member,
          }))
        )
      ),
    [view]
  );

  const memberCount = countOrgMembers(view);
  const dutyFilled = countDutyFilled(view);

  /* ---------------- 편집 시작 / 취소 / 저장 ---------------- */
  const startEdit = () => {
    if (!canManage) {
      alert('안전조직도 수정은 관리자 로그인 후 가능합니다.');
      return;
    }
    const base: SiteOrgChartData = {
      ...chart,
      tiers: chart.tiers.map(t => ({
        ...t,
        units: t.units.map(u => ({
          ...u,
          members: u.members.map(m => ({ ...m, duties: [...m.duties] })),
        })),
      })),
    };
    // 현장소장 성명이 비어 있으면 현장 기본정보의 소장명으로 보완
    if (siteManager) {
      base.tiers.forEach(tier =>
        tier.units.forEach(unit => {
          unit.members.forEach(m => {
            if (!m.name && (unit.title.includes('현장소장') || m.position === '소장')) {
              m.name = siteManager;
            }
          });
        })
      );
    }
    setDraft(base);
    setError('');
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraft(null);
    setEditing(false);
    setError('');
  };

  const saveEdit = () => {
    if (!draft) return;
    const hasMember = draft.tiers.some(t => t.units.some(u => u.members.length > 0));
    if (!hasMember) {
      setError('조직도에 구성원을 1명 이상 등록해주세요.');
      return;
    }
    saveOrgChart({ ...draft, siteId, siteName });
    setChart(getOrgChart(siteId, siteName));
    setDraft(null);
    setEditing(false);
    setError('');
  };

  /**
   * 인쇄 실행.
   * 대상(chart/duty/both)을 먼저 상태에 반영한 뒤, 페인트가 끝난 다음 print() 를
   * 호출해야 인쇄 미리보기에 올바른 레이아웃이 반영됩니다.
   */
  const printSection = (target: PrintTarget) => {
    if (editing) {
      alert('먼저 저장한 뒤 출력해주세요.');
      return;
    }
    setPrintTarget(target);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print());
    });
  };

  /* ---------------- draft 갱신 헬퍼 ---------------- */
  const patchTier = (tierId: string, fn: (tier: OrgTier) => OrgTier) => {
    setDraft(d => (d ? { ...d, tiers: d.tiers.map(t => (t.id === tierId ? fn(t) : t)) } : d));
  };

  const patchUnit = (
    tierId: string,
    unitId: string,
    fn: (unit: OrgTier['units'][number]) => OrgTier['units'][number]
  ) => {
    patchTier(tierId, tier => ({
      ...tier,
      units: tier.units.map(u => (u.id === unitId ? fn(u) : u)),
    }));
  };

  const patchMember = (
    tierId: string,
    unitId: string,
    memberId: string,
    fn: (member: OrgMember) => OrgMember
  ) => {
    patchUnit(tierId, unitId, unit => ({
      ...unit,
      members: unit.members.map(m => (m.id === memberId ? fn(m) : m)),
    }));
  };

  const setTierAlign = (tierId: string, align: OrgTier['align']) =>
    patchTier(tierId, tier => ({ ...tier, align }));

  const setUnitTitle = (tierId: string, unitId: string, title: string) =>
    patchUnit(tierId, unitId, unit => ({ ...unit, title }));

  const setMemberField = (
    tierId: string,
    unitId: string,
    memberId: string,
    key: 'position' | 'name' | 'phone',
    value: string
  ) => patchMember(tierId, unitId, memberId, m => ({ ...m, [key]: value }));

  const addDuty = (tierId: string, unitId: string, memberId: string) =>
    patchMember(tierId, unitId, memberId, m => ({ ...m, duties: [...m.duties, ''] }));

  const setDuty = (tierId: string, unitId: string, memberId: string, index: number, value: string) =>
    patchMember(tierId, unitId, memberId, m => ({
      ...m,
      duties: m.duties.map((d, i) => (i === index ? value : d)),
    }));

  const removeDuty = (tierId: string, unitId: string, memberId: string, index: number) =>
    patchMember(tierId, unitId, memberId, m => ({
      ...m,
      duties: m.duties.filter((_, i) => i !== index),
    }));

  /** 업무분장표의 담당업무 칸(줄바꿈 텍스트) → duties 배열 */
  const setDutiesFromText = (
    tierId: string,
    unitId: string,
    memberId: string,
    text: string
  ) => patchMember(tierId, unitId, memberId, m => ({ ...m, duties: text.split('\n') }));

  const addMember = (tierId: string, unitId: string) =>
    patchUnit(tierId, unitId, unit => ({
      ...unit,
      members: [...unit.members, createOrgMember()],
    }));

  const removeMember = (tierId: string, unitId: string, memberId: string) =>
    patchUnit(tierId, unitId, unit => ({
      ...unit,
      members: unit.members.filter(m => m.id !== memberId),
    }));

  const addUnit = (tierId: string) =>
    patchTier(tierId, tier => ({
      ...tier,
      units: [...tier.units, createOrgUnit('', [createOrgMember()])],
    }));

  const removeUnit = (tierId: string, unitId: string) =>
    patchTier(tierId, tier => ({ ...tier, units: tier.units.filter(u => u.id !== unitId) }));

  const addTier = () =>
    setDraft(d =>
      d
        ? {
            ...d,
            tiers: [...d.tiers, createOrgTier('between', [createOrgUnit('', [createOrgMember()])])],
          }
        : d
    );

  const removeTier = (tierId: string) =>
    setDraft(d => (d ? { ...d, tiers: d.tiers.filter(t => t.id !== tierId) } : d));

  const resetToDefault = () => {
    if (!confirm('조직도를 기본 서식(첨부자료 기준)으로 되돌리시겠습니까? 입력한 내용은 사라집니다.'))
      return;
    const base = createEmptyOrgChart(siteId, siteName);
    setDraft(base);
    saveOrgChart(base);
    setChart(getOrgChart(siteId, siteName));
    setDraft(null);
    setEditing(false);
  };

  /* ================= 조직도 (인쇄 단위 1) ================= */
  const chartSection = (
    <section className="so-chart">
      {view.tiers.map((tier, tierIndex) => {
        const multi = tier.units.length > 1;
        // 셀을 균등 분할하므로 첫/끝 셀의 중심은 50%/n 지점이 됩니다.
        const inset = `${50 / Math.max(tier.units.length, 1)}%`;
        return (
          <React.Fragment key={tier.id}>
            {tierIndex > 0 && <div className="so-stem" aria-hidden="true" />}
            <div
              className={`so-tier so-tier-${tier.align}${multi ? ' so-tier-branch' : ''}${
                tierIndex === 0 ? ' so-tier-first' : ''
              }`}
              style={
                multi ? ({ ['--so-inset' as string]: inset } as React.CSSProperties) : undefined
              }
            >
              {tier.units.map(unit => (
                <div className="so-cell" key={unit.id}>
                  <div className="so-unit">
                    <div className="so-unit-title">{unit.title || '부서명'}</div>
                    {unit.members.length === 0 && (
                      <div className="so-member">
                        <span className="so-member-label">성명</span>
                        <span className="so-member-value so-empty">미등록</span>
                      </div>
                    )}
                    {unit.members.map(member => (
                      <div className="so-member" key={member.id}>
                        <span className="so-member-label">{member.position || '직급'}</span>
                        <span className="so-member-value">{member.name || '성명 미입력'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </React.Fragment>
        );
      })}
    </section>
  );

  /* ================= 업무분장표 (인쇄 단위 2) ================= */
  const dutySection = (
    <section className="so-duty">
      <h2 className="so-duty-title">직책별 담당업무</h2>
      <table className="so-duty-table">
        <colgroup>
          <col style={{ width: '26%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '14%' }} />
          <col style={{ width: '40%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>직책 · 부서</th>
            <th>직급</th>
            <th>성명</th>
            <th>연락처</th>
            <th>담당업무</th>
          </tr>
        </thead>
        <tbody>
          {dutyRows.map(({ tierId, unitId, unit, member }) => {
            /* --- 수정 모드: 표에서 바로 편집 --- */
            if (editing) {
              return (
                <tr key={member.id}>
                  <td>
                    <input
                      className="so-tin"
                      type="text"
                      value={unit.title}
                      onChange={e => setUnitTitle(tierId, unitId, e.target.value)}
                      placeholder="직책·부서"
                    />
                  </td>
                  <td>
                    <input
                      className="so-tin so-tin-c"
                      type="text"
                      value={member.position}
                      onChange={e =>
                        setMemberField(tierId, unitId, member.id, 'position', e.target.value)
                      }
                      placeholder="직급"
                    />
                  </td>
                  <td>
                    <input
                      className="so-tin so-tin-c"
                      type="text"
                      value={member.name}
                      onChange={e =>
                        setMemberField(tierId, unitId, member.id, 'name', e.target.value)
                      }
                      placeholder="성명"
                    />
                  </td>
                  <td>
                    <input
                      className="so-tin so-tin-c"
                      type="tel"
                      value={member.phone}
                      onChange={e =>
                        setMemberField(tierId, unitId, member.id, 'phone', e.target.value)
                      }
                      placeholder="연락처"
                    />
                  </td>
                  <td>
                    <textarea
                      className="so-tta"
                      rows={Math.max(2, member.duties.length)}
                      value={member.duties.join('\n')}
                      onChange={e =>
                        setDutiesFromText(tierId, unitId, member.id, e.target.value)
                      }
                      placeholder="담당업무를 한 줄에 하나씩 입력"
                    />
                  </td>
                </tr>
              );
            }

            /* --- 보기 모드 --- */
            const duties = member.duties.filter(d => d.trim());
            return (
              <tr key={member.id}>
                <td className="so-td-unit">{unit.title || '-'}</td>
                <td className="so-td-center">{member.position || '-'}</td>
                <td className="so-td-center so-td-name">{member.name || '-'}</td>
                <td className="so-td-center">{member.phone || '-'}</td>
                <td className="so-td-duty">
                  {duties.length > 0 ? (
                    <ul>
                      {duties.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="so-empty-cell">미입력</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );

  /* ================= 출력물 (A4) ================= */
  /** 페이지 공통 머리글 */
  const pageHead = (title: string) => (
    <header className="so-head">
      <div className="so-head-top">
        <span className="so-head-construction">공사명: {view.constructionName || siteName}</span>
        <h1 className="so-head-title">{title}</h1>
        <span className="so-head-mark">구보공영(주)</span>
      </div>
      <div className="so-head-meta">
        <span>
          <strong>현장명</strong> {view.siteName || siteName}
        </span>
        <span>
          <strong>최종 수정일</strong> {formatKoreanDate(view.updatedAt)}
          {view.author ? ` (작성자: ${view.author})` : ''}
        </span>
      </div>
    </header>
  );

  const poster = (
    <div className={`so-poster so-print-${printTarget}`}>
      {/* ── 1장: 조직도 (A4 가로) ── */}
      <div className="so-page so-page-chart">
        {pageHead('안전조직도')}
        {chartSection}
      </div>

      {/* ── 2장: 업무분장표 (A4 세로) ── */}
      <div className="so-page so-page-duty">
        {pageHead('업무분장표')}
        {dutySection}
        {view.note.trim() && (
          <div className="so-note">
            <strong>비고</strong> {view.note}
          </div>
        )}
      </div>
    </div>
  );

  /* ================= 구조 편집 화면 ================= */
  const editor = draft && (
    <div className="so-editor">
      <div className="so-editor-block">
        <h3 className="so-editor-title">기본 정보</h3>
        <div className="so-form-row">
          <label>공사명</label>
          <input
            type="text"
            value={draft.constructionName}
            onChange={e => setDraft({ ...draft, constructionName: e.target.value })}
            placeholder={siteName}
          />
        </div>
        <div className="so-form-row">
          <label>작성자</label>
          <input
            type="text"
            value={draft.author}
            onChange={e => setDraft({ ...draft, author: e.target.value })}
            placeholder="예: 안전관리자 박철우"
          />
        </div>
        <div className="so-form-row">
          <label>비고</label>
          <input
            type="text"
            value={draft.note}
            onChange={e => setDraft({ ...draft, note: e.target.value })}
            placeholder="예: 2026.11.01 조직 개편 반영"
          />
        </div>
      </div>

      <p className="so-editor-hint">
        아래에서 <b>조직도 구조</b>(단·상자·구성원)를 편집하고, <b>담당업무</b>는 아래
        업무분장표에서 바로 입력할 수 있습니다.
      </p>

      {draft.tiers.map((tier, tierIndex) => (
        <div className="so-editor-block" key={tier.id}>
          <div className="so-editor-head">
            <h3 className="so-editor-title">{tierIndex + 1}단</h3>
            <div className="so-editor-head-actions">
              <select
                value={tier.align}
                onChange={e => setTierAlign(tier.id, e.target.value as OrgTier['align'])}
                title="가로 정렬"
              >
                {(Object.keys(ALIGN_LABEL) as OrgTier['align'][]).map(a => (
                  <option key={a} value={a}>
                    {ALIGN_LABEL[a]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="so-btn so-btn-del"
                onClick={() => removeTier(tier.id)}
                disabled={draft.tiers.length <= 1}
              >
                단 삭제
              </button>
            </div>
          </div>

          {tier.units.map(unit => (
            <div className="so-eunit" key={unit.id}>
              <div className="so-eunit-head">
                <input
                  className="so-eunit-title"
                  type="text"
                  value={unit.title}
                  onChange={e => setUnitTitle(tier.id, unit.id, e.target.value)}
                  placeholder="직책·부서명 (예: 안전관리자)"
                />
                <button
                  type="button"
                  className="so-btn so-btn-del"
                  onClick={() => removeUnit(tier.id, unit.id)}
                  disabled={tier.units.length <= 1}
                >
                  상자 삭제
                </button>
              </div>

              {unit.members.map(member => (
                <div className="so-emember" key={member.id}>
                  <div className="so-emember-row">
                    <input
                      type="text"
                      className="so-in-pos"
                      value={member.position}
                      onChange={e =>
                        setMemberField(tier.id, unit.id, member.id, 'position', e.target.value)
                      }
                      placeholder="직급"
                    />
                    <input
                      type="text"
                      className="so-in-name"
                      value={member.name}
                      onChange={e =>
                        setMemberField(tier.id, unit.id, member.id, 'name', e.target.value)
                      }
                      placeholder="성명"
                    />
                    <input
                      type="tel"
                      className="so-in-phone"
                      value={member.phone}
                      onChange={e =>
                        setMemberField(tier.id, unit.id, member.id, 'phone', e.target.value)
                      }
                      placeholder="연락처"
                    />
                    <button
                      type="button"
                      className="so-btn so-btn-del"
                      onClick={() => removeMember(tier.id, unit.id, member.id)}
                      disabled={unit.members.length <= 1}
                      title="구성원 삭제"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="so-eduty-list">
                    {member.duties.map((duty, dutyIndex) => (
                      <div className="so-eduty-row" key={dutyIndex}>
                        <span className="so-eduty-bullet">·</span>
                        <input
                          type="text"
                          value={duty}
                          onChange={e =>
                            setDuty(tier.id, unit.id, member.id, dutyIndex, e.target.value)
                          }
                          placeholder="담당업무 항목"
                        />
                        <button
                          type="button"
                          className="so-btn so-btn-del"
                          onClick={() => removeDuty(tier.id, unit.id, member.id, dutyIndex)}
                          title="업무 삭제"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="so-btn so-btn-add"
                      onClick={() => addDuty(tier.id, unit.id, member.id)}
                    >
                      ＋ 업무 항목 추가
                    </button>
                  </div>
                </div>
              ))}

              <button
                type="button"
                className="so-btn so-btn-add"
                onClick={() => addMember(tier.id, unit.id)}
              >
                ＋ 구성원 추가
              </button>
            </div>
          ))}

          <button type="button" className="so-btn so-btn-add" onClick={() => addUnit(tier.id)}>
            ＋ 상자(부서) 추가
          </button>
        </div>
      ))}

      <div className="so-editor-block">
        <button type="button" className="so-btn so-btn-add" onClick={addTier}>
          ＋ 단(계층) 추가
        </button>
      </div>
    </div>
  );

  /* ================= 렌더 ================= */
  return (
    <div className="so-wrap">
      <div className="so-toolbar">
        <div className="so-toolbar-info">
          <strong>
            {memberCount}명 · 담당업무 입력 {dutyFilled}명
          </strong>
          <span className="so-toolbar-sub">
            조직도와 업무분장표를 각각 A4 1페이지로 인쇄할 수 있습니다.
          </span>
        </div>
        <div className="so-toolbar-actions">
          {!editing ? (
            <>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => printSection('chart')}
                title="안전조직도만 A4 1페이지로 출력"
              >
                🖨️ 조직도 A4
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => printSection('duty')}
                title="업무분장표만 A4 1페이지로 출력"
              >
                🖨️ 업무분장표 A4
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => printSection('both')}
                title="조직도·업무분장표를 각각 1페이지씩 출력"
              >
                🖨️ 전체(각 1장)
              </button>
              <button className="btn btn-primary btn-sm" onClick={startEdit}>
                ✏️ 수정
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-secondary btn-sm" onClick={resetToDefault}>
                기본 서식으로
              </button>
              <button className="btn btn-secondary btn-sm" onClick={cancelEdit}>
                취소
              </button>
              <button className="btn btn-primary btn-sm" onClick={saveEdit}>
                저장
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div className="so-error">{error}</div>}

      {editing && editor}

      {poster}
    </div>
  );
};

export default SafetyOrgChart;
