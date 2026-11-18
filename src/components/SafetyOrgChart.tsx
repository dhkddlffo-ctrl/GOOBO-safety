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

/**
 * 현장별 안전 조직도 + 업무분장표
 *
 * - 첨부자료(구보공영 안전조직도)의 계층을 기본 서식으로 제공합니다.
 * - 구성원마다 담당업무 항목을 자유롭게 추가·삭제할 수 있습니다.
 * - A4 1페이지로 인쇄해 게시판에 부착할 수 있습니다.
 */
const SafetyOrgChart: React.FC<SafetyOrgChartProps> = ({ siteId, siteName, siteManager }) => {
  const [chart, setChart] = useState<SiteOrgChartData>(() => getOrgChart(siteId, siteName));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SiteOrgChartData | null>(null);
  const [error, setError] = useState('');

  const canManage = isAuthenticated();

  /* 현장 변경 시 다시 읽기 */
  useEffect(() => {
    setChart(getOrgChart(siteId, siteName));
    setEditing(false);
    setDraft(null);
    setError('');
  }, [siteId, siteName]);

  /* 표시용 데이터: 편집 중에는 미리보기가 즉시 반영되도록 draft 우선 */
  const view = draft ?? chart;

  /** 업무분장표 행 (조직도 순서 유지) */
  const dutyRows = useMemo(
    () =>
      view.tiers.flatMap(tier =>
        tier.units.flatMap(unit =>
          unit.members.map(member => ({ tierId: tier.id, unit, member }))
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
    const base = { ...chart, tiers: chart.tiers.map(t => ({ ...t, units: t.units.map(u => ({ ...u, members: u.members.map(m => ({ ...m, duties: [...m.duties] })) })) })) };
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

  const handlePrint = () => {
    if (editing) {
      alert('먼저 저장한 뒤 출력해주세요.');
      return;
    }
    window.print();
  };

  /* ---------------- draft 갱신 헬퍼 ---------------- */
  const patchTier = (tierId: string, fn: (tier: OrgTier) => OrgTier) => {
    setDraft(d =>
      d ? { ...d, tiers: d.tiers.map(t => (t.id === tierId ? fn(t) : t)) } : d
    );
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

  /** 빈 업무 항목을 채워 넣음 (인쇄 시 빈 줄 제거) */
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

  const addMember = (tierId: string, unitId: string) =>
    patchUnit(tierId, unitId, unit => ({ ...unit, members: [...unit.members, createOrgMember()] }));

  const removeMember = (tierId: string, unitId: string, memberId: string) =>
    patchUnit(tierId, unitId, unit => ({
      ...unit,
      members: unit.members.filter(m => m.id !== memberId),
    }));

  const addUnit = (tierId: string) =>
    patchTier(tierId, tier => ({ ...tier, units: [...tier.units, createOrgUnit('', [createOrgMember()])] }));

  const removeUnit = (tierId: string, unitId: string) =>
    patchTier(tierId, tier => ({ ...tier, units: tier.units.filter(u => u.id !== unitId) }));

  const addTier = () =>
    setDraft(d => (d ? { ...d, tiers: [...d.tiers, createOrgTier('between', [createOrgUnit('', [createOrgMember()])])] } : d));

  const removeTier = (tierId: string) =>
    setDraft(d => (d ? { ...d, tiers: d.tiers.filter(t => t.id !== tierId) } : d));

  const resetToDefault = () => {
    if (!confirm('조직도를 기본 서식(첨부자료 기준)으로 되돌리시겠습니까? 입력한 내용은 사라집니다.')) return;
    const base = createEmptyOrgChart(siteId, siteName);
    setDraft(base);
    saveOrgChart(base);
    setChart(getOrgChart(siteId, siteName));
    setDraft(null);
    setEditing(false);
  };

  /* ================= 게시판(출력물) ================= */
  const poster = (
    <div className="so-poster">
      <header className="so-head">
        <div className="so-head-top">
          <span className="so-head-construction">공사명: {view.constructionName || siteName}</span>
          <h1 className="so-head-title">안전조직도</h1>
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

      {/* 조직도 */}
      <section className="so-chart">
        {view.tiers.map((tier, tierIndex) => {
          const multi = tier.units.length > 1;
          const inset = `${50 / Math.max(tier.units.length, 1)}%`;
          return (
            <React.Fragment key={tier.id}>
              {tierIndex > 0 && <div className="so-stem" aria-hidden="true" />}
              <div
                className={`so-tier so-tier-${tier.align}${multi ? ' so-tier-branch' : ''}`}
                style={multi ? ({ ['--so-inset' as string]: inset } as React.CSSProperties) : undefined}
              >
                {tier.units.map(unit => (
                  <div className="so-unit" key={unit.id}>
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
                ))}
              </div>
            </React.Fragment>
          );
        })}
      </section>

      {/* 업무분장표 */}
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
            {dutyRows.map(({ unit, member }) => {
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

      {view.note.trim() && (
        <div className="so-note">
          <strong>비고</strong> {view.note}
        </div>
      )}
    </div>
  );

  /* ================= 편집 화면 ================= */
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
                      onChange={e => setMemberField(tier.id, unit.id, member.id, 'position', e.target.value)}
                      placeholder="직급"
                    />
                    <input
                      type="text"
                      className="so-in-name"
                      value={member.name}
                      onChange={e => setMemberField(tier.id, unit.id, member.id, 'name', e.target.value)}
                      placeholder="성명"
                    />
                    <input
                      type="tel"
                      className="so-in-phone"
                      value={member.phone}
                      onChange={e => setMemberField(tier.id, unit.id, member.id, 'phone', e.target.value)}
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
                          onChange={e => setDuty(tier.id, unit.id, member.id, dutyIndex, e.target.value)}
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
            A4 1페이지로 인쇄해 사무실·탈의실 게시판에 부착할 수 있습니다.
          </span>
        </div>
        <div className="so-toolbar-actions">
          {!editing ? (
            <>
              <button className="btn btn-secondary btn-sm" onClick={handlePrint}>
                🖨️ 출력 / PDF
              </button>
              <button className="btn btn-primary btn-sm" onClick={startEdit}>
                ✏️ 조직도 수정
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
