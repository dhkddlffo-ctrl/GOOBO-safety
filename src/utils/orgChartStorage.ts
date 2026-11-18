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

export const createOrgUnit = (
  title = '',
  members: OrgMember[] = [],
  col?: number,
  pinCenter = false
): OrgUnit => ({
  id: generateOrgId('ou'),
  title,
  ...(col === undefined ? {} : { col }),
  ...(pinCenter ? { pinCenter: true } : {}),
  members: members.length > 0 ? members : [createOrgMember()],
});

export const createOrgTier = (
  align: OrgTier['align'] = 'center',
  units: OrgUnit[] = [],
  cols?: number
): OrgTier => ({
  id: generateOrgId('ot'),
  align,
  cols: cols ?? Math.max(units.length, 1),
  units,
});

/* ------------------------------------------------------------------ */
/* 단(段) 가로 배치 계산 — 컴포넌트와 저장소가 같은 규칙을 공유           */
/* ------------------------------------------------------------------ */

/** 단의 가로 칸 수: 저장값 → (최대 col + 1) → 상자 개수 → 1 */
export const resolveTierCols = (tier: OrgTier): number =>
  Math.max(tier.cols ?? 0, ...tier.units.map(u => (u.col ?? 0) + 1), tier.units.length, 1);

/** 가운데 칸 번호 (짝수 칸이면 왼쪽 가운데) */
export const centerColOf = (cols: number): number => Math.floor((cols - 1) / 2);

/**
 * 단의 배치를 정리합니다.
 * - `pinCenter` 상자는 항상 가운데 칸에 놓입니다 (가운데 칸은 예약됨).
 * - 일반 상자는 서로 겹치지 않도록 빈 칸으로 밀어냅니다.
 * - 가운데 고정은 단마다 1개만 유효합니다 (앞에 있는 것을 우선).
 */
export const resolveTierLayout = (tier: OrgTier): OrgTier => {
  const cols = resolveTierCols(tier) || 1;
  const mid = centerColOf(cols);
  const units: OrgUnit[] = [];
  const taken = new Set<number>();
  let pinnedUsed = false;

  /* 1) 가운데 고정 상자 먼저 자리 확보 */
  tier.units.forEach(u => {
    if (u.pinCenter && !pinnedUsed) {
      pinnedUsed = true;
      taken.add(mid);
      units.push({ ...u, col: mid });
    }
  });

  /* 2) 나머지 상자는 지정된 칸 → 비어 있으면 그 칸, 아니면 다음 빈 칸 */
  tier.units.forEach(u => {
    if (u.pinCenter && u.col === mid && units.some(x => x.id === u.id)) return; // 이미 배치됨
    const isPinnedAlready = units.some(x => x.id === u.id);
    if (isPinnedAlready) return;

    let c = Math.min(Math.max(u.col ?? 0, 0), cols - 1);
    let guard = 0;
    while (taken.has(c) && guard < cols) {
      c = (c + 1) % cols;
      guard++;
    }
    taken.add(c);
    units.push({ ...u, col: c });
  });

  /* 원래 순서(업무분장표 순서)를 유지 */
  const order = new Map(tier.units.map((u, i) => [u.id, i]));
  units.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return {
    ...tier,
    cols,
    units: units.map(u => (u.pinCenter && u.col !== mid ? { ...u, pinCenter: false } : u)),
  };
};

/* ------------------------------------------------------------------ */
/* 기본 서식 — 첨부자료(안전조직도) 계층을 그대로 따름                    */
/* ------------------------------------------------------------------ */

/**
 * 첨부자료(안전조직도)의 계층 구성
 *   ① 대표이사                                              — 가운데
 *   ② 분사 PM · 분사 안전팀                                  — 분사 안전팀 = 가운데
 *   ③ 안전보건관리책임자(현장소장) · 안전관리자              — 안전보건관리책임자 = 가운데
 *   ④ 관리감독자(공사) · 관리감독자(공무) · 관리감독자(품질)  — 공무 = 가운데
 *
 * `col` 은 단(段) 안에서의 가로 칸 번호(0부터), `cols` 는 그 단의 전체 칸 수입니다.
 * 3칸 서식에서 가운데 칸(1번)이 화면 정중앙이 되므로,
 * 분사 안전팀·안전보건관리책임자가 항상 가운데에 오도록 배치했습니다.
 * 편집 화면에서 ◀ ▶ 로 위치를 바꿀 수 있습니다.
 */
