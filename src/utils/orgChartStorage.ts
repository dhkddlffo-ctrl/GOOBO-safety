import { SiteOrgChart, OrgTier, OrgUnit, OrgMember } from '../types';

/**
 * 현장별 안전 조직도 + 업무분장 저장소
 *
 * - LocalStorage 에 `gubo_org_charts` 키로 현장(siteId) 단위 저장합니다.
 * - 최초 진입 시 첨부자료(구보공영 안전조직도)의 계층을 기본 서식으로 제공하고,
 *   성명·연락처·담당업무는 담당자가 채우도록 비워 둡니다.
 */

const ORG_KEY = 'gubo_org_charts';

type OrgMap = Record<string, SiteOrgChart>;

export const generateOrgId = (prefix = 'org'): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

/* ------------------------------------------------------------------ */
/* 기본 생성자                                                          */
/* ------------------------------------------------------------------ */

export const createOrgMember = (
  position = '',
  name = '',
  duties: string[] = []
): OrgMember => ({
  id: generateOrgId('om'),
  position,
  name,
  phone: '',
  duties,
});

export const createOrgUnit = (title = '', members: OrgMember[] = []): OrgUnit => ({
  id: generateOrgId('ou'),
  title,
  members: members.length > 0 ? members : [createOrgMember()],
});

export const createOrgTier = (
  align: OrgTier['align'] = 'center',
  units: OrgUnit[] = []
): OrgTier => ({
  id: generateOrgId('ot'),
  align,
  units,
});

/* ------------------------------------------------------------------ */
/* 기본 서식 — 첨부자료(안전조직도) 계층을 그대로 따름                    */
/* ------------------------------------------------------------------ */

/**
 * 첨부자료(안전조직도)의 계층 구성
 *   ① 대표이사                                        — 가운데
 *   ② 분사 PM · 분사 안전팀                            — 좌우
 *   ③ 안전보건관리책임자(현장소장) · 안전관리자        — 좌우
 *   ④ 관리감독자(공사) · 관리감독자(공무) · 관리감독자(품질) — 3열
 *
 * 성명은 첨부자료 예시값을 넣어 두었으니, 다른 현장은 그대로 수정해 쓰시면 됩니다.
 */
const defaultTiers = (): OrgTier[] => [
  createOrgTier('center', [
    createOrgUnit('대표이사', [
      createOrgMember('대표', '이상영', [
        '안전보건 경영방침 수립·공표',
        '안전보건 예산·인력 등 자원 배정 승인',
        '중대재해 발생 시 최종 보고 및 대응 지휘',
      ]),
    ]),
  ]),
  createOrgTier('between', [
    createOrgUnit('분사 PM', [
      createOrgMember('부사장', '이헌기', [
        '사업 총괄 및 안전보건 투자 결정',
        '발주처·감독기관 대응 창구',
        '현장 안전보건 성과 평가',
      ]),
    ]),
    createOrgUnit('분사 안전팀', [
      createOrgMember('전무', '권기원', [
        '전사 안전보건계획 수립·이행 점검',
        '안전보건 교육·기술 지원',
      ]),
      createOrgMember('팀장', '왕일래', [
        '현장 안전보건 순회점검',
        '재해조사 및 재발방지대책 수립 지원',
      ]),
    ]),
  ]),
  createOrgTier('between', [
    createOrgUnit('안전보건관리책임자(현장소장)', [
      createOrgMember('소장', '박재부', [
        '현장 안전보건관리 총괄 책임',
        '작업중지 및 재개 명령',
        '안전보건협의체 구성·운영',
        '산업재해 발생 시 즉시 조치 및 보고',
      ]),
    ]),
    createOrgUnit('안전관리자', [
      createOrgMember('차장', '박철우', [
        '안전보건 점검 및 순회지도',
        '위험성평가 실시·개선 조치',
        '근로자 정기 안전보건교육 실시',
        '보호구 지급·착용 관리',
      ]),
    ]),
  ]),
  createOrgTier('between', [
    createOrgUnit('관리감독자(공사)', [
      createOrgMember('공사', '양정수', [
        '작업 전 안전점검회의(TBM) 주관',
        '소속 근로자 안전보건교육',
        '작업장 위험요인 확인·개선',
      ]),
    ]),
    createOrgUnit('관리감독자(공무)', [
      createOrgMember('공무', '김영준', [
        '협력업체 안전보건 서류 관리',
        '안전보건 관련 행정·기록 관리',
      ]),
    ]),
    createOrgUnit('관리감독자(품질)', [
      createOrgMember('품질', '홍사권', [
        '자재·시공 품질이 안전에 미치는 영향 관리',
        '품질점검 시 안전요인 병행 확인',
      ]),
    ]),
  ]),
];

