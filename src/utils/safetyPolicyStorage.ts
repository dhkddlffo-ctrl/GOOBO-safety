import { SiteSafetyPolicy } from '../types';

/**
 * 현장별 현장소장 안전보건 경영방침 저장소
 *
 * - LocalStorage 에 `gubo_safety_policies` 키로 현장(siteId) 단위 저장합니다.
 * - 최초 진입 시 회사 서식(첨부파일)의 문구를 기본값으로 제공하고,
 *   현장소장이 문구를 고쳐 저장하면 그 내용이 그대로 출력됩니다.
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
  declaredAt: todayISO(),
  signerTitle: '현장소장',
  signerName,
  sealImageKey: undefined,
  updatedAt: '',
});

/** 오늘 날짜 (YYYY-MM-DD) */
function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

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

/** 저장된 데이터에 누락된 필드가 있어도 안전하도록 보정 */
const normalize = (
  policy: SiteSafetyPolicy,
  siteId: number,
  siteName: string,
): SiteSafetyPolicy => ({
  ...createEmptySafetyPolicy(siteId, siteName),
  ...policy,
  siteId,
  siteName: policy.siteName || siteName,
  actionPlans: Array.isArray(policy.actionPlans) ? policy.actionPlans : [],
});

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
