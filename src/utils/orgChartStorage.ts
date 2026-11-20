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
 *
 * **같은 칸에 상자가 두 개 있으면 CSS Grid 가 두 번째 상자를 다음 줄로
 * 밀어내므로, 이 함수는 절대 중복된 칸을 남기지 않습니다.**
 * (그 현상이 "상자를 추가하면 배열이 틀어지고 연결선이 끊기는" 원인이었습니다.)
 *
 * - `pinCenter` 상자는 항상 가운데 칸에 놓입니다 (가운데 칸은 예약됨).
 * - 일반 상자는 지정된 칸 → 비어 있으면 그 칸, 아니면 오른쪽(끝나면 왼쪽부터) 빈 칸.
 * - 칸이 모자라면 칸 수를 늘려 어떤 상자도 밀려나지 않게 합니다.
 * - 가운데 고정은 단마다 1개만 유효합니다 (앞에 있는 것을 우선).
 */
export const resolveTierLayout = (tier: OrgTier): OrgTier => {
  const units = Array.isArray(tier.units) ? tier.units : [];
  const hasPin = units.some(u => u.pinCenter);

  // 상자 수보다 칸이 적으면 반드시 겹칩니다 → 칸 수를 상자 수 이상으로 보정
  let cols = Math.max(resolveTierCols(tier), units.length, 1);
  // 가운데 고정 상자가 있으면 정확한 중앙(50%) 칸이 존재하도록 홀수 칸 유지
  if (hasPin && cols % 2 === 0) cols += 1;

  const mid = centerColOf(cols);
  const placed: OrgUnit[] = [];
  const taken = new Set<number>();
  let pinnedUsed = false;

  /** 왼쪽부터 첫 번째 빈 칸 */
  const firstFree = (from: number): number => {
    for (let c = from; c < cols; c++) if (!taken.has(c)) return c;
    for (let c = 0; c < cols; c++) if (!taken.has(c)) return c;
    return -1; // 칸이 모두 찼음 (위에서 보정했으므로 발생하지 않음)
  };

  /* 1) 가운데 고정 상자 먼저 자리 확보 */
  units.forEach(u => {
    if (u.pinCenter && !pinnedUsed) {
      pinnedUsed = true;
      taken.add(mid);
      placed.push({ ...u, col: mid });
    }
  });

  /* 2) 나머지 상자는 원하는 칸 → 이미 찼으면 가장 가까운 빈 칸 */
  units.forEach(u => {
    if (placed.some(x => x.id === u.id)) return; // 고정으로 이미 배치됨

    const want = Math.min(Math.max(u.col ?? 0, 0), cols - 1);
    const c = taken.has(want) ? firstFree(want) : want;
    if (c < 0) {
      // 이론상 도달하지 않지만, 안전하게 겹치지 않도록 임시 칸 부여
      placed.push({ ...u, col: want });
      return;
    }
    taken.add(c);
    placed.push({ ...u, col: c });
  });

  /* 원래 순서(업무분장표 순서)를 유지 */
  const order = new Map(units.map((u, i) => [u.id, i]));
  placed.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return {
    ...tier,
    cols,
    units: placed.map(u => (u.pinCenter && u.col !== mid ? { ...u, pinCenter: false } : u)),
  };
};

/* ------------------------------------------------------------------ */
/* 기본 서식 — 첨부자료(안전조직도) 계층을 그대로 따름                    */
/* ------------------------------------------------------------------ */

/** 현재 기본 서식 버전 (구버전 저장 데이터는 자동으로 새 구조로 이전) */
export const LAYOUT_VERSION = 3;

/**
 * 첨부자료(안전조직도)의 계층 구성.
 *
 * 현장 조직은 위에서 아래로 한 줄기(대표이사 → 현장 PM → …)로 내려오고,
 * **본사 안전팀은 그 줄기에서 옆으로 갈라져 나오는 참모 조직**으로 배치합니다.
 *   ① 대표이사
 *   ② ┌ 현장 PM                      — 줄기, 항상 가운데 (pinCenter)
 *      └ 본사 안전팀                  — 현장 PM 오른쪽 가지
 *   ③ 안전보건관리책임자(현장소장)    — 항상 가운데 (pinCenter)
 *   ④ 안전관리자
 *   ⑤ 관리감독자(공사) · (공무) · (품질) — 3칸으로 펼침
 *
 * `col` 은 단(段) 안에서의 가로 칸 번호(0부터), `cols` 는 그 단의 전체 칸 수입니다.
 * ②단은 3칸으로 두어 현장 PM 이 정확히 가운데(1번 칸, 50%)에 오고,
 * 본사 안전팀은 그 오른쪽 칸(2번 칸, 83%)에 놓여 옆 가지로 보입니다.
 * 상자가 1개뿐인 단은 1칸으로 두어 자동으로 정중앙에 놓입니다.
 */
