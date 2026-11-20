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
  centerColOf,
  resolveTierCols,
  resolveTierLayout,
} from '../utils/orgChartStorage';
import { isAuthenticated } from '../utils/auth';
import { downloadOrgChartPng, safeFileName } from '../utils/orgChartExport';
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
 * 저장소(`resolveTierCols`)와 **같은 함수**를 사용해 화면과 데이터가 어긋나지 않게 합니다.
 * (따로 계산하면 연결선이 상자 중심과 어긋납니다)
 */
const tierCols = (tier: OrgTier): number => resolveTierCols(tier);

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
  const [exporting, setExporting] = useState(false);
  /** 드래그 중인 상자 */
  const [drag, setDrag] = useState<{ tierId: string; unitId: string } | null>(null);
  /** 드래그가 올라가 있는 단과 칸 (놓일 위치 미리보기) */
  const [dragOver, setDragOver] = useState<{ tierId: string; col: number } | null>(null);

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
  /**
   * 단을 갱신하고 **반드시** `resolveTierLayout` 을 통과시킵니다.
   * 이렇게 하면 어떤 편집(추가·이동·삭제)을 하더라도 같은 칸에 상자가 두 개
   * 놓이는 일이 없어, 상자가 다음 줄로 밀리거나 연결선이 끊기지 않습니다.
   */
  const patchTier = (tierId: string, fn: (tier: OrgTier) => OrgTier) => {
    setDraft(d =>
      d
        ? {
            ...d,
            tiers: d.tiers.map(t => (t.id === tierId ? resolveTierLayout(fn(t)) : t)),
          }
        : d
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

  /* ---------------- 상자 위치 이동 ---------------- */

  /**
   * 단의 칸 수 변경 (늘리면 좌우 여백이 생겨 상자를 가운데로 몰 수 있음)
   * 가운데 고정 상자가 있는 단은 정중앙 칸이 있어야 하므로 **홀수 칸**만 허용합니다.
   * (그래서 1칸 대신 2칸씩 늘리고 줄입니다)
   */
  const setTierCols = (tierId: string, delta: number) =>
    patchTier(tierId, tier => {
      const hasPin = tier.units.some(u => u.pinCenter);
      const step = hasPin ? 2 : 1;
      let next = Math.min(7, Math.max(tierCols(tier) + delta * step, 1));
      if (hasPin && next % 2 === 0) next = Math.min(7, next + 1);
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
      if (!current || current.pinCenter) return tier;
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
      // 가운데 고정된 상자는 밀려나지 않습니다.
      if (occupant?.pinCenter) return tier;
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
      const self = tier.units.find(u => u.id === unitId);
      if (!self || self.pinCenter) return tier;
      const from = unitCol(self, cols);
      const to = Math.min(Math.max(target, 0), cols - 1);
      if (from === to) return tier;
      const occupant = tier.units.find(u => u.id !== unitId && unitCol(u, cols) === to);
      // 가운데 고정된 상자는 다른 상자 때문에 밀려나지 않습니다.
      if (occupant?.pinCenter) return tier;
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

  /* ---------------- 단(段) 간 이동 ---------------- */

  /**
   * 상자를 다른 단으로 옮깁니다.
   * - `atCol` 을 주면 그 칸으로, 없으면 빈 칸을 찾아 배치합니다.
   * - `pinCenter` 상자는 옮겨간 단에서도 가운데 고정을 유지합니다
   *   (그 단에 이미 고정 상자가 있으면 고정을 넘겨받습니다).
   * - 원래 단이 비면 해당 단을 제거합니다(최소 1단은 유지).
   */
  const moveUnitToTier = (fromTierId: string, unitId: string, toTierId: string, atCol?: number) => {
    if (fromTierId === toTierId) return;
    setDraft(d => {
      if (!d) return d;
      const fromTier = d.tiers.find(t => t.id === fromTierId);
      const toTier = d.tiers.find(t => t.id === toTierId);
      if (!fromTier || !toTier) return d;

      const moving = fromTier.units.find(u => u.id === unitId);
      if (!moving) return d;

      const pin = !!moving.pinCenter;

      /* 옮겨갈 칸 결정: 지정 칸 → 그 칸이 비었으면 사용, 아니면 빈 칸 탐색 */
      let toCols = tierCols(toTier);
      if (pin) toCols = Math.max(toCols, 3); // 가운데 고정은 3칸 이상이어야 정중앙이 생김
      const used = new Map<number, string>();
      toTier.units.forEach(u => used.set(unitCol(u, toCols), u.id));

      let targetCol: number;
      if (pin) {
        targetCol = centerColOf(toCols);
      } else if (atCol !== undefined && atCol >= 0 && atCol < toCols && !used.has(atCol)) {
        targetCol = atCol;
      } else {
        let free = -1;
        for (let c = 0; c < toCols; c++) {
          if (!used.has(c)) {
            free = c;
            break;
          }
        }
        targetCol = free >= 0 ? free : toCols;
      }
      const needCols = Math.max(toCols, targetCol + 1);

      const nextTiers = d.tiers.map(t => {
        if (t.id === fromTierId) {
          return { ...t, units: t.units.filter(u => u.id !== unitId) };
        }
        if (t.id === toTierId) {
          // 고정 상자를 들여오면 기존 고정은 해제 (단마다 1개만 고정)
          const inherited = pin
            ? t.units.map(u => (u.pinCenter ? { ...u, pinCenter: undefined } : u))
            : t.units;
          return resolveTierLayout({
            ...t,
            cols: needCols,
            units: [...inherited, { ...moving, col: targetCol, pinCenter: pin || undefined }],
          });
        }
        return t;
      });

      /* 원래 단이 비었으면 제거 (단이 2개 이상일 때만) */
      const cleaned = nextTiers.filter(
        t => t.id !== fromTierId || t.units.length > 0 || nextTiers.length <= 1
      );
      return { ...d, tiers: cleaned };
    });
  };

  /**
   * 새 단을 만들어 상자를 그 단으로 옮깁니다.
   * `where` = before(위) / after(아래)
   */
  const moveUnitToNewTier = (tierId: string, unitId: string, where: 'before' | 'after') =>
    setDraft(d => {
      if (!d) return d;
      const idx = d.tiers.findIndex(t => t.id === tierId);
      if (idx < 0) return d;
      const tier = d.tiers[idx];
      const moving = tier.units.find(u => u.id === unitId);
      if (!moving) return d;

      const pin = !!moving.pinCenter;
      /* 상자가 1개뿐인 단은 1칸으로 만들어 자동으로 정중앙에 오게 합니다.
         (3칸으로 만들면 왼쪽 칸에 붙어 연결선과 어긋납니다) */
      const newTier = pin
        ? createOrgTier('center', [{ ...moving, col: 1, pinCenter: true }], 3)
        : createOrgTier('center', [{ ...moving, col: 0 }], 1);
      const rest = d.tiers.map(t =>
        t.id === tierId ? { ...t, units: t.units.filter(u => u.id !== unitId) } : t
      );
      const keepOld = tier.units.length > 1 || rest.length <= 1;
      const base = keepOld ? rest : rest.filter(t => t.id !== tierId);
      const at = base.findIndex(t => t.id === tierId);
      const insertAt = where === 'before' ? (at >= 0 ? at : idx) : at >= 0 ? at + 1 : base.length;

      return { ...d, tiers: [...base.slice(0, insertAt), newTier, ...base.slice(insertAt)] };
    });

  /* ---------------- 이미지(PNG) 내보내기 ---------------- */
  const exportImage = async () => {
    if (editing) {
      alert('먼저 저장한 뒤 이미지로 저장해주세요.');
      return;
    }
    if (exporting) return;
    setExporting(true);
    setError('');
    try {
      await downloadOrgChartPng(view, safeFileName(view.siteName || siteName, '안전조직도'), {
        title: '안전조직도',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '이미지 저장에 실패했습니다.');
    } finally {
      setExporting(false);
    }
  };

  /* ---------------- 드래그로 상자 옮기기 ---------------- */
  const dragStart = (tierId: string, unitId: string) => (e: React.DragEvent) => {
    if (!editing) return;
    setDrag({ tierId, unitId });
    e.dataTransfer.effectAllowed = 'move';
    // 일부 브라우저는 setData 없이는 dragstart 를 취소합니다.
    e.dataTransfer.setData('text/plain', `${tierId}:${unitId}`);
  };

  const dragEnd = () => {
    setDrag(null);
    setDragOver(null);
  };

  /** 단 위로 드래그가 들어왔을 때 — 어느 칸에 놓일지 계산 */
  const dragOverTier =
    (tierId: string, cols: number) => (e: React.DragEvent<HTMLDivElement>) => {
      if (!editing || !drag) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / Math.max(rect.width, 1);
      const col = Math.min(cols - 1, Math.max(0, Math.floor(ratio * cols)));
      if (dragOver?.tierId !== tierId || dragOver?.col !== col) setDragOver({ tierId, col });
    };

  /** 특정 칸 위로 드래그가 들어왔을 때 — 그 칸을 목표로 고정 */
  const dragOverCell = (tierId: string, col: number) => (e: React.DragEvent<HTMLDivElement>) => {
    if (!editing || !drag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOver?.tierId !== tierId || dragOver?.col !== col) setDragOver({ tierId, col });
  };

  /** 드롭 — 같은 단이면 칸 이동, 다른 단이면 단 간 이동 */
  const dropOn = (tierId: string) => (e: React.DragEvent<HTMLDivElement>) => {
    if (!editing || !drag) return;
    e.preventDefault();
    const target = dragOver?.tierId === tierId ? dragOver.col : undefined;
    const { tierId: fromTierId, unitId } = drag;
    setDrag(null);
    setDragOver(null);

    if (fromTierId === tierId) {
      if (target !== undefined) moveUnitTo(tierId, unitId, target);
      return;
    }
    moveUnitToTier(fromTierId, unitId, tierId, target);
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
            // 상자 1개짜리 단은 1칸으로 만들어 자동으로 정중앙에 오게 합니다.
            tiers: [...d.tiers, createOrgTier('center', [createOrgUnit('', [createOrgMember()])], 1)],
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
    <section className={`so-chart${editing ? ' is-editing' : ''}`}>
      {view.tiers.map((tier, tierIndex) => {
        const cols = tierCols(tier);
        // 각 상자의 칸 중심(%) — 그리드 n칸에서 k번 칸의 중심은 (k+0.5)/n
        const centers = tier.units.map(u => ((unitCol(u, cols) + 0.5) / cols) * 100);
        // 세로줄은 항상 가운데(50%)에서 내려오고, 가로 연결선은 그 지점을 포함하도록 함
        const busLeft = Math.min(50, ...centers);
        const busRight = Math.max(50, ...centers);
        const branch = tierIndex > 0;
        const isTarget = editing && dragOver?.tierId === tier.id;
        return (
          <React.Fragment key={tier.id}>
            {branch && <div className="so-stem" aria-hidden="true" />}
            <div
              className={`so-tier ${branch ? 'so-tier-branch' : 'so-tier-first'}${
                isTarget ? ' is-dragover' : ''
              }`}
              style={
                {
                  '--so-cols': cols,
                  '--so-bus-left': `${busLeft}%`,
                  '--so-bus-right': `${100 - busRight}%`,
                } as React.CSSProperties
              }
              onDragOver={editing ? dragOverTier(tier.id, cols) : undefined}
              onDrop={editing ? dropOn(tier.id) : undefined}
            >
              {tier.units.map(unit => {
                const col = unitCol(unit, cols);
                const isDragging = drag?.unitId === unit.id;
                const isDropCol = isTarget && dragOver?.col === col;
                const canDrag = editing && !unit.pinCenter;
                /* 세로 줄기는 항상 가운데(50%)에서 내려옵니다.
                   상자 높이가 단 높이보다 작을 때 그 아래 빈 구간을 이어 주려면
                   가운데 칸에만 보조 세로선을 그려야 합니다. */
                const isSpine = Math.abs(((col + 0.5) / cols) * 100 - 50) < 0.01;
                return (
                  <div
                    className={`so-cell${isSpine ? ' is-spine' : ''}${
                      isDragging ? ' is-dragging' : ''
                    }${isDropCol ? ' is-dropcol' : ''}`}
                    key={unit.id}
                    style={{ '--so-col': col + 1 } as React.CSSProperties}
                    draggable={canDrag}
                    onDragStart={canDrag ? dragStart(tier.id, unit.id) : undefined}
                    onDragEnd={canDrag ? dragEnd : undefined}
                    onDragOver={editing ? dragOverCell(tier.id, col) : undefined}
                  >
                    {editing && (
                      <span
                        className={`so-drag-handle${unit.pinCenter ? ' is-pinned' : ''}`}
                        title={
                          unit.pinCenter
                            ? '가운데 고정된 상자는 드래그할 수 없습니다'
                            : '끌어서 다른 칸·다른 단으로 옮길 수 있습니다'
                        }
                        aria-hidden="true"
                      >
                        {unit.pinCenter ? '📌' : '⠿'}
                      </span>
                    )}
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
                );
              })}
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

              {/* 다른 단으로 이동 */}
              <div className="so-emove so-emove-tier">
                <span className="so-emove-label">단 이동</span>
                <select
                  className="so-esel"
                  value=""
                  disabled={draft.tiers.length <= 1}
                  onChange={e => {
                    const to = e.target.value;
                    if (!to) return;
                    moveUnitToTier(tier.id, unit.id, to);
                  }}
                  title="이 상자를 다른 단으로 옮깁니다"
                >
                  <option value="">
                    {draft.tiers.length <= 1 ? '이동할 단 없음' : '다른 단 선택…'}
                  </option>
                  {draft.tiers.map((t, i) =>
                    t.id === tier.id ? null : (
                      <option key={t.id} value={t.id}>
                        {i + 1}단 ({t.units.length}개 상자)
                      </option>
                    )
                  )}
                </select>
                {/* 상자가 2개 이상인 단에서만 "새 단"이 의미가 있습니다.
                    (1개짜리 단은 원래 단이 사라지므로 결과가 같습니다) */}
                {tier.units.length > 1 && (
                  <>
                    <button
                      type="button"
                      className="so-btn so-btn-step"
                      onClick={() => moveUnitToNewTier(tier.id, unit.id, 'before')}
                      title="이 상자만 새 단으로 떼어내어 위에 배치"
                    >
                      ↑ 새 단
                    </button>
                    <button
                      type="button"
                      className="so-btn so-btn-step"
                      onClick={() => moveUnitToNewTier(tier.id, unit.id, 'after')}
                      title="이 상자만 새 단으로 떼어내어 아래에 배치"
                    >
                      ↓ 새 단
                    </button>
                  </>
                )}
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
              <button
                className="btn btn-secondary btn-sm"
                onClick={exportImage}
                disabled={exporting}
                title="조직도를 PNG 이미지 파일로 저장 (문서·메신저 첨부용)"
              >
                {exporting ? '저장 중…' : '🖼️ 이미지 저장'}
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
