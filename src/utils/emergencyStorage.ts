import {
  EmergencyPlan,
  EmergencyContact,
  ExternalAgency,
  DesignatedHospital,
  EmergencyGroup,
} from '../types';

/**
 * 현장별 비상연락망 게시판 저장소
 *
 * - LocalStorage 에 현장(siteId) 단위로 저장합니다.
 * - 지정병원 약도 이미지는 문서 저장소와 동일하게 IndexedDB 를 사용하므로
 *   EmergencyPlan.mapImageKey 에 파일 키만 보관합니다.
 */

const PLANS_KEY = 'gubo_emergency_plans';

type PlanMap = Record<string, EmergencyPlan>;

export const generateEmergencyId = (prefix = 'em'): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

/* ------------------------------------------------------------------ */
/* 기본 행 생성                                                        */
/* ------------------------------------------------------------------ */

export const createEmptyContact = (
  group: EmergencyGroup = '원청(현장)',
  role = '',
  duty = ''
): EmergencyContact => ({
  id: generateEmergencyId('ec'),
  group,
  role,
  name: '',
  phone: '',
  duty,
});

export const createEmptyAgency = (
  category = '',
  name = '',
  phone = '',
  note = ''
): ExternalAgency => ({
  id: generateEmergencyId('ea'),
  category,
  name,
  phone,
  note,
  autoFilled: false,
  verified: false,
});

export const createEmptyHospital = (
  category = '',
  name = ''
): DesignatedHospital => ({
  id: generateEmergencyId('eh'),
  category,
  name,
  erPhone: '',
  address: '',
  distance: '',
  autoFilled: false,
  verified: false,
});

/* ------------------------------------------------------------------ */
/* 기본 서식 (게시판 표준안)                                            */
/* ------------------------------------------------------------------ */

const defaultContacts = (): EmergencyContact[] => [
  createEmptyContact('원청(현장)', '현장소장 (안전보건관리책임자)', '비상조치 총괄 지휘, 작업중지 명령'),
  createEmptyContact('원청(현장)', '안전관리자', '초동 구호, 현장 통제, 유관기관 보고'),
  createEmptyContact('원청(현장)', '보건관리자 (해당 시)', '응급처치 및 의료기관 인계'),
  createEmptyContact('원청(현장)', '공사팀장', '복구 인력·장비 동원, 현장 지원'),
  createEmptyContact('원청(현장)', '공무팀장', '대외 행정 지원 및 기록 관리'),
  createEmptyContact('본사', '본사 안전보건 전담부서장', '사고 대응 지원 및 대외 기관 대응'),
  createEmptyContact('본사', '본사 대표이사 (경영책임자)', '중대재해 최종 보고 및 전사 지원 승인'),
  createEmptyContact('협력사', '(공종:      ) 현장대리인', '소속 근로자 인원 파악 및 대피 인솔'),
  createEmptyContact('협력사', '(공종:      ) 관리감독자', '작업 구역 통제 및 초동 조치'),
  createEmptyContact('협력사', '(공종:      ) 현장대리인', '소속 근로자 인원 파악 및 대피 인솔'),
];

const defaultAgencies = (): ExternalAgency[] => [
  createEmptyAgency('긴급 구조', '소방서 (화재·구조·구급)', '119', '관할: OO119안전센터'),
  createEmptyAgency('치안·교통', '경찰서 (사고·현장통제)', '112', '관할: OO지구대/파출소'),
  createEmptyAgency(
    '노동·안전',
    '관할 지방고용노동청',
    '',
    '산재예방지도과 / 광역중대재해수사과'
  ),
  createEmptyAgency('노동·안전', '한국산업안전보건공단', '1644-4544', '관할 지사'),
  createEmptyAgency(
    '지자체',
    '관할 시·군·구청 재난안전상황실',
    '',
    '시설물 붕괴, 도로·환경 사고 시'
  ),
  createEmptyAgency('유틸리티', '한국전력공사 (전기·감전)', '123', '관할 지사'),
  createEmptyAgency(
    '유틸리티',
    '도시가스 / 한국가스안전공사',
    '1544-4500',
    '지역 도시가스 긴급출동'
  ),
  createEmptyAgency('유틸리티', '상·하수도 사업소', '', '상수도관 파열·누수 시'),
  createEmptyAgency('유틸리티', '통신사 (광케이블·관로)', '100', 'KT 통신선로 파손 시'),
];

