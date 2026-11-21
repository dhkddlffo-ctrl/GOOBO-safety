import {
  SiteSafetyPolicy,
  SiteSafetyPolicyPlanRow,
  SiteSafetyPolicyEvalItem,
  SiteSafetyPolicyBoardPost,
  SiteSafetyPolicyDocSnapshot,
  PolicyPaper,
  PolicyDocKind,
} from '../types';

/**
 * 현장별 현장소장 안전보건 경영방침 저장소
 *
 * - LocalStorage 에 `gubo_safety_policies` 키로 현장(siteId) 단위 저장합니다.
 * - 하나의 레코드가 3종 문서를 함께 보관합니다.
 *     1) 경영방침 (방침 · 목표 · 세부추진계획 · 서명)
 *     2) 세부추진계획표 (추진계획별 관리담당 · 점검주기 · 점검방법 · 목표)
 *     3) 성과평가표 (평가항목별 지표 · 배점 · 실적 · 획득점수)
 * - 문서별 인쇄 용지(A4 / A3)를 `paper` 에 함께 저장합니다.
 * - 도장·서명 이미지는 문서 저장소와 동일하게 IndexedDB 를 쓰므로
 *   `sealImageKey` 에 파일 키만 보관합니다.
 */

const POLICY_KEY = 'gubo_safety_policies';

type PolicyMap = Record<string, SiteSafetyPolicy>;

/** 세부추진계획 기본 문구 (회사 서식) */
const DEFAULT_ACTION_PLANS = [
  '개인안전장구 착용 생활화 정착',
  'T.B.M시 작업내용에 따른 위험요소 도출 및 안전대책 수립',
  '현실괴리된 안전교육 탈피로 감성안전 실시',
];

/** 행 식별자 생성 */
export const generatePolicyRowId = (prefix = 'pr'): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** 세부추진계획표 빈 행 */
export const createPlanRow = (plan = ''): SiteSafetyPolicyPlanRow => ({
  id: generatePolicyRowId('pr'),
  plan,
  owner: '',
  cycle: '매월',
  method: '',
  target: '',
  note: '',
});

/** 연중 월 목록 (1월 ~ 12월) */
export const POLICY_MONTHS = [
  '1월',
  '2월',
  '3월',
  '4월',
  '5월',
  '6월',
  '7월',
  '8월',
  '9월',
  '10월',
  '11월',
  '12월',
] as const;

/** 12칸짜리 빈 월별 실적 */
export const emptyMonths = (): boolean[] => new Array(12).fill(false);

/** 성과평가표 빈 행 */
export const createEvalItem = (): SiteSafetyPolicyEvalItem => ({
  id: generatePolicyRowId('ev'),
  item: '',
  indicator: '',
  method: '',
  weight: 0,
  result: '',
  months: emptyMonths(),
  score: 0,
  note: '',
});

/** 세부추진계획표 기본값 — 방침의 세부추진계획을 관리담당·점검주기와 함께 편성 */
const DEFAULT_PLAN_ROWS = (): SiteSafetyPolicyPlanRow[] => [
  {
    id: generatePolicyRowId('pr'),
    plan: '개인안전장구 착용 생활화 정착',
    owner: '안전관리자',
    cycle: '매일',
    method: '작업 전 순회점검 및 착용상태 확인',
    target: '개인안전장구 착용률 100%',
    note: '미착용자 즉시 작업중지',
  },
  {
    id: generatePolicyRowId('pr'),
    plan: 'T.B.M시 작업내용에 따른 위험요소 도출 및 안전대책 수립',
    owner: '관리감독자',
    cycle: '매일',
    method: 'TBM 실시 후 위험요인 기록부 확인',
    target: 'TBM 실시율 100%',
    note: '작업 전 10분 이상 실시',
  },
  {
    id: generatePolicyRowId('pr'),
    plan: '현실괴리된 안전교육 탈피로 감성안전 실시',
    owner: '안전관리자',
    cycle: '매월',
    method: '안전교육일지 및 참석자 서명 확인',
    target: '안전교육 이수율 100%',
    note: '월 1회 이상 실시',
  },
];