const defaultTiers = (): OrgTier[] => [
  /* ① 대표이사 */
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
  /* ② 현장 PM  ─┬─  본사 안전팀 (오른쪽 옆 가지)
     한 단에 두 상자를 두어, 세로 줄기(현장 PM)에서 가로선이 갈라져
     본사 안전팀으로 이어지도록 합니다.
     - 3칸 중 현장 PM 은 가운데(1번 칸, 50%), 본사 안전팀은 오른쪽(2번 칸, 83%) */
  createOrgTier(
    'center',
    [
      createOrgUnit(
        '현장 PM',
        [
          createOrgMember('부사장', '이헌기', [
            '사업 총괄 및 안전보건 투자 결정',
            '발주처·감독기관 대응 창구',
            '현장 안전보건 성과 평가',
          ]),
        ],
        1,
        true // 현장 PM 은 세로 줄기의 중심 → 항상 가운데
      ),
      createOrgUnit(
        '본사 안전팀',
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
        2 // 현장 PM 오른쪽 칸 → 옆 가지로 표시
      ),
    ],
    3
  ),
  /* ③ 안전보건관리책임자(현장소장) */
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
        0,
        true // 안전보건관리책임자(현장소장)는 항상 가운데
      ),
    ],
    1
  ),
  /* ⑤ 안전관리자 */
  createOrgTier(
    'center',
    [
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
        0
      ),
    ],
    1
  ),
  /* ⑥ 관리감독자 — 공사 / 공무 / 품질 */
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
  layoutVersion: LAYOUT_VERSION,
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
        // ⚠️ pinCenter 를 반드시 보존해야 저장 후 다시 열어도 가운데 고정이 유지됩니다.
        ...(unit.pinCenter ? { pinCenter: true } : {}),
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

/* ------------------------------------------------------------------ */
/* 구버전 데이터 이전 (분사 → 본사, 4단 → 6단)                           */
/* ------------------------------------------------------------------ */

/** 구버전 상자 이름 → 새 상자 이름 (인원·업무를 이어받기 위한 별칭) */
const TITLE_ALIAS: Record<string, string> = {
  분사안전팀: '본사안전팀',
  분사pm: '현장pm',
  pm임원: '현장pm', // 사용자가 임의로 바꾼 이름도 이어받도록
};

/** 제목 비교용 정규화 — 공백·대소문자 차이를 무시합니다. */
const normTitle = (text: string): string => (text || '').replace(/\s+/g, '').toLowerCase();

/**
 * 구버전 기본 서식(4단, '분사 …')으로 저장된 조직도를 새 6단 서식으로 옮깁니다.
 *
 * - 상자 제목을 기준으로 대응시켜 **입력된 성명·연락처·담당업무를 그대로 보존**합니다.
 * - 구버전 흔적('분사')이 없으면 사용자가 직접 만든 구조로 보고 손대지 않습니다.
 * - 대응되지 않는 상자(사용자가 추가·개명한 것)는 원래 있던 단 위치에 붙여 남깁니다.
 */
const migrateLegacyChart = (chart: SiteOrgChart): SiteOrgChart => {
  const oldTiers = Array.isArray(chart.tiers) ? chart.tiers : [];
  const flat: { unit: OrgUnit; tierIndex: number }[] = [];
  oldTiers.forEach((tier, tierIndex) => {
    (Array.isArray(tier.units) ? tier.units : []).forEach(unit => flat.push({ unit, tierIndex }));
  });

  /* 구버전 서식이 아니면 그대로 둡니다. */
  const isLegacy = flat.some(({ unit }) => /분사/.test(unit.title || ''));
  if (!isLegacy) return chart;

  /* 제목 → 저장된 상자 (별칭 적용) */
  const bank = new Map<string, OrgUnit>();
  flat.forEach(({ unit }) => {
    const key = TITLE_ALIAS[normTitle(unit.title)] ?? normTitle(unit.title);
    if (!bank.has(key)) bank.set(key, unit);
  });

  const carried = new Set<string>();
  const tiers: OrgTier[] = defaultTiers().map(tier => ({
    ...tier,
    units: tier.units.map(def => {
      const saved = bank.get(normTitle(def.title));
      if (!saved) return def;
      carried.add(saved.id);
      return {
        // 새 위치·고정 상태는 기본 서식을 따르고, id·members 는 저장된 값을 사용
        ...def,
        id: saved.id,
        members: saved.members && saved.members.length > 0 ? saved.members : def.members,
      };
    }),
  }));

  /* 대응되지 않은 상자는 원래 있던 단 위치에 붙여 데이터를 잃지 않게 합니다. */
  flat.forEach(({ unit, tierIndex }) => {
    if (carried.has(unit.id)) return;
    const at = Math.min(Math.max(tierIndex, 0), tiers.length - 1);
    tiers[at] = { ...tiers[at], units: [...tiers[at].units, { ...unit }] };
  });

  return { ...chart, tiers, layoutVersion: LAYOUT_VERSION };
};