/** 빈 서식 (현장명 미리 채움) */
export const createEmptyOrgChart = (siteId: number, siteName: string): SiteOrgChart => ({
  siteId,
  siteName,
  constructionName: siteName,
  author: '',
  tiers: defaultTiers(),
  note: '',
  updatedAt: '',
});

/* ------------------------------------------------------------------ */
/* 조회 / 저장                                                          */
/* ------------------------------------------------------------------ */

const readAll = (): OrgMap => {
  const raw = localStorage.getItem(ORG_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as OrgMap) : {};
  } catch {
    return {};
  }
};

const persist = (map: OrgMap): void => {
  localStorage.setItem(ORG_KEY, JSON.stringify(map));
};

/** 누락 필드 보정 (구버전 데이터·부분 저장 대비) */
const normalizeTier = (tier: OrgTier): OrgTier => ({
  id: tier.id || generateOrgId('ot'),
  align: tier.align === 'between' || tier.align === 'end' ? tier.align : 'center',
  units: Array.isArray(tier.units)
    ? tier.units.map(unit => ({
        id: unit.id || generateOrgId('ou'),
        title: unit.title || '',
        members: Array.isArray(unit.members)
          ? unit.members.map(m => ({
              id: m.id || generateOrgId('om'),
              position: m.position || '',
              name: m.name || '',
              phone: m.phone || '',
              duties: Array.isArray(m.duties) ? m.duties : [],
            }))
          : [],
      }))
    : [],
});

const normalize = (chart: SiteOrgChart, siteId: number, siteName: string): SiteOrgChart => ({
  ...createEmptyOrgChart(siteId, siteName),
  ...chart,
  siteId,
  siteName: chart.siteName || siteName,
  constructionName: chart.constructionName || chart.siteName || siteName,
  tiers: Array.isArray(chart.tiers) && chart.tiers.length > 0
    ? chart.tiers.map(normalizeTier)
    : defaultTiers(),
});

/** 조직도 조회 (없으면 기본 서식) */
export const getOrgChart = (siteId: number, siteName: string): SiteOrgChart => {
  const stored = readAll()[String(siteId)];
  if (!stored) return createEmptyOrgChart(siteId, siteName);
  return normalize(stored, siteId, siteName);
};

/** 조직도 저장 */
export const saveOrgChart = (chart: SiteOrgChart): void => {
  const map = readAll();
  map[String(chart.siteId)] = { ...chart, updatedAt: new Date().toISOString() };
  persist(map);
};

/** 조직도 삭제 (기본 서식으로 되돌림) */
export const deleteOrgChart = (siteId: number): void => {
  const map = readAll();
  delete map[String(siteId)];
  persist(map);
};

/* ------------------------------------------------------------------ */
/* 집계                                                                */
/* ------------------------------------------------------------------ */

/** 조직도 전체 인원 수 */
export const countOrgMembers = (chart: SiteOrgChart): number =>
  chart.tiers.reduce(
    (total, tier) => total + tier.units.reduce((sum, unit) => sum + unit.members.length, 0),
    0
  );

/** 담당업무가 1건이라도 입력된 인원 수 */
export const countDutyFilled = (chart: SiteOrgChart): number =>
  chart.tiers.reduce(
    (total, tier) =>
      total +
      tier.units.reduce(
        (sum, unit) => sum + unit.members.filter(m => m.duties.some(d => d.trim())).length,
        0
      ),
    0
  );