/** 성과평가표 기본값 — 배점 합계 100점 */
const DEFAULT_EVAL_ITEMS = (): SiteSafetyPolicyEvalItem[] => [
  {
    id: generatePolicyRowId('ev'),
    item: '안전보건 목표 달성',
    indicator: '무재해 현장 달성 (재해 0건)',
    method: '재해 발생 건수 확인',
    weight: 30,
    result: '',
    months: emptyMonths(),
    score: 0,
    note: '',
  },
  {
    id: generatePolicyRowId('ev'),
    item: '개인안전장구 착용',
    indicator: '개인안전장구 착용률 100%',
    method: '현장 순회점검 결과 확인',
    weight: 20,
    result: '',
    months: emptyMonths(),
    score: 0,
    note: '',
  },
  {
    id: generatePolicyRowId('ev'),
    item: 'T.B.M 실시',
    indicator: 'TBM 실시율 100%',
    method: 'TBM 기록부 확인',
    weight: 20,
    result: '',
    months: emptyMonths(),
    score: 0,
    note: '',
  },
  {
    id: generatePolicyRowId('ev'),
    item: '안전보건 교육',
    indicator: '안전교육 이수율 100%',
    method: '안전교육일지 확인',
    weight: 15,
    result: '',
    months: emptyMonths(),
    score: 0,
    note: '',
  },
  {
    id: generatePolicyRowId('ev'),
    item: '위험성평가 실시',
    indicator: '정기 위험성평가 연 2회 이상',
    method: '위험성평가 결과보고서 확인',
    weight: 15,
    result: '',
    months: emptyMonths(),
    score: 0,
    note: '',
  },
];

/** 기본 용지 설정 */
const defaultPaper = (): Record<PolicyDocKind, PolicyPaper> => ({
  policy: 'A4',
  plan: 'A4',
  eval: 'A4',
});

/** 기본 게시판 (문서별 빈 목록) */
export const defaultBoards = (): Record<PolicyDocKind, SiteSafetyPolicyBoardPost[]> => ({
  policy: [],
  plan: [],
  eval: [],
});

/** 기본 서식 (회사양식 그대로 + 현장명만 미리 채움) */
export const createEmptySafetyPolicy = (
  siteId: number,
  siteName: string,
  signerName = '',
): SiteSafetyPolicy => ({
  siteId,
  siteName,
  title: '현장소장 안전보건 경영방침',
  statement: '적극적인 사고방식으로 전 인원이 참여하는 안전 실현',
  goal: '참여하는 안전으로 무재해 현장 달성',
  actionPlans: [...DEFAULT_ACTION_PLANS],
  planRows: DEFAULT_PLAN_ROWS(),
  evalItems: DEFAULT_EVAL_ITEMS(),
  evalTerm: '',
  evalNote: '',
  declaredAt: todayISO(),
  signerTitle: '현장소장',
  signerName,
  sealImageKey: undefined,
  paper: defaultPaper(),
  boards: defaultBoards(),
  updatedAt: '',
});

/** 오늘 날짜 (YYYY-MM-DD) */
function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 문자열 안전 변환 */
const asText = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

/** 숫자 안전 변환 */
const asNumber = (value: unknown): number => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** 세부추진계획표 행 보정 */
const normalizePlanRow = (row: unknown): SiteSafetyPolicyPlanRow => {
  const raw = (row ?? {}) as Partial<SiteSafetyPolicyPlanRow>;
  return {
    id: asText(raw.id) || generatePolicyRowId('pr'),
    plan: asText(raw.plan),
    owner: asText(raw.owner),
    cycle: asText(raw.cycle),
    method: asText(raw.method),
    target: asText(raw.target),
    note: asText(raw.note),
  };
};

/** 성과평가표 행 보정 */
const normalizeEvalItem = (item: unknown): SiteSafetyPolicyEvalItem => {
  const raw = (item ?? {}) as Partial<SiteSafetyPolicyEvalItem>;
  const months = Array.isArray(raw.months) ? raw.months : [];
  return {
    id: asText(raw.id) || generatePolicyRowId('ev'),
    item: asText(raw.item),
    indicator: asText(raw.indicator),
    method: asText(raw.method),
    weight: asNumber(raw.weight),
    result: asText(raw.result),
    months: Array.from({ length: 12 }, (_, i) => months[i] === true),
    score: asNumber(raw.score),
    note: asText(raw.note),
  };
};