/* ------------------------------------------------------------------ */
/* v2 → v3 이전 (본사 안전팀을 별도 단 → 현장 PM 옆 가지로)              */
/* ------------------------------------------------------------------ */

/**
 * v2 서식에서는 '본사 안전팀'이 현장 PM **위의 독립된 단**으로 있었습니다.
 * v3 부터는 현장 PM 과 같은 단에 놓여 옆 가지로 표시되므로,
 * 저장된 조직도를 새 배치로 옮겨 줍니다.
 *
 * - 현장 PM 이 있는 단을 찾아 본사 안전팀을 그 단의 오른쪽 칸으로 합칩니다.
 * - **성명·연락처·담당업무는 그대로 보존**합니다.
 * - 사용자가 직접 단을 옮겨 놓은 경우(현장 PM 과 본사 안전팀이 이미 같은 단)는
 *   손대지 않습니다.
 */
const migrateSafetyTeamToSideBranch = (chart: SiteOrgChart): SiteOrgChart => {
  if ((chart.layoutVersion ?? 0) >= LAYOUT_VERSION) return chart;

  const tiers = (Array.isArray(chart.tiers) ? chart.tiers : []).map(t => ({
    ...t,
    units: Array.isArray(t.units) ? t.units : [],
  }));

  const isSafetyTeam = (u: OrgUnit) => normTitle(u.title) === '본사안전팀';
  const isSitePm = (u: OrgUnit) => normTitle(u.title) === '현장pm';

  /* 이미 같은 단에 있으면(사용자가 직접 배치) 건드리지 않습니다. */
  const alreadySideBySide = tiers.some(
    t => t.units.some(isSafetyTeam) && t.units.some(isSitePm)
  );
  if (alreadySideBySide) return { ...chart, layoutVersion: LAYOUT_VERSION };

  const teamTierIndex = tiers.findIndex(t => t.units.some(isSafetyTeam));
  const pmTierIndex = tiers.findIndex(t => t.units.some(isSitePm));
  if (teamTierIndex < 0 || pmTierIndex < 0) {
    return { ...chart, layoutVersion: LAYOUT_VERSION };
  }

  const teamUnit = tiers[teamTierIndex].units.find(isSafetyTeam);
  if (!teamUnit) return { ...chart, layoutVersion: LAYOUT_VERSION };

  /* 현장 PM 이 있는 단에 본사 안전팀을 오른쪽 칸으로 합칩니다.
     - 가운데 고정(pinCenter) 상자가 있으므로 홀수 칸을 유지합니다.
     - 현장 PM 은 가운데, 본사 안전팀은 바로 오른쪽 칸. */
  const pmTier = tiers[pmTierIndex];
  const others = pmTier.units.filter(u => !isSafetyTeam(u));
  const hasPin = others.some(u => u.pinCenter);

  let cols = Math.max(others.length + 1, 3);
  if (hasPin && cols % 2 === 0) cols += 1;

  const mid = centerColOf(cols);
  const mergedTier: OrgTier = {
    ...pmTier,
    cols,
    units: others.map(u => {
      if (!u.pinCenter) {
        /* 가운데 고정 상자는 그 자리에, 나머지는 가운데를 피해 왼쪽부터 */
        return u;
      }
      return { ...u, col: mid };
    }),
  };
  mergedTier.units = [
    ...mergedTier.units,
    { ...teamUnit, col: mid + 1, pinCenter: undefined },
  ];

  const nextTiers = tiers
    .map((t, i) => {
      if (i === pmTierIndex) return resolveTierLayout(mergedTier);
      /* 원래 단에서 본사 안전팀 상자를 빼냅니다 (복사가 아니라 이동). */
      if (i === teamTierIndex) return { ...t, units: t.units.filter(u => !isSafetyTeam(u)) };
      return t;
    })
    /* 본사 안전팀이 빠져 빈 단이 되면 제거합니다. */
    .filter((t, i) => i !== teamTierIndex || t.units.length > 0);

  return { ...chart, tiers: nextTiers, layoutVersion: LAYOUT_VERSION };
};

const normalize = (chart: SiteOrgChart, siteId: number, siteName: string): SiteOrgChart => {
  const migrated = migrateSafetyTeamToSideBranch(migrateLegacyChart(chart));
  return {
    ...createEmptyOrgChart(siteId, siteName),
    ...migrated,
    siteId,
    siteName: migrated.siteName || siteName,
    constructionName: migrated.constructionName || migrated.siteName || siteName,
    tiers:
      Array.isArray(migrated.tiers) && migrated.tiers.length > 0
        ? migrated.tiers.map(normalizeTier)
        : defaultTiers(),
    layoutVersion: LAYOUT_VERSION,
  };
};

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
