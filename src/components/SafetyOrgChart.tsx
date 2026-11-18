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

/**
 * 단(段)의 전체 칸 수.
 * 저장된 cols → 가장 큰 col+1 → 상자 개수 → 1 순으로 결정합니다.
 */
const tierCols = (tier: OrgTier): number =>
  Math.max(
    tier.cols ?? 0,
    ...tier.units.map(u => (u.col ?? 0) + 1),
    tier.units.length,
    1
  );

/** 상자의 칸 번호 (0부터). 범위를 벗어나면 보정합니다. */
const unitCol = (unit: OrgTier['units'][number], cols: number): number =>
  Math.min(Math.max(unit.col ?? 0, 0), cols - 1);

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

  /* ---------------- 상자 위치 이동 ---------------- */

  /** 단의 칸 수 변경 (늘리면 좌우 여백이 생겨 상자를 가운데로 몰 수 있음) */
  const setTierCols = (tierId: string, delta: number) =>
    patchTier(tierId, tier => {
      const next = Math.min(7, Math.max(tierCols(tier) + delta, 1));
      return {
        ...tier,
        cols: next,
        units: tier.units.map(u => ({ ...u, col: Math.min(u.col ?? 0, next - 1) })),
      };
    });

  /**
   * 상자를 좌/우 칸으로 이동.
   * - 대상 칸에 다른 상자가 있으면 서로 자리를 맞바꿉니다.
   * - 칸 범위를 벗어나면 칸 수를 늘려 이동을 허용합니다.
   */
  const moveUnit = (tierId: string, unitId: string, delta: number) =>
    patchTier(tierId, tier => {
      const cols = tierCols(tier);
      const current = tier.units.find(u => u.id === unitId);
      if (!current) return tier;
      const from = unitCol(current, cols);
      const to = from + delta;

      if (to < 0 || to >= cols) {
        // 칸이 모자라면 한 칸 늘려서 이동
        const nextCols = Math.min(7, Math.max(cols + 1, to + 1));
        if (to < 0 || to >= nextCols) return tier;
        return {
          ...tier,
          cols: nextCols,
          units: tier.units.map(u => (u.id === unitId ? { ...u, col: to } : u)),
        };
      }

      const occupant = tier.units.find(u => u.id !== unitId && unitCol(u, cols) === to);
      return {
        ...tier,
        units: tier.units.map(u => {
          if (u.id === unitId) return { ...u, col: to };
          if (occupant && u.id === occupant.id) return { ...u, col: from };
          return u;
        }),
      };
    });

  /** 상자를 특정 칸으로 (가운데 정렬 버튼용) */
  const moveUnitTo = (tierId: string, unitId: string, target: number) =>
    patchTier(tierId, tier => {
      const cols = tierCols(tier);
      const from = unitCol(tier.units.find(u => u.id === unitId) ?? tier.units[0], cols);
      const to = Math.min(Math.max(target, 0), cols - 1);
      if (from === to) return tier;
      const occupant = tier.units.find(u => u.id !== unitId && unitCol(u, cols) === to);
      return {
        ...tier,
        units: tier.units.map(u => {
          if (u.id === unitId) return { ...u, col: to };
          if (occupant && u.id === occupant.id) return { ...u, col: from };
          return u;
        }),
      };
    });

  /**
   * 상자를 가운데 칸으로 (홀수 칸 기준 정중앙)
   * `pin` 을 true 로 주면 가운데 고정 상태가 됩니다.
   */
  const centerUnit = (tierId: string, unitId: string, pin = false) =>
    patchTier(tierId, tier => {
      const cols = tierCols(tier);
      // 짝수 칸이면 가운데가 두 칸이라 왼쪽 가운데를 사용
      const mid = Math.floor((cols - 1) / 2);
      const from = unitCol(tier.units.find(u => u.id === unitId) ?? tier.units[0], cols);
      const occupant = tier.units.find(u => u.id !== unitId && unitCol(u, cols) === mid);
      return {
        ...tier,
        // 가운데 고정은 단마다 1개만 유지
        units: tier.units.map(u => {
          if (u.id === unitId) return { ...u, col: mid, pinCenter: pin || undefined };
          const swapped = occupant && u.id === occupant.id ? { ...u, col: from } : u;
          return swapped.pinCenter ? { ...swapped, pinCenter: undefined } : swapped;
        }),
      };
    });

  /** 가운데 고정 토글 */
  const pinUnit = (tierId: string, unitId: string, pin: boolean) => {
    if (pin) {
      centerUnit(tierId, unitId, true);
      return;
    }
    patchUnit(tierId, unitId, unit => ({ ...unit, pinCenter: undefined }));
  };

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
        const cols = tierCols(tier);
        // 각 상자의 칸 중심(%) — 그리드 n칸에서 k번 칸의 중심은 (k+0.5)/n
        const centers = tier.units.map(u => ((unitCol(u, cols) + 0.5) / cols) * 100);
        // 세로줄은 항상 가운데(50%)에서 내려오고, 가로 연결선은 그 지점을 포함하도록 함
        const busLeft = Math.min(50, ...centers);
        const busRight = Math.max(50, ...centers);
        const branch = tierIndex > 0;
        return (
          <React.Fragment key={tier.id}>
            {branch && <div className="so-stem" aria-hidden="true" />}
            <div
              className={`so-tier ${branch ? 'so-tier-branch' : 'so-tier-first'}`}
              style={
                {
                  '--so-cols': cols,
                  '--so-bus-left': `${busLeft}%`,
                  '--so-bus-right': `${100 - busRight}%`,
                } as React.CSSProperties
              }
            >
              {tier.units.map(unit => (
                <div
                  className="so-cell"
                  key={unit.id}
                  style={{ '--so-col': unitCol(unit, cols) + 1 } as React.CSSProperties}
                >
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
            <h3 className="so-editor-title">
              {tierIndex + 1}단
              <span className="so-editor-cols">가로 {tierCols(tier)}칸</span>
            </h3>
            <div className="so-editor-head-actions">
              <button
                type="button"
                className="so-btn so-btn-step"
                onClick={() => setTierCols(tier.id, -1)}
                disabled={tierCols(tier) <= 1}
                title="가로 칸 줄이기"
              >
                칸 －
              </button>
              <button
                type="button"
                className="so-btn so-btn-step"
                onClick={() => setTierCols(tier.id, +1)}
                disabled={tierCols(tier) >= 7}
                title="가로 칸 늘리기 (좌우 여백이 생겨 상자를 가운데로 몰 수 있습니다)"
              >
                칸 ＋
              </button>
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

              {/* 상자 가로 위치 이동 */}
              <div className="so-emove">
                <span className="so-emove-label">위치</span>
                <button
                  type="button"
                  className="so-btn so-btn-step"
                  onClick={() => moveUnit(tier.id, unit.id, -1)}
                  disabled={!!unit.pinCenter}
                  title={unit.pinCenter ? '가운데 고정된 상자는 이동할 수 없습니다' : '왼쪽 칸으로 이동'}
                >
                  ◀
                </button>
                <span className="so-emove-pos">
                  {unit.pinCenter
                    ? '가운데 고정'
                    : `${unitCol(unit, tierCols(tier)) + 1} / ${tierCols(tier)}칸`}
                </span>
                <button
                  type="button"
                  className="so-btn so-btn-step"
                  onClick={() => moveUnit(tier.id, unit.id, +1)}
                  disabled={!!unit.pinCenter}
                  title={unit.pinCenter ? '가운데 고정된 상자는 이동할 수 없습니다' : '오른쪽 칸으로 이동'}
                >
                  ▶
                </button>
                <button
                  type="button"
                  className="so-btn so-btn-center"
                  onClick={() => centerUnit(tier.id, unit.id)}
                  disabled={!!unit.pinCenter}
                  title="이 상자를 단의 가운데 칸으로"
                >
                  가운데로
                </button>
                <button
                  type="button"
                  className="so-btn so-btn-step"
                  onClick={() => moveUnitTo(tier.id, unit.id, tierCols(tier) - 1)}
                >
                  끝으로
                </button>
                <label
                  className={`so-eping${unit.pinCenter ? ' is-on' : ''}`}
                  title="체크하면 이 상자는 항상 단의 가운데에 고정됩니다"
                >
                  <input
                    type="checkbox"
                    checked={!!unit.pinCenter}
                    onChange={e => pinUnit(tier.id, unit.id, e.target.checked)}
                  />
                  가운데 고정
                </label>
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