/** 용지 설정 보정 (문서별로 누락된 값만 A4 로 채움) */
const normalizePaper = (paper: unknown): Record<PolicyDocKind, PolicyPaper> => {
  const raw = (paper ?? {}) as Partial<Record<PolicyDocKind, PolicyPaper>>;
  const pick = (value: unknown): PolicyPaper => (value === 'A3' ? 'A3' : 'A4');
  return { policy: pick(raw.policy), plan: pick(raw.plan), eval: pick(raw.eval) };
};

/** 작성 문서 내용 보정 */
const normalizeDocSnapshot = (content: unknown): SiteSafetyPolicyDocSnapshot => {
  const raw = (content ?? {}) as Partial<SiteSafetyPolicyDocSnapshot>;
  return {
    title: asText(raw.title),
    statement: asText(raw.statement),
    goal: asText(raw.goal),
    actionPlans: Array.isArray(raw.actionPlans)
      ? raw.actionPlans.filter((p): p is string => typeof p === 'string')
      : [],
    planRows: Array.isArray(raw.planRows) ? raw.planRows.map(normalizePlanRow) : [],
    evalItems: Array.isArray(raw.evalItems) ? raw.evalItems.map(normalizeEvalItem) : [],
    evalTerm: asText(raw.evalTerm),
    evalNote: asText(raw.evalNote),
    declaredAt: asText(raw.declaredAt),
    signerTitle: asText(raw.signerTitle),
    signerName: asText(raw.signerName),
    sealImageKey: asText(raw.sealImageKey) || undefined,
  };
};

/** 게시글 보정 — 직접 작성한 문서(kind: 'doc')와 올린 파일(kind: 'file')을 함께 보관 */
const normalizeBoardPost = (post: unknown): SiteSafetyPolicyBoardPost => {
  const raw = (post ?? {}) as Partial<SiteSafetyPolicyBoardPost>;
  const base: SiteSafetyPolicyBoardPost = {
    id: asText(raw.id) || generatePolicyRowId('bd'),
    kind: raw.kind === 'doc' ? 'doc' : 'file',
    title: asText(raw.title),
    fileName: asText(raw.fileName),
    storageKey: asText(raw.storageKey),
    size: asNumber(raw.size),
    author: asText(raw.author),
    createdAt: asText(raw.createdAt),
  };
  if (base.kind === 'doc' && raw.content) {
    base.content = normalizeDocSnapshot(raw.content);
  }
  return base;
};

/** 게시판 목록 보정 (문서별로 누락된 목록은 빈 배열) */
const normalizeBoards = (boards: unknown): Record<PolicyDocKind, SiteSafetyPolicyBoardPost[]> => {
  const raw = (boards ?? {}) as Partial<Record<PolicyDocKind, unknown>>;
  const pick = (value: unknown): SiteSafetyPolicyBoardPost[] =>
    Array.isArray(value) ? value.map(normalizeBoardPost) : [];
  return { policy: pick(raw.policy), plan: pick(raw.plan), eval: pick(raw.eval) };
};

/* ------------------------------------------------------------------ */
/* 조회 / 저장                                                          */
/* ------------------------------------------------------------------ */

const readAll = (): PolicyMap => {
  const raw = localStorage.getItem(POLICY_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as PolicyMap) : {};
  } catch {
    return {};
  }
};

const persist = (map: PolicyMap): void => {
  localStorage.setItem(POLICY_KEY, JSON.stringify(map));
};

/**
 * 저장된 데이터에 누락된 필드가 있어도 안전하도록 보정합니다.
 * (ask#21 까지 저장된 레코드에는 planRows / evalItems / paper 가 없으므로
 *  기본값으로 채워 마이그레이션합니다.)
 */