const defaultTiers = (): OrgTier[] => [
  createOrgTier(
    'center',
    [
      createOrgUnit(
        '대표이사',
        [
          createOrgMember('대표', '이상영', [
            '안전보건 경영방침 수립·공표',
            '안전보건 예산·인력 등 자원 배정 승인',
            '중대재해 발생 시 최종 보고 및 대응 지휘',
          ]),
        ],
        0
      ),
    ],
    1
  ),
  createOrgTier(
    'center',
    [
      createOrgUnit(
        '분사 PM',
        [
          createOrgMember('부사장', '이헌기', [
            '사업 총괄 및 안전보건 투자 결정',
            '발주처·감독기관 대응 창구',
            '현장 안전보건 성과 평가',
          ]),
        ],
        0
      ),
      createOrgUnit(
        '분사 안전팀',
        [
          createOrgMember('전무', '권기원', [
            '전사 안전보건계획 수립·이행 점검',
            '안전보건 교육·기술 지원',
          ]),
          createOrgMember('팀장', '왕일래', [
            '현장 안전보건 순회점검',
            '재해조사 및 재발방지대책 수립 지원',
          ]),
        ],
        1,
        true // 본사 안전팀은 항상 가운데
      ),
    ],
    3
  ),
  createOrgTier(
    'center',
    [
      createOrgUnit(
        '안전보건관리책임자(현장소장)',
        [
          createOrgMember('소장', '박재부', [
            '현장 안전보건관리 총괄 책임',
            '작업중지 및 재개 명령',
            '안전보건협의체 구성·운영',
            '산업재해 발생 시 즉시 조치 및 보고',
          ]),
        ],
        1,
        true // 안전보건관리책임자(현장소장)는 항상 가운데
      ),
      createOrgUnit(
        '안전관리자',
        [
          createOrgMember('차장', '박철우', [
            '안전보건 점검 및 순회지도',
            '위험성평가 실시·개선 조치',
            '근로자 정기 안전보건교육 실시',
            '보호구 지급·착용 관리',
          ]),
        ],
        2
      ),
    ],
    3
  ),
  createOrgTier(
    'center',
    [
      createOrgUnit(
        '관리감독자(공사)',
        [
          createOrgMember('공사', '양정수', [
            '작업 전 안전점검회의(TBM) 주관',
            '소속 근로자 안전보건교육',
            '작업장 위험요인 확인·개선',
          ]),
        ],
        0
      ),
      createOrgUnit(
        '관리감독자(공무)',
        [
          createOrgMember('공무', '김영준', [
            '협력업체 안전보건 서류 관리',
            '안전보건 관련 행정·기록 관리',
          ]),
        ],
        1
      ),
      createOrgUnit(
        '관리감독자(품질)',
        [
          createOrgMember('품질', '홍사권', [
            '자재·시공 품질이 안전에 미치는 영향 관리',
            '품질점검 시 안전요인 병행 확인',
          ]),
        ],
        2
      ),
    ],
    3
  ),
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
const normalizeTier = (tier: OrgTier): OrgTier => {
  const units = Array.isArray(tier.units)
    ? tier.units.map(unit => ({
        id: unit.id || generateOrgId('ou'),
        title: unit.title || '',
        col: typeof unit.col === 'number' && unit.col >= 0 ? unit.col : undefined,
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
    : [];

  /* col 이 하나도 없으면(구버전 데이터) 배열 순서대로 배치 */
  const hasCol = units.some(u => typeof u.col === 'number');
  const placed = hasCol
    ? units
    : units.map((u, i) => ({ ...u, col: i }));

  /* 칸 수: 저장값 → (최대 col + 1) → 상자 개수 순으로 결정, 상자 수보다 작을 수 없음 */
  const maxCol = placed.reduce((max, u) => Math.max(max, u.col ?? 0), -1) + 1;
  const cols = Math.max(
    typeof tier.cols === 'number' && tier.cols > 0 ? tier.cols : 0,
    maxCol,
    placed.length,
    1
  );

  return resolveTierLayout({
    id: tier.id || generateOrgId('ot'),
    align: tier.align === 'between' || tier.align === 'end' ? tier.align : 'center',
    cols,
    units: placed.map(u => ({ ...u, col: Math.min(u.col ?? 0, cols - 1) })),
  });
};

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