const defaultHospitals = (): DesignatedHospital[] => [
  createEmptyHospital('중증·야간 (24시 응급실)', 'OOO 병원 (권역/지역응급)'),
  createEmptyHospital('경상·주간 (산재지정)', 'OOO 정형외과/의원'),
];

/** 빈 서식 (현장명·주소만 미리 채움) */
export const createEmptyEmergencyPlan = (
  siteId: number,
  siteName: string,
  siteAddress = ''
): EmergencyPlan => ({
  siteId,
  siteName,
  constructionName: siteName,
  siteAddress,
  author: '',
  entryPoint: '현장 정문',
  mapImageKey: undefined,
  contacts: defaultContacts(),
  agencies: defaultAgencies(),
  hospitals: defaultHospitals(),
  updatedAt: '',
});

/* ------------------------------------------------------------------ */
/* 조회 / 저장                                                        */
/* ------------------------------------------------------------------ */

const readAll = (): PlanMap => {
  const raw = localStorage.getItem(PLANS_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as PlanMap) : {};
  } catch {
    return {};
  }
};

const persist = (map: PlanMap): void => {
  localStorage.setItem(PLANS_KEY, JSON.stringify(map));
};

/** 저장된 데이터에 누락된 필드가 있어도 안전하도록 보정 */
const normalize = (plan: EmergencyPlan, siteId: number, siteName: string): EmergencyPlan => ({
  ...createEmptyEmergencyPlan(siteId, siteName),
  ...plan,
  siteId,
  siteName: plan.siteName || siteName,
  constructionName: plan.constructionName || plan.siteName || siteName,
  contacts: Array.isArray(plan.contacts) ? plan.contacts : [],
  agencies: Array.isArray(plan.agencies) ? plan.agencies : [],
  hospitals: Array.isArray(plan.hospitals) ? plan.hospitals : [],
});

/** 비상연락망 조회 (없으면 기본 서식 반환) */
export const getEmergencyPlan = (
  siteId: number,
  siteName: string,
  siteAddress = ''
): EmergencyPlan => {
  const stored = readAll()[String(siteId)];
  if (!stored) return createEmptyEmergencyPlan(siteId, siteName, siteAddress);

  const normalized = normalize(stored, siteId, siteName);
  // 현장 주소가 비어 있으면 현장 기본정보의 주소로 보완
  if (!normalized.siteAddress && siteAddress) {
    normalized.siteAddress = siteAddress;
  }
  return normalized;
};

/** 비상연락망 저장 */
export const saveEmergencyPlan = (plan: EmergencyPlan): void => {
  const map = readAll();
  map[String(plan.siteId)] = { ...plan, updatedAt: new Date().toISOString() };
  persist(map);
};

/** 비상연락망 삭제 (기본 서식으로 되돌림) */
export const deleteEmergencyPlan = (siteId: number): void => {
  const map = readAll();
  delete map[String(siteId)];
  persist(map);
};

/** 입력된 내용이 있는지 (게시판 출력 전 확인용) */
export const hasEmergencyContent = (plan: EmergencyPlan): boolean =>
  Boolean(
    plan.contacts.some(c => c.name.trim() || c.phone.trim()) ||
      plan.agencies.some(a => a.phone.trim() && !a.phone.includes('OO')) ||
      plan.hospitals.some(h => h.address.trim() || h.erPhone.trim())
  );

/** 비상연락망상 실제 연락 가능한 인원 수 (요약 표시용) */
export const countFilledContacts = (plan: EmergencyPlan): number =>
  plan.contacts.filter(c => c.phone.trim()).length;