const normalize = (
  policy: SiteSafetyPolicy,
  siteId: number,
  siteName: string,
): SiteSafetyPolicy => {
  const base = createEmptySafetyPolicy(siteId, siteName);
  const legacyPlans = Array.isArray(policy.actionPlans) ? policy.actionPlans : [];

  return {
    ...base,
    ...policy,
    siteId,
    siteName: policy.siteName || siteName,
    actionPlans: legacyPlans,
    planRows: Array.isArray(policy.planRows)
      ? policy.planRows.map(normalizePlanRow)
      : base.planRows,
    evalItems: Array.isArray(policy.evalItems)
      ? policy.evalItems.map(normalizeEvalItem)
      : base.evalItems,
    evalTerm: asText(policy.evalTerm),
    evalNote: asText(policy.evalNote),
    paper: normalizePaper(policy.paper),
    boards: normalizeBoards(policy.boards),
  };
};

/** 경영방침 조회 (없으면 회사 서식 기본값 반환) */
export const getSafetyPolicy = (siteId: number, siteName: string): SiteSafetyPolicy => {
  const stored = readAll()[String(siteId)];
  if (!stored) return createEmptySafetyPolicy(siteId, siteName);
  return normalize(stored, siteId, siteName);
};

/** 경영방침 저장 */
export const saveSafetyPolicy = (policy: SiteSafetyPolicy): void => {
  const map = readAll();
  map[String(policy.siteId)] = { ...policy, updatedAt: new Date().toISOString() };
  persist(map);
};

/** 경영방침 삭제 (회사 서식 기본값으로 되돌림) */
export const deleteSafetyPolicy = (siteId: number): void => {
  const map = readAll();
  delete map[String(siteId)];
  persist(map);
};

/* ------------------------------------------------------------------ */
/* 집계 (성과평가표)                                                    */
/* ------------------------------------------------------------------ */

/** 배점 합계 */
export const sumEvalWeight = (items: SiteSafetyPolicyEvalItem[]): number =>
  items.reduce((sum, item) => sum + item.weight, 0);

/** 획득점수 합계 */
export const sumEvalScore = (items: SiteSafetyPolicyEvalItem[]): number =>
  items.reduce((sum, item) => sum + item.score, 0);

/** 달성률(%) — 배점 합계가 0 이면 0 */
export const evalRate = (items: SiteSafetyPolicyEvalItem[]): number => {
  const weight = sumEvalWeight(items);
  if (weight <= 0) return 0;
  return Math.round((sumEvalScore(items) / weight) * 1000) / 10;
};

/** 해당 월(0 = 1월)에 체크된 평가항목 수 — 표 하단 월별 집계 */
export const monthCheckCount = (items: SiteSafetyPolicyEvalItem[], monthIndex: number): number =>
  items.filter(item => item.months[monthIndex] === true).length;

/** 한 항목의 체크된 월 수 */
export const checkedMonthCount = (item: SiteSafetyPolicyEvalItem): number =>
  item.months.filter(Boolean).length;

/* ------------------------------------------------------------------ */
/* 표시 도우미                                                          */
/* ------------------------------------------------------------------ */

const KOREAN_ORDINALS = [
  '첫째',
  '둘째',
  '셋째',
  '넷째',
  '다섯째',
  '여섯째',
  '일곱째',
  '여덟째',
  '아홉째',
  '열째',
];

/** 0 → 첫째, 1 → 둘째 … (10개를 넘으면 숫자로 표기) */
export const koreanOrdinal = (index: number): string =>
  KOREAN_ORDINALS[index] ?? `${index + 1}번째`;

/** 2026-11-21 → 2026년 11월 21일 (서식 하단 표기) */
export const formatPolicyDate = (iso?: string): string => {
  if (!iso) return '';
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
};

/** 내용이 채워졌는지 (출력 전 확인용) */
export const hasSafetyPolicyContent = (policy: SiteSafetyPolicy): boolean =>
  Boolean(policy.statement.trim() || policy.goal.trim() || policy.actionPlans.some(p => p.trim()));

/** 채워진 세부추진계획 개수 */
export const countActionPlans = (policy: SiteSafetyPolicy): number =>
  policy.actionPlans.filter(p => p.trim()).length;
