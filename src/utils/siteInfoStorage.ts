import { SiteInfo, SiteStaff } from '../types';

const SITE_INFO_KEY = 'gubo_site_info';

type SiteInfoMap = Record<string, SiteInfo>;

const readAll = (): SiteInfoMap => {
  const data = localStorage.getItem(SITE_INFO_KEY);
  return data ? JSON.parse(data) : {};
};

const persist = (map: SiteInfoMap): void => {
  localStorage.setItem(SITE_INFO_KEY, JSON.stringify(map));
};

/** 현장 기본정보 기본값 (현장명만 채워진 빈 서식) */
export const createEmptySiteInfo = (siteId: number, siteName: string): SiteInfo => ({
  siteId,
  siteName,
  address: '',
  constructionType: '',
  scale: '',
  contractPeriod: '',
  contractAmount: '',
  startDate: '',
  actualStartDate: '',
  clientName: '',
  developerName: '',
  contractorName: '',
  siteManager: '',
  siteOfficer: '',
  siteAddress: '',
  officePhone: '',
  safetyManagerPhone: '',
  workerCount: 0,
  staff: [],
  notes: '',
  updatedAt: '',
});

/** 저장된 데이터에 신규 필드가 없어도 안전하도록 보정 */
const normalize = (info: SiteInfo, siteId: number, siteName: string): SiteInfo => ({
  ...createEmptySiteInfo(siteId, siteName),
  ...info,
  siteId,
  siteName: info.siteName || siteName,
  staff: Array.isArray(info.staff) ? info.staff : [],
});

/** 현장 기본정보 조회 (없으면 빈 서식 반환) */
export const getSiteInfo = (siteId: number, siteName: string): SiteInfo => {
  const all = readAll();
  const stored = all[String(siteId)];
  if (!stored) return createEmptySiteInfo(siteId, siteName);
  return normalize(stored, siteId, siteName);
};

/** 현장 기본정보 저장 */
export const saveSiteInfo = (info: SiteInfo): void => {
  const all = readAll();
  all[String(info.siteId)] = { ...info, updatedAt: new Date().toISOString() };
  persist(all);
};

/** 현장 기본정보 입력 여부 (내용이 하나라도 채워졌는지) */
export const isSiteInfoFilled = (info: SiteInfo): boolean =>
  Boolean(
    info.address ||
      info.constructionType ||
      info.scale ||
      info.contractPeriod ||
      info.contractAmount ||
      info.startDate ||
      info.actualStartDate ||
      info.clientName ||
      info.developerName ||
      info.contractorName ||
      info.siteManager ||
      info.siteOfficer ||
      info.siteAddress ||
      info.officePhone ||
      info.safetyManagerPhone ||
      info.notes ||
      (info.staff && info.staff.length > 0)
  );

/* ------------------------------------------------------------------ */
/* 관리자(안전인력) 헬퍼                                                */
/* ------------------------------------------------------------------ */

export const generateStaffId = (): string =>
  `staff-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const createEmptyStaff = (role: SiteStaff['role'] = '안전관리자'): SiteStaff => ({
  id: generateStaffId(),
  role,
  name: '',
  phone: '',
  appointedAt: '',
  dismissedAt: '',
  trainingDate: '',
  newTraining8h: false,
  note: '',
});
